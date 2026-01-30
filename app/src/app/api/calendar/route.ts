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

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const { searchParams } = new URL(request.url);

    // Default to current week if no dates provided
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const start = startParam ? startOfDay(new Date(startParam)) : startOfDay(new Date());
    const end = endParam ? endOfDay(new Date(endParam)) : endOfDay(addDays(start, 6));

    const posts = await db.post.findMany({
        where: {
            workspaceId,
            OR: [
                // Scheduled posts in date range
                {
                    status: 'SCHEDULED',
                    scheduledAt: { gte: start, lte: end }
                },
                // Published posts in date range
                {
                    status: 'PUBLISHED',
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
    }>> = {};

    posts.forEach(post => {
        const dateKey = post.scheduledAt || post.publishedAt;
        if (!dateKey) return;

        const dateStr = dateKey.toISOString().split('T')[0];
        const timeStr = dateKey.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        if (!postsByDate[dateStr]) {
            postsByDate[dateStr] = [];
        }

        postsByDate[dateStr].push({
            id: post.id,
            time: timeStr,
            caption: post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : ''),
            platform: post.platforms[0]?.socialAccount.platform.toLowerCase() || 'unknown',
            status: post.status.toLowerCase(),
            thumbnail: post.media[0]?.media.thumbnailUrl || post.media[0]?.media.url || null,
            pillarColor: post.pillar?.color || null
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
