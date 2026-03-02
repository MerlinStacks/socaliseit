/**
 * Calendar API Route
 * Fetch posts by date range for calendar display
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { startOfDay, endOfDay, addDays } from 'date-fns';

/**
 * GET /api/calendar - Get posts for calendar view
 * Query params: start (ISO date), end (ISO date), view (week|month)
 */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);

    // Default to current week if no dates provided
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const start = startParam ? startOfDay(new Date(startParam)) : startOfDay(new Date());
    const end = endParam ? endOfDay(new Date(endParam)) : endOfDay(addDays(start, 6));

    // Why: Must read timezone before computing "today" so problem posts
    // land on the correct calendar date in the user's local timezone
    const userTimezone = searchParams.get('timezone') || 'UTC';

    // Calculate today's date for unscheduled drafts display
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA', { timeZone: userTimezone });
    const todayIsInRange = today >= start && today <= end;

    /**
     * Split into two queries for better index utilization:
     * 1. Date-range posts — hits @@index([organizationId, scheduledAt]) and @@index([organizationId, publishedAt])
     * 2. Problem posts — small result set (stuck, overdue, unscheduled) only when today is visible
     */
    const calendarInclude = {
        pillar: { select: { id: true, name: true, color: true } },
        socialAccount: { select: { platform: true, name: true, avatar: true } },
        media: {
            include: { media: { select: { thumbnailUrl: true, url: true } } },
            take: 1 as const
        }
    } as const;

    // Query 1: Date-range posts (index-friendly — simple range filters)
    const dateRangeQuery = db.post.findMany({
        where: {
            organizationId,
            OR: [
                { status: 'DRAFT', scheduledAt: { gte: start, lte: end } },
                { status: 'SCHEDULED', scheduledAt: { gte: start, lte: end } },
                { status: 'PUBLISHING', scheduledAt: { gte: start, lte: end } },
                { status: 'PUBLISHED', publishedAt: { gte: start, lte: end } },
                { isExternal: true, publishedAt: { gte: start, lte: end } },
                { status: 'FAILED', scheduledAt: { gte: start, lte: end } },
                { status: 'FAILED', scheduledAt: null, publishedAt: { gte: start, lte: end } },
            ]
        },
        orderBy: [{ scheduledAt: 'asc' }, { publishedAt: 'asc' }],
        include: calendarInclude,
    });

    // Query 2: Problem posts — only when today is in view range (tiny result set)
    const problemQuery = todayIsInRange
        ? db.post.findMany({
            where: {
                organizationId,
                OR: [
                    // Unscheduled drafts
                    { status: 'DRAFT', scheduledAt: null },
                    // Failed with no timestamps
                    { status: 'FAILED', scheduledAt: null, publishedAt: null },
                    // Overdue scheduled
                    { status: 'SCHEDULED', scheduledAt: { lt: new Date() } },
                    // Stuck publishing (>20 min)
                    { status: 'PUBLISHING', scheduledAt: { lt: new Date(Date.now() - 20 * 60 * 1000) } },
                    // Publish-now stuck (no scheduledAt)
                    { status: 'PUBLISHING', scheduledAt: null },
                    { status: 'SCHEDULED', scheduledAt: null },
                    // Catch-all: no timestamps
                    { scheduledAt: null, publishedAt: null },
                ]
            },
            orderBy: [{ scheduledAt: 'asc' }, { publishedAt: 'asc' }],
            include: calendarInclude,
        })
        : Promise.resolve([]);

    const [dateRangePosts, problemPosts] = await Promise.all([dateRangeQuery, problemQuery]);

    // Merge and deduplicate (problem posts may overlap with date-range results)
    const seenIds = new Set(dateRangePosts.map(p => p.id));
    const posts = [
        ...dateRangePosts,
        ...problemPosts.filter(p => !seenIds.has(p.id)),
    ];

    // Why: userTimezone is declared above (before todayStr) so problem posts
    // and date-grouped posts both use the same timezone

    // Group posts by date for calendar rendering
    const postsByDate: Record<string, Array<{
        id: string;
        time: string;
        caption: string;
        platform: string;
        status: string;
        thumbnail: string | null;
        pillarColor: string | null;
        isExternal: boolean;
        externalUrl: string | null;
        postType: string;
        accountName: string;
        isAiGenerated: boolean;
        dragKey: string;
        linkedGroupId?: string | null; // NEW: Links related multi-platform posts
    }>> = {};

    posts.forEach(post => {
        // Determine if this is a "problem post" that should appear on today's date
        const isUnscheduledDraft = post.status === 'DRAFT' && !post.scheduledAt;
        const isFailedNoTimestamp = post.status === 'FAILED' && !post.scheduledAt && !post.publishedAt;
        const isOverdueScheduled = post.status === 'SCHEDULED' && post.scheduledAt && post.scheduledAt < today;
        const isStuckPublishing = post.status === 'PUBLISHING' && post.scheduledAt &&
            post.scheduledAt < new Date(Date.now() - 20 * 60 * 1000);
        // "Publish Now" posts that are stuck without scheduledAt
        const isPublishNowStuck = (post.status === 'PUBLISHING' || post.status === 'SCHEDULED') && !post.scheduledAt;

        const showOnToday = isUnscheduledDraft || isFailedNoTimestamp || isOverdueScheduled || isStuckPublishing || isPublishNowStuck;

        // For problem posts, use today's date; otherwise use scheduled/published/created date
        const dateKey = showOnToday
            ? today
            : (post.scheduledAt || post.publishedAt || post.createdAt);
        if (!dateKey) return;

        // Why: Use timezone-aware date extraction for correct calendar grouping
        // toLocaleDateString with timeZone option returns the date in the user's local timezone
        const dateStr = showOnToday
            ? todayStr
            : dateKey.toLocaleDateString('en-CA', { timeZone: userTimezone });
        const isoString = dateKey.toISOString();

        if (!postsByDate[dateStr]) {
            postsByDate[dateStr] = [];
        }

        // Why: Each Post is now its own calendar entry with platform set directly
        const platform = post.platform?.toLowerCase() || 'unknown';
        postsByDate[dateStr].push({
            id: post.id,
            time: isoString,
            caption: post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : ''),
            platform,
            status: post.status.toLowerCase(),
            thumbnail: post.isExternal
                ? post.externalThumbnailUrl
                : (post.media[0]?.media.thumbnailUrl || post.media[0]?.media.url || null),
            pillarColor: post.pillar?.color || null,
            isExternal: post.isExternal,
            externalUrl: post.externalUrl,
            postType: post.postType?.toLowerCase() || 'feed',
            accountName: post.socialAccount?.name || 'Unknown Account',
            isAiGenerated: post.isAiGenerated || false,
            dragKey: post.id,
            linkedGroupId: post.linkedGroupId,
        });
    });

    // Why: Sort each day's posts so AI-generated drafts appear below scheduled posts
    // This ensures user-created content has visual priority over AI suggestions
    Object.keys(postsByDate).forEach(dateKey => {
        postsByDate[dateKey].sort((a, b) => {
            // Non-AI posts come before AI-generated posts
            if (a.isAiGenerated !== b.isAiGenerated) {
                return a.isAiGenerated ? 1 : -1;
            }
            // Within the same category, sort by time (earlier first)
            return new Date(a.time).getTime() - new Date(b.time).getTime();
        });
    });

    /**
     * Why: SWR-style caching header lets the browser and any CDN/proxy serve
     * cached calendar data instantly while revalidating in the background.
     * This pairs with React Query's 30s staleTime on the client.
     */
    return NextResponse.json({
        posts: postsByDate,
        dateRange: {
            start: start.toISOString(),
            end: end.toISOString()
        },
        totalPosts: posts.length
    }, {
        headers: {
            'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
        },
    });
}
