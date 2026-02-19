/**
 * Stale Post Cleanup Worker
 * Detects and resets posts stuck in PUBLISHING status for too long.
 *
 * Why: If a worker crashes mid-publish, the post remains in PUBLISHING
 * forever. This worker auto-resets them to FAILED after a threshold.
 */

import { Worker, Job } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { forceReleasePublishLock } from '@/lib/publish-lock';
import { sanitizeForDb } from '@/lib/sanitize-string';

/**
 * Posts stuck in PUBLISHING for more than this are considered stale.
 * Why: Must exceed LOCK_TTL (15 min) so cleanup only fires after the
 * Redis lock has truly expired and the publish has genuinely stalled.
 */
const STALE_THRESHOLD_MINUTES = 20;

interface StalePostCleanupJob {
    type: 'cleanup';
}

/**
 * Process stale post cleanup
 */
async function processStalePostCleanup(job: Job<StalePostCleanupJob>): Promise<void> {
    logger.info('Starting stale post cleanup job');

    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

    // Find posts stuck in PUBLISHING status
    const stalePosts = await db.post.findMany({
        where: {
            status: 'PUBLISHING',
            updatedAt: {
                lt: staleThreshold,
            },
        },
        select: {
            id: true,
            caption: true,
            organizationId: true,
            platform: true,
            updatedAt: true,
        },
    });

    if (stalePosts.length === 0) {
        logger.info('No stale posts found');
        return;
    }

    logger.warn({ count: stalePosts.length }, 'Found stale posts in PUBLISHING status');

    for (const post of stalePosts) {
        const stuckMinutes = Math.round((Date.now() - post.updatedAt.getTime()) / 60000);

        logger.info({
            postId: post.id,
            stuckMinutes,
            platform: post.platform,
        }, 'Resetting stale post to FAILED');

        // Force release any leftover lock
        await forceReleasePublishLock(post.id);

        // Update post status to FAILED
        await db.post.update({
            where: { id: post.id },
            data: { status: 'FAILED' },
        });

        // Why: Remove pending BullMQ jobs for this post to break the feedback loop.
        // Without this, a BullMQ retry fires after cleanup, sets PUBLISHING again,
        // hangs, stale cleanup resets again → infinite cycle.
        try {
            const { postPublishQueue } = await import('@/lib/bullmq/queues');
            // Why (BUG-05): Removed 'active' — active jobs are mid-publish and
            // removing them can orphan already-posted content on the platform.
            // The publisher's own PUBLISH_TIMEOUT_MS catches true hangs.
            const pendingJobs = await postPublishQueue.getJobs(['waiting', 'delayed']);
            for (const queueJob of pendingJobs) {
                if (queueJob.data.postId === post.id) {
                    try {
                        await queueJob.remove();
                        logger.info({ postId: post.id, jobId: queueJob.id }, 'Removed stale BullMQ job for post');
                    } catch {
                        /* Job may have already been processed */
                    }
                }
            }
        } catch (jobCleanupError) {
            logger.warn({ postId: post.id, err: jobCleanupError }, 'Failed to clean up BullMQ jobs for stale post');
        }

        // Create a publish error record
        // Note: If platform is null (legacy post), skip error record since PublishError requires platform
        if (post.platform) {
            await db.publishError.create({
                data: {
                    postId: post.id,
                    platform: post.platform,
                    errorCode: 'STALE_PUBLISHING',
                    errorRaw: `Post stuck in PUBLISHING for ${stuckMinutes} minutes`,
                    errorHuman: 'Publishing timed out. The post may have failed to complete.',
                    suggestion: 'Try publishing again using the Retry button.',
                },
            });
        }

        // Log activity
        await db.activity.create({
            data: {
                organizationId: post.organizationId,
                action: 'publish_timeout',
                resourceType: 'post',
                resourceId: post.id,
                resourceName: sanitizeForDb(post.caption, 50),
                details: sanitizeForDb(`Post reset from PUBLISHING to FAILED after ${stuckMinutes} minutes`),
            },
        });
    }

    logger.info({ resetCount: stalePosts.length }, 'Stale post cleanup completed');
}

/**
 * Create and start the stale post cleanup worker
 */
export function createStalePostCleanupWorker(): Worker<StalePostCleanupJob> {
    const worker = new Worker<StalePostCleanupJob>(
        'stale-post-cleanup',
        processStalePostCleanup,
        {
            connection: getBullMQConnection(),
            concurrency: 1,
        }
    );

    worker.on('completed', () => {
        logger.info('Stale post cleanup job completed');
    });

    worker.on('failed', (job, err) => {
        logger.error({ err }, 'Stale post cleanup job failed');
    });

    return worker;
}
