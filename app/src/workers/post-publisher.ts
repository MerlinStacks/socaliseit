/**
 * Post Publisher Worker
 * Processes scheduled posts and publishes them to social platforms
 *
 * Why: Heavy publish logic (payload building, timeout racing, error handling)
 * is extracted into publish-helpers.ts to keep this file focused on job
 * orchestration and status management.
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { PostPublishJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { sendPostFailedNotification, sendPostPublishedNotification } from '@/lib/push-notifications';
import { getUserFriendlyError } from '@/lib/error-messages';
import { acquirePublishLock, extendPublishLock, releasePublishLock } from '@/lib/publish-lock';
import { sanitizeForDb } from '@/lib/sanitize-string';
import type { Platform } from '@/generated/prisma/enums';
import {
    buildPublishPayload,
    publishSinglePlatform,
    type SinglePublishResult,
} from './publish-helpers';

/**
 * Process a post publishing job.
 * Handles OAuth token refresh, platform API calls, and status updates.
 */
async function processPostPublish(job: Job<PostPublishJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'post-publish');
    const { postId, organizationId, platformIds } = job.data;

    log.info({ postId, platformIds }, 'Starting post publish job');

    // Acquire distributed lock to prevent double-publish
    const lockToken = await acquirePublishLock(postId);
    if (!lockToken) {
        log.warn({ postId }, 'Post is already being published by another worker, skipping');
        return;
    }

    try {
        // Database-level guard: Check if post is already being published or published
        const currentPost = await db.post.findUnique({
            where: { id: postId },
            select: { status: true },
        });

        if (!currentPost) {
            throw new Error(`Post not found: ${postId}`);
        }

        if (currentPost.status === 'PUBLISHING') {
            if (job.data.isRetry) {
                log.info({ postId }, 'Post in PUBLISHING status but isRetry=true, resetting for retry');
                await db.post.update({ where: { id: postId }, data: { status: 'SCHEDULED' } });
            } else {
                log.warn({ postId }, 'Post already in PUBLISHING status, skipping duplicate');
                return;
            }
        }

        if (currentPost.status === 'PUBLISHED') {
            log.warn({ postId }, 'Post already PUBLISHED, skipping');
            return;
        }

        // Why: Stale cleanup may have reset this post to FAILED while a BullMQ retry
        // was still in the queue. Without this guard, the retry fires and loops.
        if (currentPost.status === 'FAILED' && !job.data.isRetry) {
            log.warn({ postId, attemptsMade: job.attemptsMade }, 'Post already FAILED (stale cleanup), skipping non-retry job');
            return;
        }

        // Update post status to PUBLISHING
        await db.post.update({ where: { id: postId }, data: { status: 'PUBLISHING' } });

        // Fetch post with all related data
        const post = await db.post.findUnique({
            where: { id: postId },
            include: {
                socialAccount: true,
                media: { include: { media: true } },
            },
        });

        if (!post) {
            throw new Error(`Post not found: ${postId}`);
        }

        // Pre-validation: video-only platforms
        if (await failIfMissingVideo(post, postId, lockToken, log)) return;

        const results = await publishPost(post, postId, lockToken, log);

        // Why (HT03): Only log activity when at least one platform succeeded.
        // Total failures are already captured by the catch block + publishError records.
        const successCount = results.filter(r => r.success).length;
        if (successCount > 0) {
            await db.activity.create({
                data: {
                    organizationId,
                    action: results.every(r => r.success) ? 'published' : 'publish_partial',
                    resourceType: 'post',
                    resourceId: postId,
                    resourceName: sanitizeForDb(post.caption, 50),
                    details: sanitizeForDb(`Published to ${successCount}/${results.length} platforms`),
                },
            });
        }

        // Send push notifications
        await sendPublishNotifications(organizationId, postId, post.caption, results);

        log.info({ results }, 'Post publish job completed');
    } catch (error) {
        log.error({ err: error }, 'Post publish job failed');

        await db.post.update({ where: { id: postId }, data: { status: 'FAILED' } });

        const friendlyError = getUserFriendlyError(error);
        await sendPostFailedNotification(
            organizationId, postId, 'Post failed to publish',
            ['All platforms'], friendlyError.message
        ).catch(() => { /* Non-blocking */ });

        throw error; // Re-throw to trigger BullMQ retry
    } finally {
        await releasePublishLock(postId, lockToken);
    }
}

// ---------------------------------------------------------------------------
// Publish orchestration
// ---------------------------------------------------------------------------

/** Publish a post to its target platform */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function publishPost(post: any, postId: string, lockToken: string, log: any): Promise<SinglePublishResult[]> {
    const socialAccount = post.socialAccount;
    if (!socialAccount) {
        throw new Error(`Social account not found for post: ${postId}`);
    }

    if (!socialAccount.isActive) {
        await recordDisconnectedAccount(postId, post.platform!, socialAccount.id, log);
        return [{ platform: post.platform!, success: false, error: 'Account disconnected', friendlyError: 'Account disconnected' }];
    }

    const mem = process.memoryUsage();
    log.info({
        platform: post.platform, accountId: socialAccount.id,
        postType: post.postType, mediaCount: post.media.length,
        mediaTypes: post.media.map((m: any) => m.media.mimeType),
        memoryMB: Math.round(mem.rss / 1024 / 1024),
    }, 'Publishing to platform');

    const payload = buildPublishPayload(post, undefined, socialAccount.platform);

    // Why: Extend lock TTL right before the potentially long platform API call.
    // This resets the 15-min TTL so large video uploads don't outlive the lock.
    await extendPublishLock(postId, lockToken);

    const result = await publishSinglePlatform(socialAccount, payload, postId, log);

    if (result.success) {
        await db.post.update({
            where: { id: postId },
            data: {
                status: 'PUBLISHED',
                publishedAt: new Date(),
                platformPostId: result.postId || `${post.platform!.toLowerCase()}_${Date.now()}`,
            },
        });
        log.info({ platform: post.platform, postType: post.postType }, 'Successfully published');
    } else {
        await db.post.update({ where: { id: postId }, data: { status: 'FAILED' } });
    }

    return [result];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Fail post if it targets a video-only platform without video content */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function failIfMissingVideo(post: any, postId: string, lockToken: string, log: any): Promise<boolean> {
    const videoOnlyPlatforms = ['tiktok', 'youtube'];
    const postPlatform = post.platform?.toLowerCase();

    if (!postPlatform || !videoOnlyPlatforms.includes(postPlatform)) return false;

    const hasVideo = post.media.some((m: any) => m.media.mimeType?.startsWith('video/'));
    if (hasVideo) return false;

    log.warn({ postId, platform: postPlatform }, 'Video-only platform missing video content');

    await db.post.update({ where: { id: postId }, data: { status: 'FAILED' } });
    await db.publishError.create({
        data: {
            postId, platform: post.platform!,
            errorCode: 'MISSING_VIDEO',
            errorRaw: `${postPlatform} requires video content`,
            errorHuman: `${postPlatform === 'youtube' ? 'YouTube' : 'TikTok'} only supports video content. Please add a video to your post.`,
            suggestion: 'Edit your post and attach a video file.',
        },
    });

    await releasePublishLock(postId, lockToken);
    return true;
}

/** Record a disconnected-account failure for a post */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordDisconnectedAccount(postId: string, platform: string, accountId: string, log: any) {
    log.warn({ postId, accountId }, 'Social account disconnected, cannot publish');

    await db.post.update({ where: { id: postId }, data: { status: 'FAILED' } });
    await db.publishError.create({
        data: {
            postId, platform: platform as Platform,
            errorCode: 'ACCOUNT_DISCONNECTED',
            errorRaw: 'Social account was disconnected before publishing',
            errorHuman: 'This social account has been disconnected. Please reconnect it to publish.',
            suggestion: 'Go to Settings > Connected Accounts to reconnect this account.',
        },
    });

    const { sendPostFailedNotification } = await import('@/lib/push-notifications');
    await sendPostFailedNotification(
        '', postId, '', [platform], 'Account disconnected - please reconnect in Settings'
    ).catch(() => { /* Non-blocking */ });
}

/** Send push notifications based on publish results */
async function sendPublishNotifications(
    organizationId: string, postId: string, caption: string, results: SinglePublishResult[]
) {
    const failedResults = results.filter(r => !r.success);
    const successPlatforms = results.filter(r => r.success).map(r => r.platform);

    if (failedResults.length > 0) {
        const firstFriendlyError = failedResults.find(r => r.friendlyError)?.friendlyError;
        await sendPostFailedNotification(
            organizationId, postId, caption,
            failedResults.map(r => r.platform),
            firstFriendlyError
        );
    } else if (successPlatforms.length > 0) {
        await sendPostPublishedNotification(organizationId, postId, caption, successPlatforms);
    }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

/**
 * Create and start the post publisher worker.
 */
export function createPostPublisherWorker(): Worker<PostPublishJobData> {
    const worker = new Worker<PostPublishJobData>('post-publish', processPostPublish, {
        connection: getBullMQConnection(),
        concurrency: 5,
        limiter: {
            max: 10,
            duration: 1000,
        },
    });

    worker.on('completed', (job) => {
        const log = createJobLogger(job.id || 'unknown', 'post-publish');
        log.info('Job completed successfully');
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'post-publish');
        log.error({ err }, 'Job failed');
    });

    return worker;
}
