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
                }
            ]
        },
        orderBy: [
            { scheduledAt: 'asc' },
            { publishedAt: 'asc' }
        ],
        include: {
            pillar: { select: { id: true, name: true, color: true } },
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
    }>> = {};

    posts.forEach(post => {
        const dateKey = post.scheduledAt || post.publishedAt;
        if (!dateKey) return;

        // Why: Return ISO string and let frontend handle timezone formatting
        // Server-side toLocaleTimeString would use server timezone (UTC in Docker), not user's
        const isoString = dateKey.toISOString();
        const dateStr = isoString.split('T')[0];

        if (!postsByDate[dateStr]) {
            postsByDate[dateStr] = [];
        }

        const firstPlatform = post.platforms[0];
        postsByDate[dateStr].push({
            id: post.id,
            time: isoString, // Frontend will format this in user's timezone
            caption: post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : ''),
            platform: firstPlatform?.socialAccount.platform.toLowerCase() || 'unknown',
            status: post.status.toLowerCase(),
            // Why: External posts use externalThumbnailUrl stored on Post (not Media records)
            // This prevents media library pollution and handles expired CDN URLs gracefully
            thumbnail: post.isExternal
                ? post.externalThumbnailUrl
                : (post.media[0]?.media.thumbnailUrl || post.media[0]?.media.url || null),
            pillarColor: post.pillar?.color || null,
            isExternal: post.isExternal,
            externalUrl: post.externalUrl,
            // Why: Include post type for calendar icons (story/reel/carousel indicators)
            postType: firstPlatform?.postType?.toLowerCase() || 'feed',
            // Why: Include account name for hover tooltip display
            accountName: firstPlatform?.socialAccount.name || 'Unknown Account',
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
