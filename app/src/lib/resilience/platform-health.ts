/**
 * Platform Health Tracker
 *
 * Why: Tracks a rolling success/failure ratio per platform so the system can
 * surface degradation warnings in the UI (e.g., "TikTok is experiencing issues")
 * and make informed scheduling decisions. Uses Redis lists with a fixed window
 * of the last N outcomes per platform.
 */

import { getRedisConnection } from '@/lib/bullmq/connection';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Number of recent outcomes to track per platform */
const ROLLING_WINDOW_SIZE = 100;

/** Redis key prefix */
const HEALTH_PREFIX = 'health:';

/** TTL for health keys — auto-expire if platform isn't used */
const HEALTH_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/** Health state thresholds */
const THRESHOLDS = {
    /** Score above this = healthy */
    healthy: 80,
    /** Score above this but below healthy = degraded */
    degraded: 50,
    /** Score at or below this = down */
    down: 50,
};

export type HealthState = 'healthy' | 'degraded' | 'down';

export interface PlatformHealthStatus {
    platform: string;
    /** Score from 0-100 based on recent success rate */
    score: number;
    /** Mapped health state */
    state: HealthState;
    /** Number of recent successes */
    successes: number;
    /** Number of recent failures */
    failures: number;
    /** Total outcomes in the rolling window */
    total: number;
    /** ISO timestamp of last recorded outcome */
    lastUpdated: string | null;
}

// ---------------------------------------------------------------------------
// Tracked Platforms
// ---------------------------------------------------------------------------

const ALL_PLATFORMS = [
    'instagram', 'tiktok', 'youtube', 'facebook',
    'pinterest', 'linkedin', 'bluesky', 'threads', 'google_business',
];

// ---------------------------------------------------------------------------
// Core Operations
// ---------------------------------------------------------------------------

/**
 * Record a publish outcome (success or failure) for a platform.
 *
 * @param platform - Platform name (lowercase)
 * @param success - Whether the operation succeeded
 */
export async function recordOutcome(platform: string, success: boolean): Promise<void> {
    const redis = getRedisConnection();
    const normalised = platform.toLowerCase();
    const listKey = `${HEALTH_PREFIX}${normalised}:outcomes`;
    const tsKey = `${HEALTH_PREFIX}${normalised}:last_updated`;

    try {
        const pipeline = redis.multi();

        // Why: LPUSH + LTRIM maintains a fixed-size rolling window.
        // '1' = success, '0' = failure — single-char for memory efficiency.
        pipeline.lpush(listKey, success ? '1' : '0');
        pipeline.ltrim(listKey, 0, ROLLING_WINDOW_SIZE - 1);
        pipeline.set(tsKey, new Date().toISOString());
        pipeline.expire(listKey, HEALTH_TTL_SECONDS);
        pipeline.expire(tsKey, HEALTH_TTL_SECONDS);

        await pipeline.exec();
    } catch (error) {
        // Why: Health tracking is observational — failures must not affect publishing
        logger.error({ platform: normalised, error }, 'Failed to record health outcome');
    }
}

/**
 * Get the health status for a single platform.
 *
 * @param platform - Platform name (lowercase)
 */
export async function getHealthStatus(platform: string): Promise<PlatformHealthStatus> {
    const redis = getRedisConnection();
    const normalised = platform.toLowerCase();
    const listKey = `${HEALTH_PREFIX}${normalised}:outcomes`;
    const tsKey = `${HEALTH_PREFIX}${normalised}:last_updated`;

    try {
        const [outcomes, lastUpdated] = await Promise.all([
            redis.lrange(listKey, 0, ROLLING_WINDOW_SIZE - 1),
            redis.get(tsKey),
        ]);

        if (outcomes.length === 0) {
            // No data — assume healthy
            return {
                platform: normalised,
                score: 100,
                state: 'healthy',
                successes: 0,
                failures: 0,
                total: 0,
                lastUpdated: null,
            };
        }

        const successes = outcomes.filter((o) => o === '1').length;
        const failures = outcomes.length - successes;
        const score = Math.round((successes / outcomes.length) * 100);

        return {
            platform: normalised,
            score,
            state: mapScoreToState(score),
            successes,
            failures,
            total: outcomes.length,
            lastUpdated,
        };
    } catch (error) {
        logger.error({ platform: normalised, error }, 'Failed to get health status');
        return {
            platform: normalised,
            score: 100,
            state: 'healthy',
            successes: 0,
            failures: 0,
            total: 0,
            lastUpdated: null,
        };
    }
}

/**
 * Get health status for all tracked platforms.
 */
export async function getAllPlatformHealth(): Promise<PlatformHealthStatus[]> {
    return Promise.all(ALL_PLATFORMS.map(getHealthStatus));
}

/**
 * Check if a platform is healthy enough to publish to.
 * Returns false if the platform is in 'down' state.
 *
 * @param platform - Platform name
 * @returns Whether publishing should proceed
 */
export async function isPlatformHealthy(platform: string): Promise<boolean> {
    const status = await getHealthStatus(platform);
    return status.state !== 'down';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a numeric score to a health state label.
 */
function mapScoreToState(score: number): HealthState {
    if (score >= THRESHOLDS.healthy) return 'healthy';
    if (score > THRESHOLDS.down) return 'degraded';
    return 'down';
}
