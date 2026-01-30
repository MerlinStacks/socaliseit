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
    const windowStart = now - windowMs;

    try {
        // Use a transaction for atomicity
        const pipeline = redis.pipeline();

        // Remove expired entries
        pipeline.zremrangebyscore(key, 0, windowStart);

        // Count current requests in window
        pipeline.zcard(key);

        // Add current request
        pipeline.zadd(key, now, `${now}:${Math.random()}`);

        // Set expiry on the key
        pipeline.expire(key, config.windowSeconds);

        const results = await pipeline.exec();

        // Get the count before adding current request
        const currentCount = (results?.[1]?.[1] as number) || 0;
        const allowed = currentCount < config.max;
        const remaining = Math.max(0, config.max - currentCount - 1);
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
        // On Redis error, fail open (allow request) but log
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
 * Handles common proxy headers.
 * 
 * @param headers - Request headers
 * @returns Client IP address
 */
export function getClientIp(headers: Headers): string {
    // Check common proxy headers
    const forwardedFor = headers.get('x-forwarded-for');
    if (forwardedFor) {
        // Get first IP in chain (original client)
        return forwardedFor.split(',')[0].trim();
    }

    const realIp = headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }

    const cfConnectingIp = headers.get('cf-connecting-ip');
    if (cfConnectingIp) {
        return cfConnectingIp;
    }

    // Fallback
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
