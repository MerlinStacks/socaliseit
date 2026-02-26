/**
 * Circuit Breaker for Platform APIs
 *
 * Why: Without a circuit breaker, a degraded platform (e.g., Instagram during
 * an outage) causes every publish attempt to hang for the full timeout (14 min)
 * before failing. This wastes worker capacity and delays other posts. The
 * circuit breaker "trips" after repeated failures, immediately rejecting
 * requests until the platform recovers.
 *
 * State is stored in Redis so it's shared across all BullMQ workers.
 */

import { getRedisConnection } from '@/lib/bullmq/connection';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CircuitBreakerConfig {
    /** Number of failures within the rolling window to trip the breaker */
    failureThreshold: number;
    /** Rolling window size in seconds for counting failures */
    windowSeconds: number;
    /** How long (seconds) to stay in OPEN before probing with HALF_OPEN */
    resetTimeoutSeconds: number;
    /** Number of successful probes in HALF_OPEN to return to CLOSED */
    halfOpenSuccessThreshold: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    windowSeconds: 300,       // 5-minute window
    resetTimeoutSeconds: 120, // 2-minute cooldown before probing
    halfOpenSuccessThreshold: 2,
};

/** Per-platform config overrides */
const PLATFORM_OVERRIDES: Record<string, Partial<CircuitBreakerConfig>> = {
    // Why: Instagram API is notoriously slow — give it more grace before tripping
    instagram: { failureThreshold: 8, resetTimeoutSeconds: 180 },
    // Why: TikTok has aggressive rate limits — trip faster but recover quicker
    tiktok: { failureThreshold: 4, resetTimeoutSeconds: 90 },
};

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitStatus {
    state: CircuitState;
    failureCount: number;
    lastFailureAt: number | null;
    openedAt: number | null;
    halfOpenSuccesses: number;
}

// ---------------------------------------------------------------------------
// Redis Keys
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'circuit:';
const stateKey = (platform: string) => `${KEY_PREFIX}${platform}:state`;
const failuresKey = (platform: string) => `${KEY_PREFIX}${platform}:failures`;
const openedAtKey = (platform: string) => `${KEY_PREFIX}${platform}:opened_at`;
const halfOpenSuccessKey = (platform: string) => `${KEY_PREFIX}${platform}:half_open_ok`;

// ---------------------------------------------------------------------------
// Core Circuit Breaker
// ---------------------------------------------------------------------------

/**
 * Get the effective config for a platform (defaults + per-platform overrides).
 */
function getConfig(platform: string): CircuitBreakerConfig {
    return { ...DEFAULT_CONFIG, ...(PLATFORM_OVERRIDES[platform.toLowerCase()] ?? {}) };
}

/**
 * Get the current circuit breaker state for a platform.
 */
export async function getCircuitStatus(platform: string): Promise<CircuitStatus> {
    const redis = getRedisConnection();
    const normalised = platform.toLowerCase();

    try {
        const [state, failures, openedAt, halfOpenOk] = await Promise.all([
            redis.get(stateKey(normalised)),
            redis.get(failuresKey(normalised)),
            redis.get(openedAtKey(normalised)),
            redis.get(halfOpenSuccessKey(normalised)),
        ]);

        return {
            state: (state as CircuitState) || 'CLOSED',
            failureCount: parseInt(failures || '0', 10),
            lastFailureAt: null, // Not tracked separately — failures list has timestamps
            openedAt: openedAt ? parseInt(openedAt, 10) : null,
            halfOpenSuccesses: parseInt(halfOpenOk || '0', 10),
        };
    } catch (error) {
        logger.error({ platform, error }, 'Failed to read circuit breaker state');
        // Why: Fail-open — if Redis is down, allow the call through
        return { state: 'CLOSED', failureCount: 0, lastFailureAt: null, openedAt: null, halfOpenSuccesses: 0 };
    }
}

/**
 * Record a successful call — may transition HALF_OPEN → CLOSED.
 */
export async function recordSuccess(platform: string): Promise<void> {
    const redis = getRedisConnection();
    const normalised = platform.toLowerCase();
    const config = getConfig(normalised);

    try {
        const state = await redis.get(stateKey(normalised));

        if (state === 'HALF_OPEN') {
            const successes = await redis.incr(halfOpenSuccessKey(normalised));

            if (successes >= config.halfOpenSuccessThreshold) {
                // Why: Enough successful probes — platform has recovered
                await transitionTo(normalised, 'CLOSED');
                logger.info({ platform }, 'Circuit breaker CLOSED — platform recovered');
            }
        }
    } catch (error) {
        logger.error({ platform, error }, 'Failed to record circuit breaker success');
    }
}

/**
 * Record a failed call — may transition CLOSED → OPEN.
 */
export async function recordFailure(platform: string): Promise<void> {
    const redis = getRedisConnection();
    const normalised = platform.toLowerCase();
    const config = getConfig(normalised);

    try {
        const state = await redis.get(stateKey(normalised));

        if (state === 'HALF_OPEN') {
            // Why: Failure during probe — back to OPEN immediately
            await transitionTo(normalised, 'OPEN');
            logger.warn({ platform }, 'Circuit breaker re-OPENED — half-open probe failed');
            return;
        }

        // Increment failure counter in rolling window
        const pipeline = redis.multi();
        pipeline.incr(failuresKey(normalised));
        pipeline.expire(failuresKey(normalised), config.windowSeconds, 'NX');
        const results = await pipeline.exec();

        const currentFailures = (results?.[0]?.[1] as number) || 0;

        if (currentFailures >= config.failureThreshold) {
            await transitionTo(normalised, 'OPEN');
            logger.warn(
                { platform, failures: currentFailures, threshold: config.failureThreshold },
                'Circuit breaker OPENED — failure threshold exceeded',
            );
        }
    } catch (error) {
        logger.error({ platform, error }, 'Failed to record circuit breaker failure');
    }
}

/**
 * Check if a call is allowed through the circuit breaker.
 * May transition OPEN → HALF_OPEN if the reset timeout has elapsed.
 *
 * @returns true if the call should proceed, false if blocked
 */
export async function isCallAllowed(platform: string): Promise<boolean> {
    const redis = getRedisConnection();
    const normalised = platform.toLowerCase();
    const config = getConfig(normalised);

    try {
        const state = await redis.get(stateKey(normalised));

        if (!state || state === 'CLOSED') {
            return true;
        }

        if (state === 'HALF_OPEN') {
            // Why: Allow the probe request through in HALF_OPEN
            return true;
        }

        // State is OPEN — check if reset timeout has elapsed
        const opened = await redis.get(openedAtKey(normalised));
        if (opened) {
            const elapsed = Date.now() - parseInt(opened, 10);
            if (elapsed >= config.resetTimeoutSeconds * 1000) {
                // Why: Enough time has passed — transition to HALF_OPEN for probing
                await transitionTo(normalised, 'HALF_OPEN');
                logger.info({ platform, elapsedMs: elapsed }, 'Circuit breaker HALF_OPEN — probing');
                return true;
            }
        }

        return false;
    } catch (error) {
        logger.error({ platform, error }, 'Failed to check circuit breaker — allowing call (fail-open)');
        return true;
    }
}

// ---------------------------------------------------------------------------
// State Transitions
// ---------------------------------------------------------------------------

/**
 * Transition the circuit breaker to a new state atomically.
 */
async function transitionTo(platform: string, newState: CircuitState): Promise<void> {
    const redis = getRedisConnection();
    const config = getConfig(platform);

    const pipeline = redis.multi();
    pipeline.set(stateKey(platform), newState);

    if (newState === 'OPEN') {
        pipeline.set(openedAtKey(platform), Date.now().toString());
        // Why: Clear half-open success counter when re-opening
        pipeline.del(halfOpenSuccessKey(platform));
    } else if (newState === 'HALF_OPEN') {
        pipeline.set(halfOpenSuccessKey(platform), '0');
    } else if (newState === 'CLOSED') {
        // Why: Clean up all circuit breaker keys on recovery
        pipeline.del(failuresKey(platform));
        pipeline.del(openedAtKey(platform));
        pipeline.del(halfOpenSuccessKey(platform));
    }

    // Why: Auto-expire all circuit state after 2× the reset timeout.
    // Prevents stale keys from lingering after long platform recoveries.
    const ttl = config.resetTimeoutSeconds * 2;
    pipeline.expire(stateKey(platform), ttl);

    await pipeline.exec();
}

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

/**
 * Custom error thrown when the circuit breaker is open.
 */
export class CircuitOpenError extends Error {
    public readonly platform: string;

    constructor(platform: string) {
        super(`Circuit breaker is OPEN for ${platform} — platform appears degraded, skipping to protect system`);
        this.name = 'CircuitOpenError';
        this.platform = platform;
    }
}

/**
 * Execute an operation with circuit breaker protection.
 *
 * @param platform - Platform name for circuit tracking
 * @param operation - The async operation to execute
 * @returns The operation's return value
 * @throws CircuitOpenError if the circuit is open
 */
export async function withCircuitBreaker<T>(
    platform: string,
    operation: () => Promise<T>,
): Promise<T> {
    const allowed = await isCallAllowed(platform);

    if (!allowed) {
        throw new CircuitOpenError(platform);
    }

    try {
        const result = await operation();
        await recordSuccess(platform);
        return result;
    } catch (error) {
        // Why: Don't count CircuitOpenErrors from nested calls as failures
        if (!(error instanceof CircuitOpenError)) {
            await recordFailure(platform);
        }
        throw error;
    }
}
