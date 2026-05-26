/**
 * Reviews List API
 * GET /api/reviews — Paginated, filterable list of reviews
 *
 * Query params:
 * - platform: GOOGLE_BUSINESS | FACEBOOK
 * - readStatus: all | read | unread
 * - repliedStatus: all | replied | unreplied
 * - minRating: 1-5
 * - maxRating: 1-5
 * - limit: number (default 50)
 * - cursor: string (pagination cursor — last review ID)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;
        const { searchParams } = new URL(request.url);

        const platform = searchParams.get('platform');
        const readStatus = searchParams.get('readStatus') || 'all';
        const repliedStatus = searchParams.get('repliedStatus') || 'all';
        const minRating = parseInt(searchParams.get('minRating') || '0', 10);
        const maxRating = parseInt(searchParams.get('maxRating') || '5', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
        const cursor = searchParams.get('cursor');

        // Build where clause
        const where: Record<string, unknown> = { organizationId };

        if (platform) {
            where.platform = platform;
        }

        if (readStatus === 'read') where.isRead = true;
        if (readStatus === 'unread') where.isRead = false;

        if (repliedStatus === 'replied') where.isReplied = true;
        if (repliedStatus === 'unreplied') where.isReplied = false;

        if (minRating > 0) {
            (where as Record<string, unknown>).rating = { gte: minRating };
        }
        if (maxRating < 5) {
            (where as Record<string, unknown>).rating = { ...(where as Record<string, unknown>).rating as object, lte: maxRating };
        }

        const reviews = await db.review.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit + 1, // Fetch one extra for cursor pagination
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: {
                socialAccount: {
                    select: { platform: true, name: true, avatar: true },
                },
            },
        });

        const hasMore = reviews.length > limit;
        const items = hasMore ? reviews.slice(0, limit) : reviews;
        const nextCursor = hasMore ? items[items.length - 1].id : null;

        return NextResponse.json({
            success: true,
            data: {
                reviews: items,
                nextCursor,
                hasMore,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Reviews list error');
        return NextResponse.json(
            { error: 'Failed to fetch reviews' },
            { status: 500 },
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;
        const body = await request.json().catch(() => null) as { ids?: unknown; markAllRead?: unknown } | null;

        if (body?.markAllRead === true) {
            const result = await db.review.updateMany({
                where: {
                    organizationId,
                    isRead: false,
                },
                data: { isRead: true },
            });

            return NextResponse.json({ success: true, updated: result.count });
        }

        const ids = Array.isArray(body?.ids)
            ? body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : [];

        if (ids.length === 0) {
            return NextResponse.json({ success: true, updated: 0 });
        }

        const result = await db.review.updateMany({
            where: {
                organizationId,
                id: { in: ids },
                isRead: false,
            },
            data: { isRead: true },
        });

        return NextResponse.json({ success: true, updated: result.count });
    } catch (error) {
        logger.error({ error }, 'Reviews mark-read error');
        return NextResponse.json(
            { error: 'Failed to update reviews' },
            { status: 500 },
        );
    }
}
