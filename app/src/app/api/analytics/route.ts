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

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
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
            where: { organizationId, isActive: true, ...platformFilter },
            select: { id: true, platform: true, name: true, username: true },
        }),

        // Total posts count
        db.post.count({
            where: { organizationId },
        }),

        // Published posts count
        db.post.count({
            where: { organizationId, status: 'PUBLISHED' },
        }),

        // Scheduled posts count
        db.post.count({
            where: { organizationId, status: 'SCHEDULED' },
        }),

        // Draft posts count
        db.post.count({
            where: { organizationId, status: 'DRAFT' },
        }),

        // Recent posts with platform info (top posts)
        db.post.findMany({
            where: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: start, lte: end },
            },
            include: {
                socialAccount: {
                    select: { platform: true },
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
                organizationId,
                createdAt: { gte: start, lte: end },
            },
        }),

        // Posts in previous period (for comparison)
        db.post.count({
            where: {
                organizationId,
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

    // Build timeline data — single query replaces N per-day COUNTs
    // Why: Fetches all posts in the window once, then buckets by date in JS
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const displayDays = Math.min(periodDays, 30);

    const timelinePosts = await db.post.findMany({
        where: {
            organizationId,
            OR: [
                { publishedAt: { gte: startOfDay(subDays(end, displayDays - 1)), lt: end } },
                { scheduledAt: { gte: startOfDay(subDays(end, displayDays - 1)), lt: end } },
            ],
        },
        select: { publishedAt: true, scheduledAt: true },
    });

    // Bucket posts into date keys
    const dateCounts: Record<string, number> = {};
    for (const p of timelinePosts) {
        const ts = p.publishedAt ?? p.scheduledAt;
        if (!ts) continue;
        const key = format(startOfDay(ts), 'yyyy-MM-dd');
        dateCounts[key] = (dateCounts[key] || 0) + 1;
    }

    const timelineData = Array.from({ length: displayDays }, (_, i) => {
        const day = startOfDay(subDays(end, displayDays - 1 - i));
        const key = format(day, 'yyyy-MM-dd');
        return { date: key, posts: dateCounts[key] || 0 };
    });

    // Build platform breakdown — group posts by platform directly
    const platformBreakdown = await db.post.groupBy({
        by: ['platform'],
        where: {
            organizationId,
            publishedAt: { gte: start, lte: end },
            platform: { not: null },
        },
        _count: true,
    });

    const platformAggregated = platformBreakdown.map(pb => ({
        platform: pb.platform || 'UNKNOWN',
        name: pb.platform || 'Unknown',
        posts: pb._count,
    }));

    // Format top posts
    const topPosts = recentPosts.map(post => ({
        id: post.id,
        caption: post.caption.slice(0, 100) + (post.caption.length > 100 ? '...' : ''),
        platform: post.socialAccount?.platform?.toLowerCase() || post.platform?.toLowerCase() || 'unknown',
        publishedAt: post.publishedAt,
        thumbnail: post.media[0]?.media?.thumbnailUrl || post.media[0]?.media?.url || null,
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

    return NextResponse.json(analytics, {
        headers: {
            'Cache-Control': 'private, max-age=120, stale-while-revalidate=300',
        },
    });
}
