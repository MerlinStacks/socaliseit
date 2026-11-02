/**
 * Publishing Queue detail API
 * GET    /api/publishing-queues/:id  Template plus upcoming items and open slots
 * PATCH  /api/publishing-queues/:id  Replace the template (does not move items)
 * DELETE /api/publishing-queues/:id  Remove the template, keep scheduled posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { deleteQueue, getQueueTimeline, saveQueue } from '@/lib/publishing-queue/service';
import { QUEUE_MANAGE, QUEUE_READ, queueErrorResponse, readJsonBody, readSlots, requireQueueAccess, optionalString } from '@/lib/publishing-queue/api';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
    const access = await requireQueueAccess(QUEUE_READ);
    if ('response' in access) return access.response;

    try {
        const { id } = await params;
        const queue = await db.publishingQueue.findFirst({
            where: { id, organizationId: access.context.organizationId },
            include: {
                slots: { orderBy: { time: 'asc' } },
                socialAccount: { select: { id: true, name: true, platform: true } },
            },
        });
        if (!queue) return NextResponse.json({ error: 'Queue not found' }, { status: 404 });

        const timeline = await getQueueTimeline(access.context.organizationId, {
            queueId: queue.id,
        });
        return NextResponse.json({
            data: {
                id: queue.id,
                label: queue.label,
                name: queue.name,
                timezone: queue.timezone,
                enabled: queue.enabled,
                socialAccountId: queue.socialAccountId,
                accountName: queue.socialAccount?.name ?? 'Removed profile',
                platform: String(queue.socialAccount?.platform ?? 'UNKNOWN'),
                slots: queue.slots,
                items: timeline.items,
                preview: timeline.preview,
            },
        });
    } catch (error) {
        logger.error({ err: error }, 'Failed to load publishing queue');
        return queueErrorResponse(error, 'Could not load the publishing queue');
    }
}

export async function PATCH(request: NextRequest, { params }: Context) {
    const access = await requireQueueAccess(QUEUE_MANAGE);
    if ('response' in access) return access.response;

    try {
        const { id } = await params;
        const body = readJsonBody(await request.json().catch(() => null));
        if (!body) return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
        if (!Array.isArray(body.slots)) {
            return NextResponse.json({ error: 'slots is required: a queue is saved as a whole template' }, { status: 400 });
        }

        const queue = await saveQueue({
            organizationId: access.context.organizationId,
            queueId: id,
            name: optionalString(body.name, 'name', 80),
            timezone: optionalString(body.timezone, 'timezone', 64),
            enabled: body.enabled === undefined ? undefined : body.enabled === true,
            slots: readSlots(body.slots),
        });
        return NextResponse.json({ data: queue });
    } catch (error) {
        logger.warn({ err: error }, 'Failed to update publishing queue');
        return queueErrorResponse(error, 'Could not update the publishing queue');
    }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
    const access = await requireQueueAccess(QUEUE_MANAGE);
    if ('response' in access) return access.response;

    try {
        const { id } = await params;
        const result = await deleteQueue(access.context.organizationId, id);
        return NextResponse.json({ data: result });
    } catch (error) {
        logger.warn({ err: error }, 'Failed to delete publishing queue');
        return queueErrorResponse(error, 'Could not delete the publishing queue');
    }
}
