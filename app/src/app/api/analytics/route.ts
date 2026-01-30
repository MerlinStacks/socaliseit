/**
 * Analytics API Route
 * Fetch analytics data for dashboard and reports from real database
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { startOfDay, subDays, format } from 'date-fns';

// GET /api/analytics
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';
    const platform = searchParams.get('platform');

    // Calculate date range
    const end = new Date();
    const start = new Date();

    switch (period) {
        case '24h':
            start.setDate(start.getDate() - 1);
            break;
        case '7d':
            start.setDate(start.getDate() - 7);
            break;
        case '30d':
            start.setDate(start.getDate() - 30);
            break;
        case '90d':
            start.setDate(start.getDate() - 90);
            break;
        case 'year':
            start.setFullYear(start.getFullYear() - 1);
            break;
    }

    // Build platform filter
    const platformFilter = platform && platform !== 'all'
        ? { platform: platform.toUpperCase() as 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'GOOGLE_BUSINESS' | 'LINKEDIN' | 'BLUESKY' }
        : {};

    // Fetch real data from database
    const [
        socialAccounts,
        totalPosts,
        publishedPosts,
        scheduledPosts,
        draftPosts,
        recentPosts,
        postsInPeriod,
        previousPeriodPosts,
    ] = await Promise.all([
        // Connected social accounts
        db.socialAccount.findMany({
            where: { workspaceId, isActive: true, ...platformFilter },
            select: { id: true, platform: true, name: true, username: true },
        }),

        // Total posts count
        db.post.count({
            where: { workspaceId },
        }),

        // Published posts count
        db.post.count({
            where: { workspaceId, status: 'PUBLISHED' },
        }),

        // Scheduled posts count
        db.post.count({
            where: { workspaceId, status: 'SCHEDULED' },
        }),

        // Draft posts count
        db.post.count({
            where: { workspaceId, status: 'DRAFT' },
        }),

        // Recent posts with platform info (top posts)
        db.post.findMany({
            where: {
                workspaceId,
                status: 'PUBLISHED',
                publishedAt: { gte: start, lte: end },
            },
            include: {
                platforms: {
                    include: {
                        socialAccount: true,
                    },
                },
                media: {
                    include: {
                        media: true,
                    },
                    take: 1,
                },
            },
            orderBy: { publishedAt: 'desc' },
            take: 10,
        }),

        // Posts in current period
        db.post.count({
            where: {
                workspaceId,
                createdAt: { gte: start, lte: end },
            },
        }),

        // Posts in previous period (for comparison)
        db.post.count({
            where: {
                workspaceId,
                createdAt: {
                    gte: new Date(start.getTime() - (end.getTime() - start.getTime())),
                    lt: start,
                },
            },
        }),
    ]);

    // Calculate posts change percentage
    const postsChange = previousPeriodPosts > 0
        ? ((postsInPeriod - previousPeriodPosts) / previousPeriodPosts) * 100
        : postsInPeriod > 0 ? 100 : 0;

    // Build timeline data (posts per day for the period)
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const timelineData = await Promise.all(
        Array.from({ length: Math.min(periodDays, 30) }, async (_, i) => {
            const dayStart = startOfDay(subDays(end, periodDays - 1 - i));
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const count = await db.post.count({
                where: {
                    workspaceId,
                    OR: [
                        { publishedAt: { gte: dayStart, lt: dayEnd } },
                        { scheduledAt: { gte: dayStart, lt: dayEnd } },
                    ],
                },
            });

            return {
                date: format(dayStart, 'yyyy-MM-dd'),
                posts: count,
            };
        })
    );

    // Build platform breakdown
    const platformBreakdown = await db.postPlatform.groupBy({
        by: ['socialAccountId'],
        where: {
            post: {
                workspaceId,
                publishedAt: { gte: start, lte: end },
            },
        },
        _count: true,
    });

    // Map platform breakdown to account names
    const platformStats = await Promise.all(
        platformBreakdown.map(async (pb) => {
            const account = await db.socialAccount.findUnique({
                where: { id: pb.socialAccountId },
                select: { platform: true, name: true },
            });
            return {
                platform: account?.platform || 'UNKNOWN',
                name: account?.name || 'Unknown',
                posts: pb._count,
            };
        })
    );

    // Aggregate by platform
    const platformAggregated = platformStats.reduce((acc, curr) => {
        const existing = acc.find(a => a.platform === curr.platform);
        if (existing) {
            existing.posts += curr.posts;
        } else {
            acc.push({ ...curr });
        }
        return acc;
    }, [] as typeof platformStats);

    // Format top posts
    const topPosts = recentPosts.map(post => ({
        id: post.id,
        caption: post.caption.slice(0, 100) + (post.caption.length > 100 ? '...' : ''),
        platform: post.platforms[0]?.socialAccount?.platform?.toLowerCase() || 'unknown',
        publishedAt: post.publishedAt,
        thumbnail: post.media[0]?.media?.thumbnailUrl || post.media[0]?.media?.url || null,
        // Note: Engagement metrics (likes, comments, shares) would come from platform API webhooks
        // For now, show placeholder until platform sync is implemented
        hasEngagementData: false,
    }));

    const analytics = {
        period: { start: start.toISOString(), end: end.toISOString() },
        summary: {
            totalPosts,
            publishedPosts,
            scheduledPosts,
            draftPosts,
            postsInPeriod,
            postsChange: Math.round(postsChange * 10) / 10,
            connectedAccounts: socialAccounts.length,
        },
        accounts: socialAccounts,
        platforms: platformAggregated,
        timeline: timelineData,
        topPosts,
        // Engagement metrics require platform API integration
        // These will be populated when webhook/sync is implemented
        engagement: {
            available: false,
            message: 'Engagement metrics require syncing with social platforms',
        },
    };

    return NextResponse.json(analytics);
}
