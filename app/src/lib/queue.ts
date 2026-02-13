/**
 * Post Queue Manager
 * Handles scheduling, queueing, and publishing posts via BullMQ
 */

import { db } from '@/lib/db';
import { postPublishQueue, PostPublishJobData, notificationReminderQueue, NotificationReminderJobData } from '@/lib/bullmq/queues';
import { logger } from '@/lib/logger';

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
    const scheduledAt = options.datetime;
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());

    // Validate post exists and is in valid state
    const post = await db.post.findUnique({
        where: { id: postId },
        include: { platforms: true },
    });

    if (!post) {
        throw new Error(`Post not found: ${postId}`);
    }

    if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED' && post.status !== 'FAILED') {
        throw new Error(`Cannot schedule post in ${post.status} status`);
    }

    // Get platform IDs from post
    const platformIds = post.platforms.map((p) => p.socialAccountId);

    // Add job to BullMQ queue
    const jobData: PostPublishJobData = {
        postId,
        organizationId,
        platformIds,
        scheduledAt: scheduledAt.toISOString(),
    };

    const job = await postPublishQueue.add(`publish-${postId}`, jobData, {
        delay,
        jobId: `post-${postId}-${Date.now()}`,
    });

    // Update post status in database
    await db.post.update({
        where: { id: postId },
        data: {
            status: 'SCHEDULED',
            scheduledAt,
        },
    });

    logger.info({ postId, jobId: job.id, delay, scheduledAt }, 'Post scheduled for publishing');

    return {
        success: true,
        scheduledAt,
        jobId: job.id || '',
    };
}

/**
 * Cancel a scheduled post by removing its job from the queue.
 */
export async function cancelScheduledPost(postId: string): Promise<boolean> {
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
 */
export async function reschedulePost(
    postId: string,
    organizationId: string,
    newDatetime: Date
): Promise<{ success: boolean; scheduledAt: Date; jobId: string }> {
    await cancelScheduledPost(postId);
    return schedulePost(postId, organizationId, {
        datetime: newDatetime,
        timezone: 'UTC',
        platforms: [],
    });
}

/**
 * Publish a post immediately by adding it to the queue with no delay.
 */
export async function publishNow(
    postId: string,
    organizationId: string
): Promise<{ success: boolean; jobId: string }> {
    const post = await db.post.findUnique({
        where: { id: postId },
        include: { platforms: true },
    });

    if (!post) {
        throw new Error(`Post not found: ${postId}`);
    }

    // If post is in PUBLISHING status, treat as retry (previous attempt may have failed)
    // Why: User explicitly trying to publish again means they want to retry
    let isRetry = false;

    if (post.status === 'PUBLISHING') {
        logger.info({ postId }, 'Post in PUBLISHING status, resetting for retry');

        // Reset status to allow re-publishing
        await db.post.update({
            where: { id: postId },
            data: { status: 'SCHEDULED' },
        });

        // Force-release any stale lock
        const { forceReleasePublishLock } = await import('@/lib/publish-lock');
        await forceReleasePublishLock(postId);

        isRetry = true;
    }

    const platformIds = post.platforms.map((p) => p.socialAccountId);

    const jobData: PostPublishJobData = {
        postId,
        organizationId,
        platformIds,
        ...(isRetry && { isRetry: true }),
    };

    const job = await postPublishQueue.add(`publish-now-${postId}`, jobData, {
        jobId: `post-now-${postId}-${Date.now()}`,
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
    const post = await db.post.findUnique({
        where: { id: postId },
        include: { platforms: true },
    });

    if (!post) {
        throw new Error(`Post not found: ${postId}`);
    }

    if (post.status !== 'FAILED') {
        throw new Error(`Post is not in FAILED status`);
    }

    // Pre-validate: check if the social account is still connected (new architecture)
    if (post.socialAccountId) {
        const account = await db.socialAccount.findUnique({
            where: { id: post.socialAccountId },
            select: { isActive: true, username: true },
        });
        if (account && !account.isActive) {
            throw new Error(
                `Cannot retry: social account ${account.username || post.socialAccountId} is disconnected. Please reconnect in Settings.`
            );
        }
    }

    // Force-release any stale lock from a previous failed attempt
    const { forceReleasePublishLock } = await import('@/lib/publish-lock');
    await forceReleasePublishLock(postId);

    // Get failed platform IDs
    const failedPlatformIds = post.platforms
        .filter((p) => p.status === 'FAILED')
        .map((p) => p.socialAccountId);

    const jobData: PostPublishJobData = {
        postId,
        organizationId,
        platformIds: failedPlatformIds,
        isRetry: true,
    };

    const job = await postPublishQueue.add(`retry-${postId}`, jobData, {
        jobId: `post-retry-${postId}-${Date.now()}`,
    });

    logger.info({ postId, jobId: job.id, failedPlatformIds }, 'Retrying failed post');

    return {
        success: true,
        jobId: job.id || '',
    };
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

/**
 * Get upcoming posts in the queue from the database.
 */
export async function getUpcomingPosts(
    organizationId: string,
    limit: number = 10
): Promise<QueuedPost[]> {
    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'SCHEDULED',
            scheduledAt: { gte: new Date() },
        },
        include: {
            platforms: {
                include: { socialAccount: true },
            },
            media: {
                include: { media: true },
            },
        },
        orderBy: { scheduledAt: 'asc' },
        take: limit,
    });

    return posts.map((post) => ({
        id: post.id,
        organizationId: post.organizationId,
        caption: post.caption,
        platforms: post.platforms.map((p) => p.socialAccount.platform),
        mediaIds: post.media.map((m) => m.mediaId),
        scheduledAt: post.scheduledAt,
        status: post.status as PostStatus,
        publishResults: [],
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
    }));
}

/**
 * Get posting history from the database.
 */
export async function getPostHistory(
    organizationId: string,
    options: { limit?: number; offset?: number; status?: PostStatus }
): Promise<{ posts: QueuedPost[]; total: number }> {
    const { limit = 20, offset = 0, status } = options;

    const where = {
        organizationId,
        ...(status && { status }),
    };

    const [posts, total] = await Promise.all([
        db.post.findMany({
            where,
            include: {
                platforms: {
                    include: { socialAccount: true },
                },
                media: {
                    include: { media: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        }),
        db.post.count({ where }),
    ]);

    return {
        posts: posts.map((post) => ({
            id: post.id,
            organizationId: post.organizationId,
            caption: post.caption,
            platforms: post.platforms.map((p) => p.socialAccount.platform),
            mediaIds: post.media.map((m) => m.mediaId),
            scheduledAt: post.scheduledAt,
            status: post.status as PostStatus,
            publishResults: [],
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
        })),
        total,
    };
}

/**
 * Calculate best times for the week based on analytics.
 */
export function generateWeeklySchedule(
    organizationId: string,
    postsPerWeek: number,
    preferredPlatforms: string[]
): { date: Date; platforms: string[]; reason: string }[] {
    // Uses predefined optimal times; analytics-based optimization can enhance this later

    const suggestions: { date: Date; platforms: string[]; reason: string }[] = [];
    const now = new Date();

    const slotsPerDay = Math.ceil(postsPerWeek / 7);
    const optimalTimes = [
        { hour: 9, minute: 0, reason: 'Morning commute engagement' },
        { hour: 12, minute: 0, reason: 'Lunch break browsing' },
        { hour: 19, minute: 30, reason: 'Peak evening engagement' },
    ];

    for (let day = 0; day < 7 && suggestions.length < postsPerWeek; day++) {
        for (let slot = 0; slot < slotsPerDay && suggestions.length < postsPerWeek; slot++) {
            const time = optimalTimes[slot % optimalTimes.length];
            const date = new Date(now);
            date.setDate(date.getDate() + day);
            date.setHours(time.hour, time.minute, 0, 0);

            suggestions.push({
                date,
                platforms: preferredPlatforms,
                reason: time.reason,
            });
        }
    }

    return suggestions;
}

/**
 * Get queue statistics for monitoring.
 */
export async function getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        postPublishQueue.getWaitingCount(),
        postPublishQueue.getActiveCount(),
        postPublishQueue.getCompletedCount(),
        postPublishQueue.getFailedCount(),
        postPublishQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
}
