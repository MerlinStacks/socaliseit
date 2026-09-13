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
import { InboxError, serializeWorkflow, updateWorkflow, workflowItemSchema } from '../workflow/service';
import { parseJsonBody } from '@/lib/parse-json-body';
import { InboxEntityType } from '@/generated/prisma/client';
import { collaborationAccess } from '../workflow/access';

const updateItemSchema = z.object({
    type: z.enum(['comment', 'mention', 'dm', 'review']),
    socialAccountId: z.string().min(1).optional(),
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
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;
        const parsed = updateItemSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { type, isRead, assignedToId, labelIds } = parsed.data;
        const organizationId = session.user.currentOrganizationId;

        const result = await db.$transaction(async (tx) => {
            const where = { id, organizationId, socialAccountId: parsed.data.socialAccountId };
            const entity = type === 'comment' ? await tx.comment.findFirst({ where })
                : type === 'mention' ? await tx.mention.findFirst({ where })
                    : type === 'review' ? await tx.review.findFirst({ where }) : await tx.directMessage.findFirst({ where });
            if (!entity) throw new InboxError('Item not found', 404);
            if (assignedToId !== undefined || labelIds !== undefined) {
                const { actor } = await collaborationAccess(tx, organizationId, session.user.id, true);
                await updateWorkflow(tx, organizationId, workflowItemSchema.parse({ id, type,
                    socialAccountId: entity.socialAccountId, assignedToId, labelIds }), new Date(), actor);
            }
            if (isRead === undefined) return { count: 1 };
            const data = { isRead };
            if (type === 'comment') return tx.comment.updateMany({ where, data });
            if (type === 'mention') return tx.mention.updateMany({ where, data });
            if (type === 'review') return tx.review.updateMany({ where, data });
            return tx.directMessage.updateMany({ where: { organizationId, socialAccountId: entity.socialAccountId,
                conversationId: 'conversationId' in entity ? entity.conversationId : '', direction: 'inbound' }, data });
        }, { isolationLevel: 'Serializable' });

        return NextResponse.json({
            success: true,
            updated: result.count,
        });
    } catch (error) {
        if (error instanceof InboxError) return NextResponse.json({ error: error.message }, { status: error.status });
        if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
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

        if (!type || !['comment', 'mention', 'dm', 'review'].includes(type)) {
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
                        socialAccount: { select: { id: true, platform: true, name: true, avatar: true } },
                        replies: {
                            include: {
                                socialAccount: { select: { id: true, platform: true, name: true, avatar: true } },
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
                        socialAccount: { select: { id: true, platform: true, name: true, avatar: true } },
                    },
                });
                break;
            case 'dm':
                item = await db.directMessage.findFirst({
                    where: { id, organizationId },
                    include: {
                        socialAccount: { select: { id: true, platform: true, name: true, avatar: true } },
                    },
                });
                break;
            case 'review':
                item = await db.review.findFirst({ where: { id, organizationId },
                    include: { socialAccount: { select: { id: true, platform: true, name: true, avatar: true } } } });
                break;
        }

        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        const storedWorkflow = await db.inboxWorkflow.findUnique({ where: { organizationId_type_entityId_socialAccountId: {
            organizationId, type: type.toUpperCase() as InboxEntityType, socialAccountId: item.socialAccountId,
            entityId: 'conversationId' in item ? item.conversationId : item.id,
        } } });
        const workflow = serializeWorkflow(storedWorkflow ?? { status: 'OPEN', snoozedUntil: null,
            assignedToId: 'assignedToId' in item ? item.assignedToId : null, labelIds: 'labelIds' in item ? item.labelIds : [] });
        return NextResponse.json({ data: { ...item, type, assignedToId: workflow.assignedToId, labelIds: workflow.labelIds, workflow } });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch inbox item');
        return NextResponse.json(
            { error: 'Failed to fetch item' },
            { status: 500 }
        );
    }
}
