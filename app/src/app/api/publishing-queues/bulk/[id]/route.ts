/**
 * Bulk batch API
 * GET    /api/publishing-queues/bulk/:id  Progress for one batch (polled by the UI)
 * DELETE /api/publishing-queues/bulk/:id  Stop a batch and release its items
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { cancelBatch, getBatch, retryBatch } from '@/lib/publishing-queue/bulk';
import { QUEUE_SCHEDULE, QUEUE_CREATE, queueErrorResponse, requireQueueAccess } from '@/lib/publishing-queue/api';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
    const access = await requireQueueAccess(QUEUE_SCHEDULE);
    if ('response' in access) return access.response;

    try {
        const { id } = await params;
        return NextResponse.json({ data: await getBatch(access.context.organizationId, id) });
    } catch (error) {
        return queueErrorResponse(error, 'Could not load the batch');
    }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
    const access = await requireQueueAccess(QUEUE_SCHEDULE);
    if ('response' in access) return access.response;

    try {
        const { id } = await params;
        const result = await cancelBatch(access.context.organizationId, id);
        return NextResponse.json({ data: result }, { status: result.status === 'CANCELLING' ? 202 : 200 });
    } catch (error) {
        logger.warn({ err: error }, 'Failed to cancel bulk batch');
        return queueErrorResponse(error, 'Could not cancel the batch');
    }
}

export async function POST(_request: NextRequest, { params }: Context) {
    const access = await requireQueueAccess(QUEUE_SCHEDULE);
    if ('response' in access) return access.response;
    const creation = await requireQueueAccess(QUEUE_CREATE);
    if ('response' in creation) return creation.response;
    try { return NextResponse.json({ data: await retryBatch(access.context.organizationId, (await params).id) }, { status: 202 }); }
    catch (error) { return queueErrorResponse(error, 'Could not retry the batch'); }
}
