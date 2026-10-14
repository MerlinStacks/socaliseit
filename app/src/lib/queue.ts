/**
 * Post Queue Manager
 * Handles scheduling, queueing, and publishing posts via BullMQ
 */

import { db } from '@/lib/db';
import { postPublishQueue, PostPublishJobData, notificationReminderQueue, NotificationReminderJobData } from '@/lib/bullmq/queues';
import { logger } from '@/lib/logger';
import { getPublishingStatus, PublishingConflictError } from '@/lib/publishing-status';
import { acquirePublishLock, releasePublishLock } from '@/lib/publish-lock';

/** Queue mutations share the publisher's lock; never steal it from a live job. */
export async function withPostPublishLock<T>(postId: string, operation: () => Promise<T>): Promise<T> {
    const token = await acquirePublishLock(postId);
    if (!token) throw new PublishingConflictError('Publishing is active or its lock is unavailable. Refresh status and try again later.');
    try { return await operation(); }
    finally { await releasePublishLock(postId, token); }
}

export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

export interface QueuedPost {
    id: string;
    organizationId: string;
    caption: string;
    platforms: string[];
    mediaIds: string[];
    scheduledAt: Date | null;
    status: PostStatus;
    publishResults: PublishResult[];
    createdAt: Date;
    updatedAt: Date;
}

export interface PublishResult {
    platform: string;
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
    publishedAt?: Date;
}

export interface ScheduleOptions {
    datetime: Date;
    timezone: string;
    platforms: string[];
    autoRetry?: boolean;
    maxRetries?: number;
}

/**
 * Schedule a post for publishing via BullMQ.
 * Creates a delayed job that will be processed at the scheduled time.
 */
export async function schedulePost(
    postId: string,
    organizationId: string,
    options: ScheduleOptions
): Promise<{ success: boolean; scheduledAt: Date; jobId: string }> {
    return withPostPublishLock(postId, () => schedulePostLocked(postId, organizationId, options));
}

async function schedulePostLocked(postId: string, organizationId: string, options: ScheduleOptions): Promise<{ success: boolean; scheduledAt: Date; jobId: string }> {
    const scheduledAt = options.datetime;
    const nowMs = Date.now();
    const delayMs = scheduledAt.getTime() - nowMs;

    // Why: A past scheduledAt causes delay=0, which fires BullMQ immediately —
    // equivalent to publishNow(). The API route has a BUG-09 guard, but this
    // defence-in-depth catch protects against future call sites that skip it.
    // 60s grace handles clock skew and request latency.
    if (delayMs < -60_000) {
        logger.warn({ postId, scheduledAt, nowMs, delayMs }, 'schedulePost called with past scheduledAt — rejecting');
        throw new Error('Cannot schedule a post in the past');
    }

    const delay = Math.max(0, delayMs);

    // Validate post exists and is in valid state
    const post = await db.post.findUnique({
        where: { id: postId },
    });

    if (!post) {
        throw new Error(`Post not found: ${postId}`);
    }

    if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED' && post.status !== 'FAILED') {
        throw new Error(`Cannot schedule post in ${post.status} status`);
    }
    const latestError = await db.publishError.findFirst({ where: { postId }, orderBy: { occurredAt: 'desc' } });
    if (post.organizationId !== organizationId || post.platformPostId
        || (latestError && !getPublishingStatus({ ...post, status: 'FAILED' }, latestError.errorCode).canRetry)) {
        throw new PublishingConflictError('This publishing outcome needs confirmation before scheduling again. Check the platform.');
    }

    // Why: Post now always stores socialAccountId directly.
    const platformIds = post.socialAccountId ? [post.socialAccountId] : [];

    // Why (BUG-18): Update DB BEFORE creating the BullMQ job. If the DB update
    // fails, no orphan job exists in the queue for a post still in DRAFT status.
    // Mirrors the pattern established in retryFailedPost() (BUG-06).
    await db.post.update({
        where: { id: postId },
        data: {
            status: 'SCHEDULED',
            scheduledAt,
        },
    });

    // Add job to BullMQ queue
    const jobData: PostPublishJobData = {
        postId,
        organizationId,
        platformIds,
        scheduledAt: scheduledAt.toISOString(),
    };

    try {
        const job = await postPublishQueue.add(`publish-${postId}`, jobData, {
            delay,
            jobId: `post-${postId}-${Date.now()}`,
        });

        logger.info({ postId, jobId: job.id, delay, scheduledAt }, 'Post scheduled for publishing');

        return {
            success: true,
            scheduledAt,
            jobId: job.id || '',
        };
    } catch (error) {
        // Why: the row was flipped to SCHEDULED above, before the job existed.
        // If BullMQ add() throws (Redis blip, unreachable queue) nothing would
        // ever fire for this post, leaving a SCHEDULED post that never publishes
        // and surfaces on the calendar as a permanently overdue problem post.
        // Restore the exact status/scheduledAt we captured, mirroring the
        // compensation enqueueImmediatePost() already does (BUG-06).
        await db.post
            .updateMany({
                where: { id: postId, organizationId, status: 'SCHEDULED', scheduledAt, platformPostId: null },
                data: { status: post.status, scheduledAt: post.scheduledAt },
            })
            .catch((rollbackError: unknown) => {
                logger.error(
                    { postId, error: rollbackError },
                    'Failed to restore post status after publish job could not be enqueued',
                );
            });

        logger.error({ postId, error }, 'Failed to enqueue publish job; post status restored');
        throw error;
    }
}

/**
 * Cancel a scheduled post by removing its job from the queue.
 */
export async function cancelScheduledPost(postId: string): Promise<boolean> {
    // Why (BUG-20): Validate the post is in a cancellable state. Previously,
    // this unconditionally reset to DRAFT, which could silently erase FAILED
    // status and its associated error history.
    const post = await db.post.findUnique({
        where: { id: postId },
        select: { status: true },
    });

    if (!post) {
        throw new Error(`Post not found: ${postId}`);
    }

    if (post.status !== 'SCHEDULED' && post.status !== 'DRAFT') {
        throw new Error(`Cannot cancel post in ${post.status} status`);
    }

    // Find and remove all jobs for this post
    const jobs = await postPublishQueue.getJobs(['delayed', 'waiting']);

    for (const job of jobs) {
        if (job.data.postId === postId) {
            await job.remove();
            logger.info({ postId, jobId: job.id }, 'Removed scheduled job');
        }
    }

    // Update post status back to DRAFT
    await db.post.update({
        where: { id: postId },
        data: {
            status: 'DRAFT',
            scheduledAt: null,
        },
    });

    logger.info({ postId }, 'Post scheduling cancelled');
    return true;
}

/**
 * Reschedule a post to a new time.
 *
 * Why: The previous implementation called cancelScheduledPost (which resets to
 * DRAFT) then schedulePost (which sets to SCHEDULED). This caused a brief
 * intermediate DRAFT state visible to other readers (e.g., calendar polling).
 * Cleanup, replacement, and compensation all hold the publisher's lock.
 */
export async function reschedulePost(
    postId: string,
    organizationId: string,
    newDatetime: Date
): Promise<{ success: boolean; scheduledAt: Date; jobId: string }> {
    return withPostPublishLock(postId, async () => {
        const previous = await db.post.findUnique({ where: { id: postId, organizationId } });
        if (!previous) throw new Error(`Post not found: ${postId}`);
        const result = await replacePostScheduleLocked(postId, organizationId, {
            scheduledAt: newDatetime, autoPublish: true, caption: previous.caption,
            platform: previous.platform || 'unknown', previous,
        });
        return { ...result, scheduledAt: newDatetime };
    });
}

interface ScheduleReplacement {
    scheduledAt: Date | null;
    autoPublish: boolean;
    caption: string;
    platform: string;
    previous: { status: string; scheduledAt: Date | null; autoPublish: boolean; platformPostId?: string | null };
}

/** Caller must hold withPostPublishLock, including any preceding content write. */
export async function replacePostScheduleLocked(postId: string, organizationId: string, opts: ScheduleReplacement) {
    const { previous } = opts;
    let publishJobsRemoved = false;
    let hadPublishJobs = false;
    let cleanupComplete = false;
    try {
        // Reject invalid requests before touching the existing jobs.
        if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(previous.status) || previous.platformPostId) {
            throw new PublishingConflictError('This post cannot be rescheduled. Refresh its publishing status.');
        }
        if (opts.scheduledAt && (!Number.isFinite(opts.scheduledAt.getTime()) || opts.scheduledAt.getTime() < Date.now() - 60_000)) {
            throw new Error('Cannot schedule a post in the past or at an invalid time');
        }
        const latestError = await db.publishError.findFirst({ where: { postId }, orderBy: { occurredAt: 'desc' } });
        if (latestError && !getPublishingStatus({ ...previous, status: 'FAILED' }, latestError.errorCode).canRetry) {
            throw new PublishingConflictError('This publishing outcome needs confirmation before scheduling again. Check the platform.');
        }
        // Read both queues before removing anything: a lookup failure leaves the old schedule intact.
        const [publishJobs, reminderJobs] = await Promise.all([
            postPublishQueue.getJobs(['delayed', 'waiting']),
            notificationReminderQueue.getJobs(['delayed', 'waiting']),
        ]);
        const oldPublishJobs = publishJobs.filter(job => job.data.postId === postId);
        hadPublishJobs = oldPublishJobs.length > 0;
        for (const job of oldPublishJobs) await job.remove();
        publishJobsRemoved = true;
        for (const job of reminderJobs) {
            if (job.data.postId === postId) await job.remove();
        }
        cleanupComplete = true;

        if (opts.autoPublish && opts.scheduledAt) {
            return await schedulePostLocked(postId, organizationId, {
                datetime: opts.scheduledAt, timezone: 'UTC', platforms: [],
            });
        }
        if (opts.autoPublish) {
            const result = await enqueueImmediatePost(postId, organizationId, false);
            return { ...result, scheduledAt: opts.scheduledAt };
        }
        if (opts.scheduledAt) {
            await schedulePublishReminder(postId, organizationId, opts.caption, opts.platform, opts.scheduledAt);
        }
        return { success: true, scheduledAt: opts.scheduledAt, jobId: '' };
    } catch (error) {
        // Never label a post Draft while an old publish job may still be queued.
        // Once its jobs are gone, retain the requested time for the next attempt.
        const unscheduled = cleanupComplete || ((previous.autoPublish || hadPublishJobs) && publishJobsRemoved);
        await db.post.updateMany({
            where: { id: postId, organizationId, status: { in: ['DRAFT', 'SCHEDULED', 'FAILED'] }, platformPostId: null },
            data: {
                status: (unscheduled && previous.status !== 'FAILED' ? 'DRAFT' : previous.status) as import('@/generated/prisma/enums').PostStatus,
                scheduledAt: unscheduled ? opts.scheduledAt : previous.scheduledAt,
                ...(!unscheduled && { autoPublish: previous.autoPublish }),
            },
        }).catch((rollbackError: unknown) => {
            logger.error({ postId, error: rollbackError }, 'Failed to restore post scheduling state');
        });
        logger.error({ postId, error, unscheduled }, 'Failed to replace post schedule');
        throw error;
    }
}

/**
 * Publish a post immediately by adding it to the queue with no delay.
 */
export async function publishNow(
    postId: string,
    organizationId: string
): Promise<{ success: boolean; jobId: string }> {
    return withPostPublishLock(postId, () => enqueueImmediatePost(postId, organizationId, false));
}

async function enqueueImmediatePost(postId: string, organizationId: string, retryOnly: boolean): Promise<{ success: boolean; jobId: string }> {
    const post = await db.post.findUnique({
        where: { id: postId, organizationId },
        select: {
            id: true,
            status: true,
            socialAccountId: true,
            platformPostId: true,
        },
    });

    if (!post) {
        throw new Error(`Post not found: ${postId}`);
    }

    // Why (BUG-17): Guard against re-publishing an already-published post.
    // Without this, a double-click on "Publish" races against BullMQ pickup
    // and can create a duplicate post on the platform.
    if (post.status === 'PUBLISHED') {
        throw new PublishingConflictError('Post has already been published');
    }

    const latestError = await db.publishError.findFirst({ where: { postId }, orderBy: { occurredAt: 'desc' } });
    const detail = getPublishingStatus(post, latestError?.errorCode);
    if (post.status === 'PUBLISHING' || post.platformPostId
        || (latestError && !getPublishingStatus({ ...post, status: 'FAILED' }, latestError.errorCode).canRetry)
        || (post.status === 'FAILED' && !detail.canRetry)) {
        throw new PublishingConflictError(detail.message);
    }
    if (retryOnly && post.status !== 'FAILED') throw new PublishingConflictError('This post is already queued or cannot be retried. Refresh its status.');
    const isRetry = post.status === 'FAILED';

    // Why: Post now always stores socialAccountId directly.
    const platformIds = post.socialAccountId ? [post.socialAccountId] : [];

    // Why (BUG-32): Update status BEFORE queuing the job to prevent
    // double-publish race conditions. Without this, the post stays in DRAFT
    // while a job is pending, so the user can trigger another publish.
    // Mirrors the pattern in schedulePost() (BUG-18) and retryFailedPost() (BUG-06).
    const claimed = await db.post.updateMany({
            where: { id: postId, organizationId, status: post.status, platformPostId: null },
            data: { status: 'SCHEDULED' },
    });
    if (!claimed.count) throw new PublishingConflictError('Post status changed. Refresh before retrying.');

    const jobData: PostPublishJobData = {
        postId,
        organizationId,
        platformIds,
        ...(isRetry && { isRetry: true }),
    };

    const job = await postPublishQueue.add(isRetry ? `retry-${postId}` : `publish-now-${postId}`, jobData, {
        jobId: `${isRetry ? 'post-retry' : 'post-now'}-${postId}-${Date.now()}`,
    }).catch(async error => {
        // Restore only our queued state; never overwrite a worker's live state.
        await db.post.updateMany({ where: { id: postId, organizationId, status: 'SCHEDULED' }, data: { status: post.status } });
        throw error;
    });

    logger.info({ postId, jobId: job.id, isRetry }, 'Post queued for immediate publishing');

    return {
        success: true,
        jobId: job.id || '',
    };
}

/**
 * Retry a failed post by re-adding it to the queue.
 */
export async function retryFailedPost(
    postId: string,
    organizationId: string
): Promise<{ success: boolean; jobId: string }> {
    return withPostPublishLock(postId, () => enqueueImmediatePost(postId, organizationId, true));
}

/**
 * Schedule a publish reminder notification for a non-auto-publish post.
 * Creates a delayed job that fires at scheduledAt to notify the user to publish.
 */
export async function schedulePublishReminder(
    postId: string,
    organizationId: string,
    caption: string,
    platform: string,
    scheduledAt: Date
): Promise<void> {
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());

    const jobData: NotificationReminderJobData = {
        postId,
        organizationId,
        caption,
        platform,
    };

    await notificationReminderQueue.add(`reminder-${postId}`, jobData, {
        delay,
        jobId: `reminder-${postId}-${Date.now()}`,
    });

    logger.info({ postId, delay, scheduledAt }, 'Publish reminder scheduled');
}

/**
 * Cancel any pending publish reminder for a post.
 */
export async function cancelPublishReminder(postId: string): Promise<void> {
    const jobs = await notificationReminderQueue.getJobs(['delayed', 'waiting']);

    for (const job of jobs) {
        if (job.data.postId === postId) {
            await job.remove();
            logger.info({ postId, jobId: job.id }, 'Removed publish reminder job');
        }
    }
}

// Why: Query functions extracted to queue-queries.ts to keep this file focused
// on mutations (schedule/publish/cancel/retry). Re-export preserves import paths.
export { getUpcomingPosts, getPostHistory, generateWeeklySchedule, getQueueStats } from '@/lib/queue-queries';
