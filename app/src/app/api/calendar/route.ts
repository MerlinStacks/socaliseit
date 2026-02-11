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

    // Calculate today's date for unscheduled drafts display
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA');
    const todayIsInRange = today >= start && today <= end;

    /**
     * Split into two queries for better index utilization:
     * 1. Date-range posts — hits @@index([organizationId, scheduledAt]) and @@index([organizationId, publishedAt])
     * 2. Problem posts — small result set (stuck, overdue, unscheduled) only when today is visible
     */
    const calendarInclude = {
        pillar: { select: { id: true, name: true, color: true } },
        socialAccount: { select: { platform: true, name: true, avatar: true } },
        platforms: {
            include: {
                socialAccount: {
                    select: { platform: true, name: true }
                }
            }
        },
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

    // Why: Accept user's timezone for correct date grouping
    // Without this, a post at 9AM Feb 5 AEDT (UTC+11) would be grouped under Feb 4 (10PM UTC)
    const userTimezone = searchParams.get('timezone') || 'UTC';

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

        // NEW ARCHITECTURE: Post has platform set directly (independent posts)
        // Why: Each Post is now its own calendar entry; no need to iterate PostPlatform
        if (post.platform && post.socialAccountId) {
            postsByDate[dateStr].push({
                id: post.id,
                time: isoString,
                caption: post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : ''),
                platform: post.platform.toLowerCase(),
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
                // Why: For new architecture, dragKey = id (no need for composite key)
                dragKey: post.id,
                linkedGroupId: post.linkedGroupId,
            });
            return; // Skip legacy handling for new-architecture posts
        }

        // LEGACY: Post uses PostPlatform relation (old multi-platform posts)
        // Why: Create a calendar entry for EACH platform on multi-platform posts
        const platformsToRender = post.platforms.length > 0 ? post.platforms : [null];

        platformsToRender.forEach(platform => {
            postsByDate[dateStr].push({
                id: post.id,
                time: isoString, // Frontend will format this in user's timezone
                caption: post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : ''),
                platform: platform?.socialAccount.platform.toLowerCase() || 'unknown',
                // Why: Use per-platform status (PostPlatform.status) instead of overall Post.status
                // This correctly shows FAILED for individual platforms when partial publishing fails
                status: (platform?.status || post.status).toLowerCase(),
                // Why: External posts use externalThumbnailUrl stored on Post (not Media records)
                // This prevents media library pollution and handles expired CDN URLs gracefully
                thumbnail: post.isExternal
                    ? post.externalThumbnailUrl
                    : (post.media[0]?.media.thumbnailUrl || post.media[0]?.media.url || null),
                pillarColor: post.pillar?.color || null,
                isExternal: post.isExternal,
                externalUrl: post.externalUrl,
                postType: platform?.postType?.toLowerCase() || 'feed',
                // Why: Include account name for hover tooltip display
                accountName: platform?.socialAccount.name || 'Unknown Account',
                // Why: Include AI flag for special rendering (dashed borders, sparkle badge)
                isAiGenerated: post.isAiGenerated || false,
                // Why: Unique key for drag tracking allows multi-platform posts to drag independently
                dragKey: `${post.id}:${platform?.socialAccount.platform.toLowerCase() || 'unknown'}`,
            });
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

    return NextResponse.json({
        posts: postsByDate,
        dateRange: {
            start: start.toISOString(),
            end: end.toISOString()
        },
        totalPosts: posts.length
    });
}
