/**
 * Platform Rate Limits
 * Centralized rate limit configurations for all platform APIs.
 * 
 * Why: Single source of truth for rate limiting across the application.
 * These values are used by the API clients to throttle requests.
 */

import { type Platform } from '../platform-config';

export interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    requests: number;
    /** Time window in milliseconds */
    windowMs: number;
}

/**
 * Platform-specific rate limits based on official API documentation.
 * Uses uppercase Platform enum values for consistency with Prisma.
 */
export const PLATFORM_RATE_LIMITS: Record<Uppercase<Platform>, RateLimitConfig> = {
    INSTAGRAM: { requests: 200, windowMs: 3600000 },      // 200/hour
    FACEBOOK: { requests: 200, windowMs: 3600000 },       // 200/hour
    TIKTOK: { requests: 100, windowMs: 60000 },           // 100/min
    YOUTUBE: { requests: 10000, windowMs: 86400000 },     // 10k/day (units)
    PINTEREST: { requests: 1000, windowMs: 3600000 },     // 1000/hour
    LINKEDIN: { requests: 100, windowMs: 60000 },         // 100/min
    BLUESKY: { requests: 300, windowMs: 300000 },         // 300/5min
    GOOGLE_BUSINESS: { requests: 100, windowMs: 60000 },  // ~100/min
    THREADS: { requests: 200, windowMs: 3600000 },        // 200/hour (same tier as Instagram)
};

/**
 * Get rate limit for a platform (accepts lowercase or uppercase)
 */
export function getRateLimit(platform: string): RateLimitConfig {
    const key = platform.toUpperCase() as Uppercase<Platform>;
    return PLATFORM_RATE_LIMITS[key] ?? { requests: 100, windowMs: 60000 };
}
