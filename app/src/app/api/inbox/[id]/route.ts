/**
 * Inbox Item Update API
 *
 * PATCH /api/inbox/[id] - Update an inbox item (comment, mention, or DM)
 *
 * Body: {
 *   type: 'comment' | 'mention' | 'dm',
 *   isRead?: boolean,
 *   assignedToId?: string | null,
 *   labelIds?: string[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const updateItemSchema = z.object({
    type: z.enum(['comment', 'mention', 'dm']),
    isRead: z.boolean().optional(),
    assignedToId: z.string().nullable().optional(),
    labelIds: z.array(z.string()).optional(),
});

/**
 * Update an inbox item (read status, assignment, labels)
 *
 * Why: Single endpoint handles all inbox item types with polymorphic update
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const parsed = updateItemSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { type, isRead, assignedToId, labelIds } = parsed.data;
        const organizationId = session.user.currentOrganizationId;

        // Build update data - only include defined fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {};
        if (isRead !== undefined) updateData.isRead = isRead;
        if (assignedToId !== undefined) updateData.assignedToId = assignedToId;
        if (labelIds !== undefined) updateData.labelIds = labelIds;

        let result;

        switch (type) {
            case 'comment':
                result = await db.comment.updateMany({
                    where: { id, organizationId },
                    data: updateData,
                });
                break;
            case 'mention':
                result = await db.mention.updateMany({
                    where: { id, organizationId },
                    data: updateData,
                });
                break;
            case 'dm':
                result = await db.directMessage.updateMany({
                    where: { id, organizationId },
                    data: updateData,
                });
                break;
        }

        if (result.count === 0) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            updated: result.count,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to update inbox item');
        return NextResponse.json(
            { error: 'Failed to update item' },
            { status: 500 }
        );
    }
}

/**
 * Get a single inbox item by ID
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const organizationId = session.user.currentOrganizationId;
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');

        if (!type || !['comment', 'mention', 'dm'].includes(type)) {
            return NextResponse.json(
                { error: 'Invalid or missing type parameter' },
                { status: 400 }
            );
        }

        let item;

        switch (type) {
            case 'comment':
                item = await db.comment.findFirst({
                    where: { id, organizationId },
                    include: {
                        socialAccount: { select: { platform: true, name: true, avatar: true } },
                        replies: {
                            include: {
                                socialAccount: { select: { platform: true, name: true, avatar: true } },
                            },
                            orderBy: { createdAt: 'asc' },
                        },
                    },
                });
                break;
            case 'mention':
                item = await db.mention.findFirst({
                    where: { id, organizationId },
                    include: {
                        socialAccount: { select: { platform: true, name: true, avatar: true } },
                    },
                });
                break;
            case 'dm':
                item = await db.directMessage.findFirst({
                    where: { id, organizationId },
                    include: {
                        socialAccount: { select: { platform: true, name: true, avatar: true } },
                    },
                });
                break;
        }

        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        return NextResponse.json({ data: { ...item, type } });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch inbox item');
        return NextResponse.json(
            { error: 'Failed to fetch item' },
            { status: 500 }
        );
    }
}
