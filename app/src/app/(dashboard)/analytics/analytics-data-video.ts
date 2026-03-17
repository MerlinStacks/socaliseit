/**
 * Analytics Data — Video & Platform Queries
 *
 * Why: Extracted to a separate module to keep each file under 200 lines.
 * Contains video performance aggregation and per-platform engagement
 * breakdown queries.
 */

import { db } from '@/lib/db';
import { Platform } from '@/generated/prisma/client';
import { calculateDateRange } from './analytics-data';
import type { VideoPerformanceData } from '@/components/analytics/video-performance-card';
import type { PlatformBreakdownEntry } from '@/components/analytics/platform-breakdown-card';

// ============================================================================
// VIDEO PERFORMANCE
// ============================================================================

/**
 * Aggregate video-specific metrics across all posts in the period.
 * Why: PostAnalytics stores per-post videoViews, videoWatchTime,
 * avgWatchPercentage. platformMetrics stores Reels-specific skip_rate
 * and clips_replays_count. This function rolls them all up.
 */
export async function fetchVideoPerformance(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<VideoPerformanceData> {
    const { start, end } = calculateDateRange(range);
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;

    const where = {
        post: {
            organizationId,
            publishedAt: { gte: start, lte: end },
            ...(platformEnum ? { platform: platformEnum } : {}),
        },
        videoViews: { gt: 0 },
    };

    const [aggregate, videoCount, platformMetricsRows] = await Promise.all([
        db.postAnalytics.aggregate({
            _sum: { videoViews: true, videoWatchTime: true },
            _avg: { avgWatchPercentage: true },
            where,
        }),
        db.postAnalytics.count({ where }),
        // Why: platformMetrics is a JSON field — query posts that have it set
        db.postAnalytics.findMany({
            where: {
                ...where,
                platformMetrics: { not: null as unknown as undefined },
            },
            select: { platformMetrics: true },
            take: 500,
        }),
    ]);

    // Aggregate skip_rate and replays from platformMetrics JSON
    let totalReplays = 0;
    let skipRateSum = 0;
    let skipRateCount = 0;

    for (const row of platformMetricsRows) {
        const pm = row.platformMetrics as Record<string, unknown> | null;
        if (!pm) continue;

        if (typeof pm.clips_replays_count === 'number') {
            totalReplays += pm.clips_replays_count;
        }
        if (typeof pm.skip_rate === 'number') {
            skipRateSum += pm.skip_rate;
            skipRateCount++;
        }
    }

    return {
        totalVideoViews: aggregate._sum.videoViews || 0,
        totalWatchTimeSeconds: aggregate._sum.videoWatchTime || 0,
        avgWatchPercentage: aggregate._avg.avgWatchPercentage || 0,
        totalReplays,
        avgSkipRate: skipRateCount > 0 ? skipRateSum / skipRateCount : 0,
        videoCount,
    };
}

// ============================================================================
// PLATFORM BREAKDOWN
// ============================================================================

/**
 * Per-platform engagement totals for the breakdown chart.
 * Why: The main aggregate query sums across all platforms. This
 * groups by platform so users can see which platform drives engagement.
 */
export async function fetchPlatformBreakdown(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<PlatformBreakdownEntry[]> {
    // If already filtered to one platform, skip the breakdown
    if (platformFilter) return [];

    const { start, end } = calculateDateRange(range);

    const results = await db.postAnalytics.groupBy({
        by: ['postId'],
        _sum: { likes: true, comments: true, shares: true, saves: true },
        _avg: { engagementRate: true },
        where: {
            post: {
                organizationId,
                publishedAt: { gte: start, lte: end },
            },
        },
    });

    // Why: Prisma groupBy on PostAnalytics can't group by post.platform
    // directly, so we resolve platforms via a join query
    const postIds = results.map(r => r.postId).filter((id): id is string => id !== null);
    if (postIds.length === 0) return [];

    const posts = await db.post.findMany({
        where: { id: { in: postIds } },
        select: { id: true, platform: true },
    });

    const platformMap = new Map(posts.map(p => [p.id, p.platform?.toLowerCase() || 'unknown']));

    // Aggregate per platform
    const platformAgg: Record<string, {
        totalEngagement: number;
        postCount: number;
        rateSum: number;
    }> = {};

    for (const r of results) {
        if (!r.postId) continue;
        const platform = platformMap.get(r.postId) || 'unknown';
        if (!platformAgg[platform]) {
            platformAgg[platform] = { totalEngagement: 0, postCount: 0, rateSum: 0 };
        }
        const engagement = (r._sum.likes || 0) + (r._sum.comments || 0) +
            (r._sum.shares || 0) + (r._sum.saves || 0);
        platformAgg[platform].totalEngagement += engagement;
        platformAgg[platform].postCount += 1;
        platformAgg[platform].rateSum += r._avg.engagementRate || 0;
    }

    return Object.entries(platformAgg)
        .map(([platform, agg]) => ({
            platform,
            totalEngagement: agg.totalEngagement,
            postCount: agg.postCount,
            avgEngagementRate: agg.postCount > 0 ? agg.rateSum / agg.postCount : 0,
        }))
        .sort((a, b) => b.totalEngagement - a.totalEngagement);
}

// ============================================================================
// TOP PERFORMING POSTS (by engagement, not recency)
// ============================================================================

export interface TopPerformingPost {
    id: string;
    caption: string;
    thumbnail: string | null;
    platform: string;
    publishedAt: Date | null;
    engagementRate: number;
    likes: number;
    comments: number;
    shares: number;
    videoViews: number;
}

/**
 * Fetch the top-performing posts by engagement rate.
 * Why: The existing "Recent Posts" section sorts by recency.
 * This provides a separate view of what actually performed best.
 */
export async function fetchTopPerformingPosts(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<TopPerformingPost[]> {
    const { start, end } = calculateDateRange(range);
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;

    const analytics = await db.postAnalytics.findMany({
        where: {
            post: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: start, lte: end },
                ...(platformEnum ? { platform: platformEnum } : {}),
            },
        },
        orderBy: { engagementRate: 'desc' },
        take: 5,
        include: {
            post: {
                select: {
                    id: true,
                    caption: true,
                    platform: true,
                    publishedAt: true,
                    media: {
                        include: { media: { select: { thumbnailUrl: true, url: true } } },
                        take: 1,
                    },
                },
            },
        },
    });

    return analytics
        .filter(a => a.post !== null)
        .map(a => ({
        id: a.post!.id,
        caption: a.post!.caption,
        thumbnail: a.post!.media[0]?.media?.thumbnailUrl || a.post!.media[0]?.media?.url || null,
        platform: a.post!.platform?.toLowerCase() || 'unknown',
        publishedAt: a.post!.publishedAt,
        engagementRate: a.engagementRate || 0,
        likes: a.likes || 0,
        comments: a.comments || 0,
        shares: a.shares || 0,
        videoViews: a.videoViews || 0,
    }));
}
