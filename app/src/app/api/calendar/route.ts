/**
 * Calendar API Route
 * Fetch posts by date range for calendar display
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { startOfDay, endOfDay, addDays } from 'date-fns';
import { generateAiDrafts } from '@/lib/ai/draft-generator';

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

    // Trigger AI draft generation (non-blocking background task)
    // Why: Ensures AI suggestions are refreshed whenever user views calendar
    generateAiDrafts(organizationId).catch(err => {
        console.error('Failed to generate AI drafts:', err);
    });

    // Default to current week if no dates provided
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const start = startParam ? startOfDay(new Date(startParam)) : startOfDay(new Date());
    const end = endParam ? endOfDay(new Date(endParam)) : endOfDay(addDays(start, 6));

    const posts = await db.post.findMany({
        where: {
            organizationId,
            OR: [
                // Draft posts with scheduled date in range
                {
                    status: 'DRAFT',
                    scheduledAt: { gte: start, lte: end }
                },
                // Scheduled posts in date range
                {
                    status: 'SCHEDULED',
                    scheduledAt: { gte: start, lte: end }
                },
                // Currently publishing posts
                {
                    status: 'PUBLISHING',
                    scheduledAt: { gte: start, lte: end }
                },
                // Published posts in date range (internal and external)
                {
                    status: 'PUBLISHED',
                    publishedAt: { gte: start, lte: end }
                },
                // External posts (double check by isExternal flag)
                {
                    isExternal: true,
                    publishedAt: { gte: start, lte: end }
                },
                // Failed posts in date range (check both scheduledAt and publishedAt)
                {
                    status: 'FAILED',
                    scheduledAt: { gte: start, lte: end }
                },
                // Failed posts that may only have publishedAt set
                {
                    status: 'FAILED',
                    scheduledAt: null,
                    publishedAt: { gte: start, lte: end }
                },
                // Failed "publish now" posts: neither scheduledAt nor publishedAt set
                // Why: When autoPublish fails immediately, both timestamps are null
                // Fall back to createdAt so user can see and retry the failed post
                {
                    status: 'FAILED',
                    scheduledAt: null,
                    publishedAt: null,
                    createdAt: { gte: start, lte: end }
                }
            ]
        },
        orderBy: [
            { scheduledAt: 'asc' },
            { publishedAt: 'asc' }
        ],
        include: {
            pillar: { select: { id: true, name: true, color: true } },
            // NEW: Direct socialAccount relation for new-architecture posts
            socialAccount: { select: { platform: true, name: true, avatar: true } },
            // LEGACY: PostPlatform relation for old multi-platform posts
            platforms: {
                include: {
                    socialAccount: {
                        select: { platform: true, name: true }
                    }
                }
            },
            media: {
                include: { media: { select: { thumbnailUrl: true, url: true } } },
                take: 1
            }
        }
    });

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
        // Why: For failed "publish now" posts, both scheduledAt and publishedAt are null
        // Fall back to createdAt so they appear on the correct calendar day
        const dateKey = post.scheduledAt || post.publishedAt || post.createdAt;
        if (!dateKey) return;

        // Why: Use timezone-aware date extraction for correct calendar grouping
        // toLocaleDateString with timeZone option returns the date in the user's local timezone
        const dateStr = dateKey.toLocaleDateString('en-CA', { timeZone: userTimezone });
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

    return NextResponse.json({
        posts: postsByDate,
        dateRange: {
            start: start.toISOString(),
            end: end.toISOString()
        },
        totalPosts: posts.length
    });
}
