/**
 * Publishing Queue items API
 * POST /api/publishing-queues/items
 *   { action: 'queue',   postIds[], socialAccountIds[], label?, mode }  Place existing drafts
 *   { action: 'cancel',  itemId }                                       Pull an item out
 *   { action: 'reslot',  itemId }                                       Move to the next open slot
 * GET  /api/publishing-queues/items?socialAccountId=&label=             What is in a queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { hasPermission, PERMISSIONS } from '@/lib/auth/with-permission';
import { cancelQueueItem, getQueueTimeline, queueExistingDrafts, reslotQueueItem } from '@/lib/publishing-queue/service';
import { QUEUE_SCHEDULE, queueErrorResponse, readJsonBody, readMode, requireQueueAccess, optionalString, stringList } from '@/lib/publishing-queue/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const access = await requireQueueAccess(QUEUE_SCHEDULE);
    if ('response' in access) return access.response;

    try {
        const { searchParams } = new URL(request.url);
        const socialAccountId = searchParams.get('socialAccountId');
        if (!socialAccountId) {
            return NextResponse.json({ error: 'socialAccountId is required' }, { status: 400 });
        }
        const timeline = await getQueueTimeline(access.context.organizationId, {
            socialAccountId,
            label: searchParams.get('label'),
            limit: Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200),
        });
        return NextResponse.json({ data: timeline });
    } catch (error) {
        logger.warn({ err: error }, 'Failed to load queue items');
        return queueErrorResponse(error, 'Could not load the queue');
    }
}

export async function POST(request: NextRequest) {
    const access = await requireQueueAccess(QUEUE_SCHEDULE);
    if ('response' in access) return access.response;

    try {
        const body = readJsonBody(await request.json().catch(() => null));
        if (!body) return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
        const action = typeof body.action === 'string' ? body.action : '';

        if (action === 'queue') {
            const results = await queueExistingDrafts({
                organizationId: access.context.organizationId,
                userId: access.context.userId,
                canCreate: await hasPermission(access.context.organizationId, access.context.userId, PERMISSIONS.POSTS_CREATE),
                postIds: stringList(body.postIds, 'postIds', 200),
                socialAccountIds: stringList(body.socialAccountIds, 'socialAccountIds', 20),
                label: optionalString(body.label, 'label', 80),
                mode: readMode(body.mode),
            });
            const placed = results.filter(result => result.ok).length;
            return NextResponse.json({ data: { placed, results } }, { status: placed ? 201 : 409 });
        }

        if (action === 'cancel' || action === 'reslot') {
            const itemId = optionalString(body.itemId, 'itemId', 64);
            if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
            const result = action === 'cancel'
                ? await cancelQueueItem(access.context.organizationId, itemId)
                : await reslotQueueItem(access.context.organizationId, itemId);
            return NextResponse.json({ data: result });
        }

        return NextResponse.json({ error: 'action must be queue, cancel, or reslot' }, { status: 400 });
    } catch (error) {
        logger.warn({ err: error }, 'Queue action failed');
        return queueErrorResponse(error, 'Could not update the queue');
    }
}
