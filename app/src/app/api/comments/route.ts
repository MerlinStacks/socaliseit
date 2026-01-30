/**
 * Comments API
 * Manage comments: List, Filter, Sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { syncPostComments } from '@/lib/platform-api/comment-sync';

// GET /api/comments?platform=instagram&sentiment=positive&page=1
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.user.currentWorkspaceId;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const sentiment = searchParams.get('sentiment');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;
    const skip = (page - 1) * limit;

    const whereClause: any = { workspaceId };

    // Filter by Platform (join via SocialAccount)
    if (platform) {
        whereClause.socialAccount = { platform: platform.toUpperCase() };
    }

    if (sentiment) {
        whereClause.sentiment = sentiment;
    }

    const [comments, total] = await Promise.all([
        db.comment.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: skip,
            include: {
                socialAccount: { select: { platform: true, name: true, avatar: true } },
                replies: { include: { socialAccount: true } }, // Simple nesting for now
            }
        }),
        db.comment.count({ where: whereClause })
    ]);

    return NextResponse.json({
        data: comments,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    });
}

// POST /api/comments/sync
// Body: { postPlatformId: string }
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { postPlatformId } = body;

    if (!postPlatformId) {
        return NextResponse.json({ error: 'Missing postPlatformId' }, { status: 400 });
    }

    // Verify ownership
    const post = await db.postPlatform.findFirst({
        where: { id: postPlatformId, socialAccount: { workspaceId: session.user.currentWorkspaceId } }
    });

    if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const result = await syncPostComments(postPlatformId);
    return NextResponse.json(result);
}
