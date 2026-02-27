/**
 * Rate Limiter
 * Redis-backed sliding window rate limiting for API protection
 */

import { getRedisConnection } from '@/lib/bullmq/connection';
import { logger } from '@/lib/logger';

export interface RateLimitConfig {
    /** Maximum number of requests allowed in the window */
    max: number;
    /** Window duration in seconds */
    windowSeconds: number;
    /** Optional prefix for Redis keys */
    prefix?: string;
}

export interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Number of remaining requests in the window */
    remaining: number;
    /** Unix timestamp when the limit resets */
    resetAt: number;
    /** Total limit for the window */
    limit: number;
}

/** Default rate limit: 100 requests per minute */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
    max: 100,
    windowSeconds: 60,
    prefix: 'ratelimit',
};

/** Stricter limit for auth routes: 10 requests per minute */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
    max: 10,
    windowSeconds: 60,
    prefix: 'ratelimit:auth',
};

/** Very strict limit for expensive operations: 5 requests per minute */
export const EXPENSIVE_RATE_LIMIT: RateLimitConfig = {
    max: 5,
    windowSeconds: 60,
    prefix: 'ratelimit:expensive',
};

/**
 * Check if a request should be rate limited using sliding window algorithm.
 * 
 * @param identifier - Unique identifier for the client (IP, user ID, API key)
 * @param config - Rate limit configuration
 * @returns Rate limit result with remaining quota
 */
export async function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<RateLimitResult> {
    const redis = getRedisConnection();
    const key = `${config.prefix}:${identifier}`;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;

    try {
        /**
         * Lua script for atomic sliding-window rate limiting.
         * Why: The previous pipeline always added the request (zadd) even when
         * over-limit, meaning rejected requests consumed quota. This script
         * only adds the entry when the count is below the limit.
         *
         * KEYS[1] = rate limit key
         * ARGV[1] = window start timestamp
         * ARGV[2] = current timestamp
         * ARGV[3] = max allowed requests
         * ARGV[4] = unique member value
         * ARGV[5] = TTL in seconds
         *
         * Returns: current count (before potential add)
         */
        const luaScript = `
            redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
            local count = redis.call('ZCARD', KEYS[1])
            if count < tonumber(ARGV[3]) then
                redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
                redis.call('EXPIRE', KEYS[1], ARGV[5])
            end
            return count
        `;

        const windowStart = now - windowMs;
        const member = `${now}:${Math.random()}`;

        const currentCount = (await redis.eval(
            luaScript,
            1,
            key,
            String(windowStart),
            String(now),
            String(config.max),
            member,
            String(config.windowSeconds)
        )) as number;

        const allowed = currentCount < config.max;
        const remaining = Math.max(0, config.max - currentCount - (allowed ? 1 : 0));
        const resetAt = Math.ceil((now + windowMs) / 1000);

        if (!allowed) {
            logger.warn({ identifier, limit: config.max, windowSeconds: config.windowSeconds }, 'Rate limit exceeded');
        }

        return {
            allowed,
            remaining,
            resetAt,
            limit: config.max,
        };
    } catch (error) {
        // Why (BUG-09): Previously all rate-limit failures were fail-open, which meant
        // a Redis outage disabled brute-force protection on auth routes. Now auth
        // rate limits (prefix 'ratelimit:auth') fail closed while others fail open.
        const isAuthRoute = (config.prefix ?? '').includes('auth');
        if (isAuthRoute) {
            logger.error({ err: error, identifier }, 'Rate limit check failed on auth route, denying request');
            return {
                allowed: false,
                remaining: 0,
                resetAt: Math.ceil((now + windowMs) / 1000),
                limit: config.max,
            };
        }

        logger.error({ err: error, identifier }, 'Rate limit check failed, allowing request');
        return {
            allowed: true,
            remaining: config.max,
            resetAt: Math.ceil((now + windowMs) / 1000),
            limit: config.max,
        };
    }
}

/**
 * Get the client IP from request headers.
 *
 * Why: Header trust order matters for security. Cloudflare's cf-connecting-ip
 * is set by the CDN and cannot be spoofed by clients. x-forwarded-for CAN be
 * spoofed by clients if there's no reverse proxy stripping it, so it's checked
 * last. Without this ordering, an attacker can bypass rate limiting by rotating
 * the x-forwarded-for value on each request.
 *
 * @param headers - Request headers
 * @returns Client IP address
 */
export function getClientIp(headers: Headers): string {
    // 1. Cloudflare: set by CDN, cannot be spoofed by clients
    const cfConnectingIp = headers.get('cf-connecting-ip');
    if (cfConnectingIp) {
        return cfConnectingIp.trim();
    }

    // 2. Fly.io / Vercel: set by platform proxy
    const flyClientIp = headers.get('fly-client-ip');
    if (flyClientIp) {
        return flyClientIp.trim();
    }

    // 3. x-real-ip: typically set by nginx/reverse-proxy
    const realIp = headers.get('x-real-ip');
    if (realIp) {
        return realIp.trim();
    }

    // 4. x-forwarded-for: spoofable if no trusted proxy strips it.
    // Only use as last resort; take the LAST IP (closest proxy) not the first.
    // Why: The first IP in the chain is client-supplied and can be forged.
    // The last IP is added by the nearest trusted proxy.
    //
    // WARNING (BUG-13): This is only correct with EXACTLY 1 trusted proxy between
    // the client and this app. With 2+ proxies (e.g., Cloudflare → nginx → app),
    // the last IP would be the inner proxy, not the client. If you add multiple
    // proxies, use the platform-specific headers above (cf-connecting-ip, fly-client-ip)
    // or configure a TRUSTED_PROXY_COUNT env var and use: ips[ips.length - TRUSTED_PROXY_COUNT]
    const forwardedFor = headers.get('x-forwarded-for');
    if (forwardedFor) {
        const ips = forwardedFor.split(',').map(ip => ip.trim());
        const trustedProxyCount = parseInt(process.env.TRUSTED_PROXY_COUNT || '1', 10);
        const clientIndex = Math.max(0, ips.length - trustedProxyCount);
        return ips[clientIndex];
    }

    return 'unknown';
}

/**
 * Create rate limit headers for the response.
 * 
 * @param result - Rate limit check result
 * @returns Headers object to merge with response
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt),
    };
}
