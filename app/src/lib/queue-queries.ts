/**
 * Queue Queries — Read-only helpers for listing and summarising queue state.
 * Why: Extracted from queue.ts (535→~340 lines) to keep the core mutation
 * logic (schedule/publish/cancel/retry) in one file and pure queries here.
 */

import { db } from '@/lib/db';
import { postPublishQueue } from '@/lib/bullmq/queues';
import { type QueuedPost, type PostStatus } from '@/lib/queue';

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
            socialAccount: { select: { platform: true } },
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
        platforms: post.platform ? [post.platform] : [],
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
                socialAccount: { select: { platform: true } },
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
            platforms: post.platform ? [post.platform] : [],
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
 *
 * @param _organizationId - Reserved for future analytics-based optimization.
 *   Currently unused but kept in the signature to avoid breaking callers
 *   when analytics-driven scheduling is implemented.
 */
export function generateWeeklySchedule(
    _organizationId: string,
    postsPerWeek: number,
    preferredPlatforms: string[]
): { date: Date; platforms: string[]; reason: string }[] {
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

            // Why (BUG-11): Skip slots that are already in the past (e.g.
            // 9 AM today when it's currently 5 PM).
            if (date.getTime() <= now.getTime()) continue;

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
