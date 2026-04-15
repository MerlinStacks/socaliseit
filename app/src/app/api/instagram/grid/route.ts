/**
 * Instagram Grid Planner API
 *
 * Returns a merged, ordered list of published + scheduled Instagram posts
 * for rendering a profile grid preview. Scheduled/draft posts appear at
 * the top (they'll be newest when published), published posts flow below.
 *
 * Why separate from /api/calendar: The calendar groups by date with timezone
 * logic. The grid needs a flat ordered list per-account, with external post
 * thumbnails and media type info that the calendar doesn't return.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export interface GridPost {
    id: string;
    thumbnailUrl: string | null;
    mediaType: string;
    status: 'draft' | 'scheduled' | 'published' | 'failed';
    scheduledAt: string | null;
    publishedAt: string | null;
    caption: string;
    postType: string;
    isExternal: boolean;
    externalUrl: string | null;
}

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;

    const accountId = request.nextUrl.searchParams.get('accountId');
    if (!accountId) {
        return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    // Verify the account belongs to this org and is Instagram
    const account = await db.socialAccount.findFirst({
        where: {
            id: accountId,
            organizationId,
            platform: 'INSTAGRAM',
        },
        select: { id: true, username: true, avatar: true },
    });

    if (!account) {
        return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 });
    }

    const limit = Math.min(
        parseInt(request.nextUrl.searchParams.get('limit') || '60', 10),
        120,
    );

    // Fetch scheduled/draft posts (will appear at top of grid)
    // Why: These are user-created posts that haven't been published yet.
    // Exclude stories — they don't appear in the Instagram profile grid.
    const pendingPosts = await db.post.findMany({
        where: {
            socialAccountId: accountId,
            organizationId,
            platform: 'INSTAGRAM',
            status: { in: ['DRAFT', 'SCHEDULED'] },
            postType: { not: 'STORY' },
        },
        include: {
            media: {
                include: { media: { select: { url: true, thumbnailUrl: true, mimeType: true } } },
                orderBy: { order: 'asc' },
                take: 1,
            },
        },
        orderBy: [{ scheduledAt: 'asc' }],
    });

    // Fetch published posts (both internal and external/synced)
    // Why: External posts are synced from Instagram via posts-sync-service.
    // Internal published posts were created in our app. Both appear in the grid.
    const publishedPosts = await db.post.findMany({
        where: {
            socialAccountId: accountId,
            organizationId,
            platform: 'INSTAGRAM',
            status: 'PUBLISHED',
            postType: { not: 'STORY' },
        },
        include: {
            media: {
                include: { media: { select: { url: true, thumbnailUrl: true, mimeType: true } } },
                orderBy: { order: 'asc' },
                take: 1,
            },
        },
        orderBy: [{ publishedAt: 'desc' }],
        take: limit,
    });

    // Build grid: scheduled at top (earliest first), then published (newest first)
    const mapPost = (post: typeof pendingPosts[0]): GridPost => {
        const firstMedia = post.media[0]?.media;
        const thumbnail = post.externalThumbnailUrl || firstMedia?.thumbnailUrl || firstMedia?.url || null;

        // Determine media type for overlay icon
        let mediaType = 'image';
        if (post.postType === 'REEL') mediaType = 'reel';
        else if (post.postType === 'CAROUSEL') mediaType = 'carousel';
        else if (firstMedia?.mimeType?.startsWith('video/')) mediaType = 'video';

        return {
            id: post.id,
            thumbnailUrl: thumbnail,
            mediaType,
            status: post.status.toLowerCase() as GridPost['status'],
            scheduledAt: post.scheduledAt?.toISOString() || null,
            publishedAt: post.publishedAt?.toISOString() || null,
            caption: post.caption || '',
            postType: post.postType?.toLowerCase() || 'feed',
            isExternal: post.isExternal,
            externalUrl: post.externalUrl || null,
        };
    };

    const grid: GridPost[] = [
        ...pendingPosts.map(mapPost),
        ...publishedPosts.map(mapPost),
    ];

    return NextResponse.json({
        grid,
        account: {
            id: account.id,
            username: account.username,
            avatarUrl: account.avatar,
        },
        totalPending: pendingPosts.length,
        totalPublished: publishedPosts.length,
    });
}
