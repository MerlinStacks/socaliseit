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
import { isPublishLocked } from '@/lib/publish-lock';
import { sanitizeForDb } from '@/lib/sanitize-string';
import { pendingTikTokId, reconcileTikTokPost, tiktokPendingWhere, type PendingTikTokPost } from '@/lib/services/tiktok-pending';

/**
 * Posts stuck in PUBLISHING for more than this are considered stale.
 * Why: Must exceed LOCK_TTL (15 min) so cleanup only fires after the
 * Redis lock has truly expired and the publish has genuinely stalled.
 */
const STALE_THRESHOLD_MINUTES = 20;

/**
 * Posts with a pending platform ID are not worker crashes. They represent an
 * async publish already accepted by the platform, so allow much longer for the
 * platform to finish before surfacing it as failed.
 */
const PENDING_PLATFORM_THRESHOLD_HOURS = 12;
const PENDING_PLATFORM_PREFIXES = ['tiktok_pending:', 'ig_pending:', 'threads_pending:', 'bsky_pending:'];

interface StalePostCleanupJob {
    type: 'cleanup';
}

/**
 * Process stale post cleanup
 */
export async function processStalePostCleanup(job: Job<StalePostCleanupJob>): Promise<void> {
    logger.info('Starting stale post cleanup job');

    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

    // Include legacy TikTok rows that were incorrectly marked PUBLISHED while
    // their publish_id was still pending.
    const stalePosts = await db.post.findMany({
        where: {
            OR: [
                { status: 'PUBLISHING', updatedAt: { lt: staleThreshold } },
                {
                    status: { in: ['PUBLISHED', 'FAILED'] },
                    ...tiktokPendingWhere,
                    updatedAt: { lt: staleThreshold },
                },
            ],
        },
        select: {
            id: true,
            caption: true,
            organizationId: true,
            platform: true,
            platformPostId: true,
            externalId: true,
            publishedAt: true,
            socialAccountId: true,
            status: true,
            updatedAt: true,
        },
    });

    if (stalePosts.length === 0) {
        logger.info('No stale posts found');
        return;
    }

    logger.warn({ count: stalePosts.length }, 'Found stale or unresolved pending posts');

    let resetCount = 0;
    for (const post of stalePosts) {
        if (await isPublishLocked(post.id)) continue;
        const stuckMinutes = Math.round((Date.now() - post.updatedAt.getTime()) / 60000);
        const hasPendingPlatformId = Boolean(post.platform === 'TIKTOK' && pendingTikTokId(post)) || (post.platformPostId
            ? PENDING_PLATFORM_PREFIXES.some(prefix => post.platformPostId!.startsWith(prefix))
            : false);

        const pendingExpired = stuckMinutes >= PENDING_PLATFORM_THRESHOLD_HOURS * 60;

        if (hasPendingPlatformId && post.platform === 'TIKTOK' && await resolvePendingTikTokPost(post)) {
            continue;
        }

        if (hasPendingPlatformId && !pendingExpired) {
            logger.info({
                postId: post.id,
                stuckMinutes,
                platform: post.platform,
                pendingId: post.platformPostId,
            }, 'Skipping stale cleanup for platform-pending post');
            continue;
        }

        // Atomically claim only a row that is still stale. A publisher may have
        // completed after the initial query, in which case cleanup must not
        // overwrite PUBLISHED with FAILED.
        const claimed = await db.post.updateMany({
            where: {
                id: post.id,
                organizationId: post.organizationId,
                status: 'PUBLISHING',
                updatedAt: post.updatedAt,
                platformPostId: post.platformPostId,
                externalId: post.externalId,
            },
            data: { status: 'FAILED' },
        });
        if (claimed.count === 0) {
            logger.info({ postId: post.id }, 'Stale post changed before cleanup; skipping reset');
            continue;
        }

        logger.info({
            postId: post.id,
            stuckMinutes,
            platform: post.platform,
        }, 'Resetting stale post to FAILED');

        // Never force-release a publisher's lock; lock ownership is token-bound.
        resetCount++;

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
                    errorHuman: 'Publishing confirmation timed out. The post may already be live.',
                    suggestion: 'Check the connected account on the platform. Do not repost until the outcome is confirmed.',
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

    logger.info({ examinedCount: stalePosts.length, resetCount }, 'Stale post cleanup completed');
}

async function resolvePendingTikTokPost(post: PendingTikTokPost): Promise<boolean> {
    if (!post.socialAccountId) return true;
    try {
        const { ensureValidToken } = await import('@/lib/services/token-service');
        const tokenResult = await ensureValidToken(post.socialAccountId);
        if (!tokenResult.success || !tokenResult.accessToken) {
            logger.warn({ postId: post.id, accountId: post.socialAccountId }, 'Could not reconcile TikTok pending post without valid token');
            return true;
        }

        return await reconcileTikTokPost(post, tokenResult.accessToken) !== 'failed';
    } catch (error) {
        logger.warn({ postId: post.id, error }, 'TikTok confirmation deferred until next cleanup');
        return true;
    }
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
