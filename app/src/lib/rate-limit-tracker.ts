/**
 * Rate Limit Tracker
 * Tracks API rate limits per platform and provides graceful handling.
 *
 * Why: Social media APIs have strict rate limits (e.g., Instagram 200 calls/hour).
 * Hitting limits mid-batch causes silent failures. This tracker enables:
 * - Proactive rate limit checking before operations
 * - Graceful retry scheduling when limits are hit
 * - Per-platform quota management
 */

import { getRedisConnection } from '@/lib/bullmq/connection';
import { logger } from '@/lib/logger';

/** Rate limit window in seconds */
const RATE_LIMIT_WINDOW = 3600; // 1 hour

/** Platform-specific rate limits (calls per hour) */
const PLATFORM_LIMITS: Record<string, number> = {
    instagram: 200,
    facebook: 200,
    tiktok: 100,
    pinterest: 100,
    youtube: 1000,
    linkedin: 100,
    twitter: 300,
};

/** Redis key prefix for rate limit tracking */
const RATE_LIMIT_PREFIX = 'rate-limit:';

/**
 * Rate limit status for a platform.
 */
export interface RateLimitStatus {
    /** Current number of calls made in the window */
    current: number;
    /** Maximum allowed calls */
    limit: number;
    /** Remaining calls available */
    remaining: number;
    /** Seconds until the rate limit resets */
    resetInSeconds: number;
    /** Whether the limit has been exceeded */
    isLimited: boolean;
}

/**
 * Get the current rate limit status for a platform.
 *
 * @param platform - Platform name (lowercase)
 * @param accountId - Optional account ID for per-account tracking
 */
export async function getRateLimitStatus(
    platform: string,
    accountId?: string
): Promise<RateLimitStatus> {
    const redis = getRedisConnection();
    const key = accountId
        ? `${RATE_LIMIT_PREFIX}${platform}:${accountId}`
        : `${RATE_LIMIT_PREFIX}${platform}`;

    const limit = PLATFORM_LIMITS[platform] || 100;

    try {
        const current = parseInt(await redis.get(key) || '0', 10);
        const ttl = await redis.ttl(key);
        const resetInSeconds = ttl > 0 ? ttl : RATE_LIMIT_WINDOW;

        return {
            current,
            limit,
            remaining: Math.max(0, limit - current),
            resetInSeconds,
            isLimited: current >= limit,
        };
    } catch (error) {
        logger.error({ platform, error }, 'Failed to get rate limit status');
        // Fail-open: assume not limited
        return {
            current: 0,
            limit,
            remaining: limit,
            resetInSeconds: RATE_LIMIT_WINDOW,
            isLimited: false,
        };
    }
}

/**
 * Increment the rate limit counter for a platform.
 * Call this after each API call.
 *
 * @param platform - Platform name (lowercase)
 * @param accountId - Optional account ID for per-account tracking
 * @param count - Number of calls to add (default: 1)
 */
export async function incrementRateLimit(
    platform: string,
    accountId?: string,
    count: number = 1
): Promise<void> {
    const redis = getRedisConnection();
    const key = accountId
        ? `${RATE_LIMIT_PREFIX}${platform}:${accountId}`
        : `${RATE_LIMIT_PREFIX}${platform}`;

    try {
        /**
         * Why: Atomic pipeline — INCRBY auto-creates the key if missing,
         * and EXPIRE with 'NX' sets the TTL only on the first call.
         * Eliminates the race window in the previous exists→setex pattern.
         */
        const pipeline = redis.multi();
        pipeline.incrby(key, count);
        pipeline.expire(key, RATE_LIMIT_WINDOW, 'NX');
        await pipeline.exec();
    } catch (error) {
        logger.error({ platform, error }, 'Failed to increment rate limit');
        // Non-fatal
    }
}

/**
 * Check if we can make an API call, and if so, increment the counter.
 * Returns true if the call is allowed, false if rate limited.
 *
 * @param platform - Platform name (lowercase)
 * @param accountId - Optional account ID for per-account tracking
 */
export async function checkAndConsumeRateLimit(
    platform: string,
    accountId?: string
): Promise<boolean> {
    const status = await getRateLimitStatus(platform, accountId);

    if (status.isLimited) {
        logger.warn({ platform, accountId, ...status }, 'Rate limit exceeded');
        return false;
    }

    await incrementRateLimit(platform, accountId);
    return true;
}

/**
 * Calculate delay in milliseconds until rate limit resets.
 * Useful for scheduling retries.
 *
 * @param platform - Platform name (lowercase)
 * @param accountId - Optional account ID
 */
export async function getRetryDelay(
    platform: string,
    accountId?: string
): Promise<number> {
    const status = await getRateLimitStatus(platform, accountId);

    if (!status.isLimited) {
        return 0; // No delay needed
    }

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 30000; // Up to 30 seconds
    return (status.resetInSeconds * 1000) + jitter;
}

/**
 * Handle a 429 (Too Many Requests) response from a platform.
 * Parses retry-after headers and updates internal tracking.
 *
 * @param platform - Platform name
 * @param response - The HTTP response (optional, for header parsing)
 * @param accountId - Optional account ID
 */
export async function handle429Response(
    platform: string,
    response?: Response,
    accountId?: string
): Promise<{ retryAfterMs: number }> {
    const redis = getRedisConnection();
    const key = accountId
        ? `${RATE_LIMIT_PREFIX}${platform}:${accountId}`
        : `${RATE_LIMIT_PREFIX}${platform}`;

    // Try to parse retry-after header
    let retryAfterSeconds = RATE_LIMIT_WINDOW;
    if (response) {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) {
                retryAfterSeconds = parsed;
            }
        }
    }

    // Update our tracking to reflect the limit
    const limit = PLATFORM_LIMITS[platform] || 100;
    try {
        await redis.setex(key, retryAfterSeconds, limit.toString());
    } catch (error) {
        logger.error({ platform, error }, 'Failed to update rate limit after 429');
    }

    logger.warn({ platform, accountId, retryAfterSeconds }, 'Received 429, rate limited');

    return { retryAfterMs: retryAfterSeconds * 1000 };
}

/**
 * Wrap an API operation with rate limit checking.
 * Throws a RateLimitError if the limit is exceeded.
 *
 * @param platform - Platform name
 * @param accountId - Account ID
 * @param operation - The API operation to perform
 */
export async function withRateLimitCheck<T>(
    platform: string,
    accountId: string,
    operation: () => Promise<T>
): Promise<T> {
    const allowed = await checkAndConsumeRateLimit(platform, accountId);

    if (!allowed) {
        const status = await getRateLimitStatus(platform, accountId);
        const error = new RateLimitError(platform, status.resetInSeconds);
        throw error;
    }

    return operation();
}

/**
 * Custom error class for rate limit errors.
 * Includes the platform and retry delay for handling.
 */
export class RateLimitError extends Error {
    public readonly platform: string;
    public readonly retryAfterSeconds: number;

    constructor(platform: string, retryAfterSeconds: number) {
        super(`Rate limit exceeded for ${platform}. Retry after ${retryAfterSeconds} seconds.`);
        this.name = 'RateLimitError';
        this.platform = platform;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
