/**
 * Comments API
 * Manage comments: List, Filter, Sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { syncPostComments } from '@/lib/platform-api/comment-sync';

// GET /api/comments?platform=instagram&sentiment=positive&page=1&startDate=...&endDate=...&isReplied=true&q=search
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const sentiment = searchParams.get('sentiment');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isReplied = searchParams.get('isReplied');
    const isRead = searchParams.get('isRead');
    const search = searchParams.get('q');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = { organizationId };

    // Filter by Platform (join via SocialAccount)
    if (platform) {
        whereClause.socialAccount = { platform: platform.toUpperCase() };
    }

    if (sentiment) {
        whereClause.sentiment = sentiment;
    }

    // Date range filter
    if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
            whereClause.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
            whereClause.createdAt.lte = new Date(endDate);
        }
    }

    // Replied filter
    if (isReplied === 'true') {
        whereClause.isReplied = true;
    } else if (isReplied === 'false') {
        whereClause.isReplied = false;
    }

    // Read filter
    if (isRead === 'true') {
        whereClause.isRead = true;
    } else if (isRead === 'false') {
        whereClause.isRead = false;
    }

    // Search filter (author or text)
    if (search) {
        whereClause.OR = [
            { text: { contains: search, mode: 'insensitive' } },
            { authorUsername: { contains: search, mode: 'insensitive' } },
        ];
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
// Body: { postId: string }
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { postId } = body;

    if (!postId) {
        return NextResponse.json({ error: 'Missing postId' }, { status: 400 });
    }

    // Verify ownership
    const post = await db.post.findFirst({
        where: { id: postId, organizationId: session.user.currentOrganizationId }
    });

    if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const result = await syncPostComments(postId);
    return NextResponse.json(result);
}
