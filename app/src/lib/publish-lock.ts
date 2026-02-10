/**
 * Publishing Lock Service
 * Prevents double-publish race conditions using Redis distributed locks.
 *
 * Why: Users clicking "Publish" twice rapidly, or two workers picking up
 * the same scheduled job, could result in duplicate posts on social platforms.
 */

import { getRedisConnection } from '@/lib/bullmq/connection';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

/** Lock TTL in seconds - prevents deadlocks if worker crashes */
const LOCK_TTL_SECONDS = 300; // 5 minutes

/** Lock key prefix */
const LOCK_PREFIX = 'publish-lock:';

/**
 * Acquire a publishing lock for a post.
 * Uses Redis SET NX (set if not exists) for atomic lock acquisition.
 *
 * @param postId - The post ID to lock
 * @returns Lock token if acquired, null if already locked
 */
export async function acquirePublishLock(postId: string): Promise<string | null> {
    const redis = getRedisConnection();
    const lockKey = `${LOCK_PREFIX}${postId}`;
    const lockToken = crypto.randomUUID();

    try {
        // SET NX with expiry - atomic operation
        const result = await redis.set(lockKey, lockToken, 'EX', LOCK_TTL_SECONDS, 'NX');

        if (result === 'OK') {
            logger.info({ postId, lockToken }, 'Publishing lock acquired');
            return lockToken;
        }

        // Lock already held
        const existingToken = await redis.get(lockKey);
        logger.warn({ postId, existingToken }, 'Publishing lock already held');
        return null;
    } catch (error) {
        logger.error({ postId, error }, 'Failed to acquire publishing lock');
        // On Redis failure, allow the publish to proceed (fail-open for availability)
        // The database status check provides a secondary guard
        return `fallback-${Date.now()}`;
    }
}

/**
 * Release a publishing lock.
 * Only releases if the lock token matches (prevents releasing another process's lock).
 *
 * @param postId - The post ID to unlock
 * @param lockToken - The token returned by acquirePublishLock
 */
export async function releasePublishLock(postId: string, lockToken: string): Promise<void> {
    const redis = getRedisConnection();
    const lockKey = `${LOCK_PREFIX}${postId}`;

    try {
        // Lua script for atomic check-and-delete
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;

        const result = await redis.eval(script, 1, lockKey, lockToken);

        if (result === 1) {
            logger.info({ postId }, 'Publishing lock released');
        } else {
            logger.warn({ postId }, 'Lock not held or token mismatch during release');
        }
    } catch (error) {
        logger.error({ postId, error }, 'Failed to release publishing lock');
        // Non-fatal - lock will expire via TTL
    }
}

/**
 * Check if a post is currently locked for publishing.
 *
 * @param postId - The post ID to check
 * @returns true if locked, false otherwise
 */
export async function isPublishLocked(postId: string): Promise<boolean> {
    const redis = getRedisConnection();
    const lockKey = `${LOCK_PREFIX}${postId}`;

    try {
        const exists = await redis.exists(lockKey);
        return exists === 1;
    } catch (error) {
        logger.error({ postId, error }, 'Failed to check publishing lock');
        return false; // Fail-open
    }
}

/**
 * Force release a publishing lock regardless of token.
 * Use ONLY for retry scenarios where we know the previous attempt failed.
 *
 * @param postId - The post ID to unlock
 */
export async function forceReleasePublishLock(postId: string): Promise<void> {
    const redis = getRedisConnection();
    const lockKey = `${LOCK_PREFIX}${postId}`;

    try {
        const deleted = await redis.del(lockKey);
        if (deleted === 1) {
            logger.info({ postId }, 'Publishing lock force-released for retry');
        } else {
            logger.info({ postId }, 'No lock found to force-release');
        }
    } catch (error) {
        logger.error({ postId, error }, 'Failed to force-release publishing lock');
    }
}

/**
 * Execute an operation with a publishing lock.
 * Automatically acquires and releases the lock.
 *
 * @param postId - The post ID to lock
 * @param operation - The async operation to execute
 * @returns The result of the operation, or throws if lock not acquired
 */
export async function withPublishLock<T>(
    postId: string,
    operation: () => Promise<T>
): Promise<T> {
    const lockToken = await acquirePublishLock(postId);

    if (!lockToken) {
        throw new Error(`Post ${postId} is already being published`);
    }

    try {
        return await operation();
    } finally {
        await releasePublishLock(postId, lockToken);
    }
}
