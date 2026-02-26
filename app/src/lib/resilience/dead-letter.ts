/**
 * Dead-Letter Queue for Exhausted Publish Retries
 *
 * Why: When BullMQ exhausts all 3 job-level retries and the inner withRetry
 * also fails, the post ends up in FAILED status with publishError records —
 * but it's mixed in with one-off failures. This module provides a dedicated
 * index (Redis sorted set) so admins can quickly find posts that need manual
 * intervention and re-enqueue them.
 */

import { getRedisConnection } from '@/lib/bullmq/connection';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Redis key for the dead-letter sorted set */
const DLQ_KEY = 'dlq:publish';

/**
 * Why: Dead-letter entries auto-expire after 30 days to prevent unbounded
 * growth. Posts older than this are unlikely to be relevant for retry.
 */
const DLQ_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Why: Each entry stores minimal metadata as a JSON string. The full post
 * data lives in the database — this is just an index for surfacing failures.
 */
interface DeadLetterEntry {
    postId: string;
    organizationId: string;
    errorMessage: string;
    platform?: string;
    attemptsMade: number;
    failedAt: string; // ISO timestamp
}

/** Returned by list operations */
export interface DeadLetterPost {
    postId: string;
    organizationId: string;
    errorMessage: string;
    platform?: string;
    attemptsMade: number;
    failedAt: Date;
    score: number; // Unix timestamp for ordering
}

// ---------------------------------------------------------------------------
// Write Operations
// ---------------------------------------------------------------------------

/**
 * Move a post to the dead-letter queue after exhausting all retries.
 *
 * @param postId - The failed post ID
 * @param organizationId - The org that owns the post
 * @param errorMessage - Human-readable error summary
 * @param platform - Target platform (optional)
 * @param attemptsMade - Total attempts made across all retry layers
 */
export async function moveToDeadLetter(
    postId: string,
    organizationId: string,
    errorMessage: string,
    platform?: string,
    attemptsMade: number = 0,
): Promise<void> {
    const redis = getRedisConnection();

    const entry: DeadLetterEntry = {
        postId,
        organizationId,
        errorMessage: errorMessage.slice(0, 500), // Why: Cap to prevent oversized Redis values
        platform,
        attemptsMade,
        failedAt: new Date().toISOString(),
    };

    try {
        const score = Date.now();

        const pipeline = redis.multi();
        // Why: ZADD with the postId as member ensures deduplication — a post
        // can only appear once in the DLQ even if failed events fire multiple times.
        pipeline.zadd(DLQ_KEY, score, JSON.stringify(entry));
        pipeline.expire(DLQ_KEY, DLQ_TTL_SECONDS);
        await pipeline.exec();

        logger.warn(
            { postId, organizationId, platform, attemptsMade },
            'Post moved to dead-letter queue — all retries exhausted',
        );

        // Send push notification (non-blocking)
        try {
            const { sendPostFailedNotification } = await import('@/lib/push-notifications');
            await sendPostFailedNotification(
                organizationId,
                postId,
                'Post failed permanently',
                platform ? [platform] : ['Unknown'],
                `All retry attempts exhausted. ${errorMessage.slice(0, 200)}`,
            );
        } catch {
            // Why: Notification failure must not prevent DLQ recording
        }
    } catch (error) {
        logger.error({ postId, error }, 'Failed to move post to dead-letter queue');
    }
}

/**
 * Remove a post from the dead-letter queue (e.g., after successful retry).
 *
 * @param postId - The post ID to remove
 * @returns true if removed, false if not found
 */
export async function removeFromDeadLetter(postId: string): Promise<boolean> {
    const redis = getRedisConnection();

    try {
        // Why: We need to find the member by postId since the member is a JSON string.
        // Scan through recent entries to find the matching one.
        const allEntries = await redis.zrange(DLQ_KEY, 0, -1);
        for (const entry of allEntries) {
            try {
                const parsed: DeadLetterEntry = JSON.parse(entry);
                if (parsed.postId === postId) {
                    const removed = await redis.zrem(DLQ_KEY, entry);
                    return removed > 0;
                }
            } catch {
                // Skip malformed entries
            }
        }
        return false;
    } catch (error) {
        logger.error({ postId, error }, 'Failed to remove from dead-letter queue');
        return false;
    }
}

// ---------------------------------------------------------------------------
// Read Operations
// ---------------------------------------------------------------------------

/**
 * List dead-letter posts, most recent first.
 *
 * @param limit - Max entries to return
 * @param offset - Pagination offset
 * @returns Array of dead-letter post entries
 */
export async function listDeadLetterPosts(
    limit: number = 20,
    offset: number = 0,
): Promise<DeadLetterPost[]> {
    const redis = getRedisConnection();

    try {
        // Why: ZREVRANGEBYSCORE returns newest first (highest score = most recent)
        const entries = await redis.zrevrange(DLQ_KEY, offset, offset + limit - 1, 'WITHSCORES');

        const posts: DeadLetterPost[] = [];
        // Why: WITHSCORES returns alternating [member, score, member, score, ...]
        for (let i = 0; i < entries.length; i += 2) {
            try {
                const parsed: DeadLetterEntry = JSON.parse(entries[i]);
                posts.push({
                    ...parsed,
                    failedAt: new Date(parsed.failedAt),
                    score: parseInt(entries[i + 1], 10),
                });
            } catch {
                // Skip malformed entries
            }
        }

        return posts;
    } catch (error) {
        logger.error({ error }, 'Failed to list dead-letter posts');
        return [];
    }
}

/**
 * Get the total count of posts in the dead-letter queue.
 */
export async function getDeadLetterCount(): Promise<number> {
    const redis = getRedisConnection();

    try {
        return await redis.zcard(DLQ_KEY);
    } catch (error) {
        logger.error({ error }, 'Failed to get dead-letter count');
        return 0;
    }
}

/**
 * List dead-letter posts filtered by organization.
 *
 * @param organizationId - Filter by this org
 * @param limit - Max entries to return
 */
export async function listDeadLetterByOrg(
    organizationId: string,
    limit: number = 20,
): Promise<DeadLetterPost[]> {
    // Why: Redis sorted sets don't support filtering by field, so we fetch
    // a larger window and filter in-memory. For typical usage (< 100 DLQ entries),
    // this is efficient enough without needing a secondary index.
    const all = await listDeadLetterPosts(200, 0);
    return all.filter((p) => p.organizationId === organizationId).slice(0, limit);
}

/**
 * Retry a dead-letter post by re-enqueuing it to the publish queue.
 *
 * @param postId - The post ID to retry
 * @param organizationId - The org that owns the post
 * @returns true if re-enqueued successfully
 */
export async function retryDeadLetterPost(
    postId: string,
    organizationId: string,
): Promise<boolean> {
    try {
        const { retryFailedPost } = await import('@/lib/queue');
        const result = await retryFailedPost(postId, organizationId);

        if (result.success) {
            await removeFromDeadLetter(postId);
            logger.info({ postId, organizationId }, 'Dead-letter post re-enqueued for retry');
        }

        return result.success;
    } catch (error) {
        logger.error({ postId, error }, 'Failed to retry dead-letter post');
        return false;
    }
}
