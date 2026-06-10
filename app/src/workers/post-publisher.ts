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
import { postPublishQueue, PostPublishJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { sendPostFailedNotification, sendPostPublishedNotification } from '@/lib/push-notifications';
import { getUserFriendlyError } from '@/lib/error-messages';
import { acquirePublishLock, extendPublishLock, releasePublishLock } from '@/lib/publish-lock';
import { sanitizeForDb } from '@/lib/sanitize-string';
import type { Platform } from '@/generated/prisma/enums';
import type { Logger } from 'pino';
import {
    buildPublishPayload,
    publishSinglePlatform,
    type SinglePublishResult,
    type PublishablePost,
} from './publish-helpers';
import { moveToDeadLetter } from '@/lib/resilience/dead-letter';

const TRANSCODE_PUBLISH_RETRY_DELAY_MS = 60 * 1000;
const MAX_TRANSCODE_PUBLISH_WAITS = 30;

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

        /**
         * Why: socialAccount can be null if the linked account was deleted
         * (onDelete:SetNull). Record a specific user-friendly error so the
         * notification tells the user to reconnect, instead of a generic
         * "Post failed to publish" message.
         */
        if (!post.socialAccount) {
            log.warn({ postId, platform: post.platform }, 'Social account was deleted before publishing');
            await db.post.update({ where: { id: postId }, data: { status: 'FAILED' } });
            if (post.platform) {
                await db.publishError.create({
                    data: {
                        postId, platform: post.platform,
                        errorCode: 'ACCOUNT_REMOVED',
                        errorRaw: 'Social account was removed before publishing',
                        errorHuman: 'The connected account was removed. Please reconnect it in Settings and retry.',
                        suggestion: 'Go to Settings > Connected Accounts to reconnect, then retry this post.',
                    },
                });
            }
            await sendPostFailedNotification(
                organizationId, postId, post.caption || '',
                [post.platform?.toLowerCase() || 'unknown'],
                'Account was removed — reconnect in Settings and retry'
            ).catch(() => { /* Non-blocking */ });
            return;
        }

        if (await delayIfVideosStillTranscoding(post, job, log)) return;

        if (await failIfRequiredVideoTranscodeMissing(post, postId, log)) return;

        // Pre-validation: video-only platforms
        if (await failIfMissingVideo(post, postId, log)) return;

        // Pre-validation: photo-only platforms (e.g. Google My Business)
        if (await failIfVideoOnPhotoOnly(post, postId, log)) return;

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
        // Why (BUG-FIX): Wrapped in catch to prevent notification failures from
        // reverting a successfully published post to FAILED via the outer catch block.
        await sendPublishNotifications(organizationId, postId, post.caption, results)
            .catch((err) => log.error({ err }, 'Push notification failed (non-blocking)'));

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
async function publishPost(post: PublishablePost, postId: string, lockToken: string, log: Logger): Promise<SinglePublishResult[]> {
    /**
     * Why: post.platform can be null for legacy posts created before the
     * independent-posts migration. Fail fast with a clear error instead of
     * crashing on a non-null assertion deeper in the call stack.
     */
    if (!post.platform) {
        throw new Error(`Post ${postId} has no platform set, cannot publish`);
    }
    const platform = post.platform as string;

    const socialAccount = post.socialAccount;
    if (!socialAccount) {
        throw new Error(`Social account not found for post: ${postId}`);
    }

    if (!socialAccount.isActive) {
        await recordDisconnectedAccount(postId, platform, socialAccount.id, post.organizationId, log);
        return [{ platform, success: false, error: 'Account disconnected', friendlyError: 'Account disconnected' }];
    }

    const mem = process.memoryUsage();
    log.info({
        platform: post.platform, accountId: socialAccount.id,
        postType: post.postType, mediaCount: post.media.length,
        mediaTypes: post.media.map((m) => m.media.mimeType),
        memoryMB: Math.round(mem.rss / 1024 / 1024),
    }, 'Publishing to platform');

    const payload = buildPublishPayload(post, undefined, socialAccount.platform);

    // Why: Extend lock TTL right before the potentially long platform API call.
    // This resets the 15-min TTL so large video uploads don't outlive the lock.
    await extendPublishLock(postId, lockToken);

    const result = await publishSinglePlatform(socialAccount, payload, postId, log);

    if (result.success) {
        // Why: Setting externalId = platformPostId ensures the background sync
        // service's upsert (keyed on organizationId_externalId) will match this
        // post instead of creating a duplicate external entry.
        const resolvedPlatformPostId = result.postId || `${platform.toLowerCase()}_${Date.now()}`;
        await db.post.update({
            where: { id: postId },
            data: {
                status: 'PUBLISHED',
                publishedAt: new Date(),
                platformPostId: resolvedPlatformPostId,
                externalId: resolvedPlatformPostId,
            },
        });
        log.info({ platform: post.platform, postType: post.postType }, 'Successfully published');
    } else {
        // Why: Store pending platform IDs so retry can poll status
        // instead of re-uploading the media (which creates duplicates).
        // Always set platformPostId (to the new pending ID or null) to clear
        // stale pending IDs from previous attempts that have since expired.
        const PENDING_PREFIXES = ['tiktok_pending:', 'ig_pending:', 'threads_pending:', 'bsky_pending:'];
        const hasPendingId = result.postId && PENDING_PREFIXES.some(p => result.postId!.startsWith(p));
        const updateData: { status: 'FAILED' | 'PUBLISHING'; platformPostId: string | null } = {
            status: hasPendingId ? 'PUBLISHING' : 'FAILED',
            platformPostId: hasPendingId ? result.postId! : null,
        };
        if (hasPendingId) {
            log.info({ postId, pendingId: result.postId }, 'Post pending on platform, keeping in PUBLISHING status');
        }
        await db.post.update({ where: { id: postId }, data: updateData });
    }

    return [result];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Delay scheduled publishing while uploaded videos are still being converted. */
async function delayIfVideosStillTranscoding(post: PublishablePost, job: Job<PostPublishJobData>, log: Logger): Promise<boolean> {
    const pendingVideos = post.media.filter((m) =>
        m.media.mimeType?.startsWith('video/') &&
        (m.media.transcodeStatus === 'pending' || m.media.transcodeStatus === 'processing')
    );
    if (pendingVideos.length === 0) return false;

    const waitAttempts = job.data.transcodeWaitAttempts ?? 0;
    if (waitAttempts >= MAX_TRANSCODE_PUBLISH_WAITS) {
        const platform = post.platform?.toLowerCase() || 'unknown';
        await db.post.update({ where: { id: post.id }, data: { status: 'FAILED' } });
        await db.publishError.create({
            data: {
                postId: post.id,
                platform: (post.platform ?? 'MANUAL') as Platform,
                errorCode: 'VIDEO_TRANSCODE_TIMEOUT',
                errorRaw: 'Video was still transcoding when the maximum publish wait time elapsed',
                errorHuman: 'The video was still converting to MP4, so it was not sent to the platform.',
                suggestion: 'Wait for conversion to complete, then retry the post. If it remains stuck, re-upload the video as MP4.',
            },
        });
        await sendPostFailedNotification(
            post.organizationId,
            post.id,
            post.caption || '',
            [platform],
            'Video conversion took too long. Retry after conversion completes or upload an MP4 version.'
        ).catch(() => { /* Non-blocking */ });

        log.warn(
            { postId: post.id, mediaIds: pendingVideos.map((m) => m.media.id), waitAttempts },
            'Video transcode wait limit reached; failing post',
        );
        return true;
    }

    await db.post.update({ where: { id: post.id }, data: { status: 'SCHEDULED' } });
    await postPublishQueue.add('publish-post', {
        ...job.data,
        transcodeWaitAttempts: waitAttempts + 1,
    }, {
        delay: TRANSCODE_PUBLISH_RETRY_DELAY_MS,
        jobId: `publish-${post.id}-transcode-wait-${waitAttempts + 1}`,
    });

    log.info(
        { postId: post.id, mediaIds: pendingVideos.map((m) => m.media.id), waitAttempts: waitAttempts + 1 },
        'Post media still transcoding; delayed publish job',
    );

    return true;
}

/** Fail before platform upload if a MOV/QuickTime video never produced an MP4. */
async function failIfRequiredVideoTranscodeMissing(post: PublishablePost, postId: string, log: Logger): Promise<boolean> {
    const missingTranscodes = post.media.filter((m) => {
        if (!m.media.mimeType?.startsWith('video/')) return false;
        if (m.media.transcodedUrl) return false;
        const url = m.media.url.toLowerCase();
        return m.media.mimeType === 'video/quicktime' || url.endsWith('.mov');
    });
    if (missingTranscodes.length === 0) return false;

    const platform = post.platform?.toLowerCase() || 'unknown';
    log.warn({ postId, mediaIds: missingTranscodes.map((m) => m.media.id) }, 'Required video transcode missing');

    await db.post.update({ where: { id: postId }, data: { status: 'FAILED' } });
    await db.publishError.create({
        data: {
            postId,
            platform: (post.platform ?? 'MANUAL') as Platform,
            errorCode: 'VIDEO_TRANSCODE_MISSING',
            errorRaw: 'MOV/QuickTime video could not be converted to MP4 before publishing',
            errorHuman: 'This video could not be converted to MP4, so it was not sent to the platform.',
            suggestion: 'Re-upload the video or upload an MP4 version, then retry the post.',
        },
    });
    await sendPostFailedNotification(
        post.organizationId,
        postId,
        post.caption || '',
        [platform],
        'Video conversion failed. Re-upload the video or upload an MP4 version.'
    ).catch(() => { /* Non-blocking */ });

    return true;
}

/** Fail post if it targets a video-only platform without video content */
async function failIfMissingVideo(post: PublishablePost, postId: string, log: Logger): Promise<boolean> {
    const videoOnlyPlatforms = ['tiktok', 'youtube'];
    const postPlatform = post.platform?.toLowerCase();

    if (!postPlatform || !videoOnlyPlatforms.includes(postPlatform)) return false;

    const hasVideo = post.media.some((m) => m.media.mimeType?.startsWith('video/'));
    if (hasVideo) return false;

    log.warn({ postId, platform: postPlatform }, 'Video-only platform missing video content');

    await db.post.update({ where: { id: postId }, data: { status: 'FAILED' } });
    await db.publishError.create({
        data: {
            postId, platform: postPlatform.toUpperCase() as Platform,
            errorCode: 'MISSING_VIDEO',
            errorRaw: `${postPlatform} requires video content`,
            errorHuman: `${postPlatform === 'youtube' ? 'YouTube' : 'TikTok'} only supports video content. Please add a video to your post.`,
            suggestion: 'Edit your post and attach a video file.',
        },
    });

    // Why (BUG-22): Removed redundant releasePublishLock() call here.
    // The caller's finally block (processPostPublish L130) already releases
    // the lock, so doing it here caused a harmless but misleading double-release.
    return true;
}

/** Fail post if it targets a photo-only platform with video content */
// Why: Google My Business only supports photos. Reject before API call.
async function failIfVideoOnPhotoOnly(post: PublishablePost, postId: string, log: Logger): Promise<boolean> {
    const photoOnlyPlatforms = ['google_business'];
    const postPlatform = post.platform?.toLowerCase();

    if (!postPlatform || !photoOnlyPlatforms.includes(postPlatform)) return false;

    const hasVideo = post.media.some((m) => m.media.mimeType?.startsWith('video/'));
    if (!hasVideo) return false;

    log.warn({ postId, platform: postPlatform }, 'Photo-only platform contains video content');

    await db.post.update({ where: { id: postId }, data: { status: 'FAILED' } });
    await db.publishError.create({
        data: {
            postId, platform: postPlatform.toUpperCase() as Platform,
            errorCode: 'VIDEO_NOT_SUPPORTED',
            errorRaw: `${postPlatform} only supports photo content`,
            errorHuman: 'Google Business only supports photos. Please remove the video and try again.',
            suggestion: 'Edit your post and replace the video with a photo.',
        },
    });

    return true;
}

/** Record a disconnected-account failure for a post */
async function recordDisconnectedAccount(postId: string, platform: string, accountId: string, organizationId: string, log: Logger) {
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

    // Why (BUG-26): Uses the static import at the top of the file instead of
    // a redundant dynamic import() — sendPostFailedNotification is already
    // imported at L15.
    await sendPostFailedNotification(
        organizationId, postId, '', [platform], 'Account disconnected - please reconnect in Settings'
    ).catch(() => { /* Non-blocking */ });
}

/** Send push notifications based on publish results */
async function sendPublishNotifications(
    organizationId: string, postId: string, caption: string, results: SinglePublishResult[]
) {
    const pendingPrefixes = ['tiktok_pending:', 'ig_pending:', 'threads_pending:', 'bsky_pending:'];
    const failedResults = results.filter(r => !r.success && !pendingPrefixes.some(prefix => r.postId?.startsWith(prefix)));
    const successPlatforms = results.filter(r => r.success).map(r => r.platform);

    if (failedResults.length > 0) {
        // Why (BUG-FIX): Show all failed platform errors instead of only the first one
        const allErrors = failedResults
            .filter(r => r.friendlyError)
            .map(r => `${r.platform}: ${r.friendlyError}`);
        const errorSummary = allErrors.length > 0 ? allErrors.join('; ') : undefined;
        await sendPostFailedNotification(
            organizationId, postId, caption,
            failedResults.map(r => r.platform),
            errorSummary
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
        log.error({ err, attemptsMade: job?.attemptsMade }, 'Job failed');

        // Why: When all BullMQ-level retries are exhausted, move the post to
        // the dead-letter queue so it surfaces in admin dashboards for manual retry.
        if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
            const { postId, organizationId } = job.data;
            moveToDeadLetter(
                postId,
                organizationId,
                err.message,
                undefined,
                job.attemptsMade,
            ).catch((dlqErr) => {
                log.error({ dlqErr, postId }, 'Failed to move to dead-letter queue');
            });
        }
    });

    return worker;
}
