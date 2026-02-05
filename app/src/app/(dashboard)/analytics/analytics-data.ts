/**
 * Analytics Data Fetching and Processing
 * Extracted from page.tsx to maintain 200-line standard
 */

import { db } from '@/lib/db';
import { subDays, startOfDay, format } from 'date-fns';
import { Platform } from '@/generated/prisma/client';
import { getEngagementHeatmap } from '@/app/actions/analytics';

// Types
export interface AnalyticsParams {
    organizationId: string;
    platformFilter?: string;
    range: string;
}

export interface DateRange {
    start: Date;
    end: Date;
    prevStart: Date;
}

export interface EngagementData {
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
    totalReach: number;
    avgEngagementRate: number;
    likesChange: number;
    commentsChange: number;
    sharesChange: number;
    reachChange: number;
}

export interface TopPost {
    id: string;
    caption: string;
    thumbnail: string | null;
    platforms: string[];
    publishedAt: Date | null;
    metrics: { likes: number; comments: number; shares: number };
}

export interface TimelinePoint {
    day: string;
    count: number;
}

/**
 * Calculate date range based on range string
 */
export function calculateDateRange(range: string): DateRange {
    const end = new Date();
    let start = subDays(end, 7);
    let prevStart = subDays(start, 7);

    if (range === '30d') {
        start = subDays(end, 30);
        prevStart = subDays(start, 30);
    } else if (range === '90d') {
        start = subDays(end, 90);
        prevStart = subDays(start, 90);
    } else if (range === 'year') {
        start = subDays(end, 365);
        prevStart = subDays(start, 365);
    }

    return { start, end, prevStart };
}

/**
 * Calculate percentage change between current and previous period
 */
export function calcChange(curr: number, prev: number): number {
    return prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
}

/**
 * Fetch all analytics data in parallel
 */
export async function fetchAnalyticsData(params: AnalyticsParams) {
    const { organizationId, platformFilter, range } = params;
    const { start, end, prevStart } = calculateDateRange(range);

    // Platform filter
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;
    const platformWhere = platformEnum
        ? { platforms: { some: { socialAccount: { platform: platformEnum } } } }
        : {};

    // Common WHERE clause for Posts
    const whereBase = {
        organizationId,
        ...platformWhere,
    };

    const [
        socialAccounts,
        totalPosts,
        publishedPosts,
        scheduledPosts,
        recentPublished,
        postsInPeriod,
        previousPeriodPosts,
        competitors,
        myEngagementStats,
        engagementMetrics,
        previousEngagement,
        heatmapData
    ] = await Promise.all([
        // Connected social accounts
        db.socialAccount.findMany({
            where: { organizationId, isActive: true },
            select: { id: true, platform: true, name: true, username: true },
        }),

        // Total posts count
        db.post.count({ where: whereBase }),

        // Published posts count
        db.post.count({ where: { ...whereBase, status: 'PUBLISHED' } }),

        // Scheduled posts count
        db.post.count({ where: { ...whereBase, status: 'SCHEDULED' } }),

        // Recent published posts (for top posts section)
        db.post.findMany({
            where: { ...whereBase, status: 'PUBLISHED' },
            include: {
                platforms: {
                    include: {
                        socialAccount: true,
                        analytics: true
                    },
                },
                media: {
                    include: { media: true },
                    take: 1,
                },
            },
            orderBy: { publishedAt: 'desc' },
            take: 5,
        }),

        // Posts in current period
        db.post.count({
            where: { ...whereBase, createdAt: { gte: start, lte: end } },
        }),

        // Posts in previous period
        db.post.count({
            where: { ...whereBase, createdAt: { gte: prevStart, lt: start } },
        }),

        // Competitors
        db.competitor.findMany({
            where: {
                organizationId,
                ...(platformEnum ? { platform: platformEnum } : {})
            },
            orderBy: { followers: 'desc' },
            take: 5
        }),

        // My Engagement Stats (Avg Engagement Rate)
        db.postAnalytics.aggregate({
            _avg: { engagementRate: true },
            where: {
                postPlatform: {
                    socialAccount: {
                        organizationId,
                        ...(platformEnum ? { platform: platformEnum } : {})
                    }
                }
            }
        }),

        // Aggregated engagement metrics for the period
        db.postAnalytics.aggregate({
            _sum: { likes: true, comments: true, shares: true, saves: true, impressions: true, reach: true },
            _avg: { engagementRate: true },
            where: {
                postPlatform: {
                    post: { organizationId, publishedAt: { gte: start, lte: end } },
                    socialAccount: platformEnum ? { platform: platformEnum } : undefined
                }
            }
        }),

        // Previous period engagement for comparison
        db.postAnalytics.aggregate({
            _sum: { likes: true, comments: true, shares: true, saves: true, impressions: true, reach: true },
            where: {
                postPlatform: {
                    post: { organizationId, publishedAt: { gte: prevStart, lt: start } },
                    socialAccount: platformEnum ? { platform: platformEnum } : undefined
                }
            }
        }),

        // Best time to post (Heatmap Data)
        getEngagementHeatmap(organizationId, platformFilter)
    ]);

    // Determine if there's any meaningful data to display
    const hasData = totalPosts > 0 || publishedPosts > 0 || socialAccounts.length > 0;

    return {
        socialAccounts,
        totalPosts,
        publishedPosts,
        scheduledPosts,
        recentPublished,
        postsInPeriod,
        previousPeriodPosts,
        competitors,
        myEngagementStats,
        engagementMetrics,
        previousEngagement,
        heatmapData,
        dateRange: { start, end, prevStart },
        platformEnum,
        // For empty state handling
        hasData,
        isEmpty: totalPosts === 0 && publishedPosts === 0,
    };
}

/**
 * Build timeline data for chart
 */
export async function buildTimelineData(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<TimelinePoint[]> {
    const { end } = calculateDateRange(range);
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;
    const platformWhere = platformEnum
        ? { platforms: { some: { socialAccount: { platform: platformEnum } } } }
        : {};
    const whereBase = { organizationId, ...platformWhere };

    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 12 : 12;

    return Promise.all(
        Array.from({ length: Math.min(days, 14) }, async (_, i) => {
            const dayStart = startOfDay(subDays(end, Math.min(days, 14) - 1 - i));
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const count = await db.post.count({
                where: {
                    ...whereBase,
                    OR: [
                        { publishedAt: { gte: dayStart, lt: dayEnd } },
                        { scheduledAt: { gte: dayStart, lt: dayEnd } },
                    ],
                },
            });

            return {
                day: format(dayStart, range === 'year' ? 'MMM' : 'EEE'),
                count,
            };
        })
    );
}

/**
 * Process engagement data from database results
 */
export function processEngagementData(
    engagementMetrics: { _sum: { likes?: number | null; comments?: number | null; shares?: number | null; saves?: number | null; reach?: number | null }; _avg: { engagementRate?: number | null } },
    previousEngagement: { _sum: { likes?: number | null; comments?: number | null; shares?: number | null; reach?: number | null } }
): EngagementData {
    const totalLikes = engagementMetrics._sum.likes || 0;
    const totalComments = engagementMetrics._sum.comments || 0;
    const totalShares = engagementMetrics._sum.shares || 0;
    const totalSaves = engagementMetrics._sum.saves || 0;
    const totalReach = engagementMetrics._sum.reach || 0;
    const avgEngagementRate = engagementMetrics._avg.engagementRate || 0;

    const prevLikes = previousEngagement._sum.likes || 0;
    const prevComments = previousEngagement._sum.comments || 0;
    const prevShares = previousEngagement._sum.shares || 0;
    const prevReach = previousEngagement._sum.reach || 0;

    return {
        totalLikes,
        totalComments,
        totalShares,
        totalSaves,
        totalReach,
        avgEngagementRate,
        likesChange: calcChange(totalLikes, prevLikes),
        commentsChange: calcChange(totalComments, prevComments),
        sharesChange: calcChange(totalShares, prevShares),
        reachChange: calcChange(totalReach, prevReach),
    };
}

/**
 * Transform posts for mobile display
 */
export function transformTopPosts(posts: Array<{
    id: string;
    caption: string;
    publishedAt: Date | null;
    media: Array<{ media: { thumbnailUrl?: string | null; url: string } | null }>;
    platforms: Array<{
        socialAccount: { platform: Platform } | null;
        analytics: { likes?: number | null; comments?: number | null; shares?: number | null } | null;
    }>;
}>): TopPost[] {
    return posts.map(post => ({
        id: post.id,
        caption: post.caption,
        thumbnail: post.media[0]?.media?.thumbnailUrl || post.media[0]?.media?.url || null,
        platforms: post.platforms.map(p => p.socialAccount?.platform?.toLowerCase() || 'unknown'),
        publishedAt: post.publishedAt,
        metrics: post.platforms.reduce((acc, pp) => ({
            likes: acc.likes + (pp.analytics?.likes || 0),
            comments: acc.comments + (pp.analytics?.comments || 0),
            shares: acc.shares + (pp.analytics?.shares || 0)
        }), { likes: 0, comments: 0, shares: 0 })
    }));
}
