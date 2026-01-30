/**
 * Post Queue Manager
 * Handles scheduling, queueing, and publishing posts via BullMQ
 */

import { db } from '@/lib/db';
import { postPublishQueue, PostPublishJobData } from '@/lib/bullmq/queues';
import { logger } from '@/lib/logger';

export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

export interface QueuedPost {
    id: string;
    workspaceId: string;
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
    workspaceId: string,
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

    if (post.status !== 'DRAFT' && post.status !== 'FAILED') {
        throw new Error(`Cannot schedule post in ${post.status} status`);
    }

    // Get platform IDs from post
    const platformIds = post.platforms.map((p) => p.socialAccountId);

    // Add job to BullMQ queue
    const jobData: PostPublishJobData = {
        postId,
        workspaceId,
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
    workspaceId: string,
    newDatetime: Date
): Promise<{ success: boolean; scheduledAt: Date; jobId: string }> {
    await cancelScheduledPost(postId);
    return schedulePost(postId, workspaceId, {
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
    workspaceId: string
): Promise<{ success: boolean; jobId: string }> {
    const post = await db.post.findUnique({
        where: { id: postId },
        include: { platforms: true },
    });

    if (!post) {
        throw new Error(`Post not found: ${postId}`);
    }

    const platformIds = post.platforms.map((p) => p.socialAccountId);

    const jobData: PostPublishJobData = {
        postId,
        workspaceId,
        platformIds,
    };

    const job = await postPublishQueue.add(`publish-now-${postId}`, jobData, {
        jobId: `post-now-${postId}-${Date.now()}`,
    });

    logger.info({ postId, jobId: job.id }, 'Post queued for immediate publishing');

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
    workspaceId: string
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

    // Get failed platform IDs
    const failedPlatformIds = post.platforms
        .filter((p) => p.status === 'FAILED')
        .map((p) => p.socialAccountId);

    const jobData: PostPublishJobData = {
        postId,
        workspaceId,
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
 * Get upcoming posts in the queue from the database.
 */
export async function getUpcomingPosts(
    workspaceId: string,
    limit: number = 10
): Promise<QueuedPost[]> {
    const posts = await db.post.findMany({
        where: {
            workspaceId,
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
        workspaceId: post.workspaceId,
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
    workspaceId: string,
    options: { limit?: number; offset?: number; status?: PostStatus }
): Promise<{ posts: QueuedPost[]; total: number }> {
    const { limit = 20, offset = 0, status } = options;

    const where = {
        workspaceId,
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
            workspaceId: post.workspaceId,
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
    workspaceId: string,
    postsPerWeek: number,
    preferredPlatforms: string[]
): { date: Date; platforms: string[]; reason: string }[] {
    // TODO: Implement analytics-based optimization
    // For now, use predefined optimal times

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
