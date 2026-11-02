/**
 * Publishing Queues API — templates
 * GET  /api/publishing-queues            Queues for the workspace, with counts
 * POST /api/publishing-queues            Create a queue (or a labelled variant)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { listQueues, listQueueOptions, saveQueue } from '@/lib/publishing-queue/service';
import { QUEUE_MANAGE, QUEUE_READ, queueErrorResponse, readJsonBody, readSlots, requireQueueAccess, optionalString } from '@/lib/publishing-queue/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const access = await requireQueueAccess(QUEUE_READ);
    if ('response' in access) return access.response;

    try {
        const includeAccounts = new URL(request.url).searchParams.get('accounts') === 'true';
        if (includeAccounts) return NextResponse.json({ data: await listQueueOptions(access.context.organizationId) });
        return NextResponse.json({ data: await listQueues(access.context.organizationId) });
    } catch (error) {
        logger.error({ err: error }, 'Failed to list publishing queues');
        return queueErrorResponse(error, 'Could not load publishing queues');
    }
}

export async function POST(request: NextRequest) {
    const access = await requireQueueAccess(QUEUE_MANAGE);
    if ('response' in access) return access.response;

    try {
        const body = readJsonBody(await request.json().catch(() => null));
        if (!body) return NextResponse.json({ error: 'JSON body required' }, { status: 400 });

        const queue = await saveQueue({
            organizationId: access.context.organizationId,
            socialAccountId: optionalString(body.socialAccountId, 'socialAccountId', 64),
            label: optionalString(body.label, 'label', 80) ?? '',
            name: optionalString(body.name, 'name', 80),
            timezone: optionalString(body.timezone, 'timezone', 64),
            enabled: body.enabled === undefined ? undefined : body.enabled === true,
            slots: readSlots(body.slots),
        });
        return NextResponse.json({ data: queue }, { status: 201 });
    } catch (error) {
        logger.warn({ err: error }, 'Failed to create publishing queue');
        return queueErrorResponse(error, 'Could not create the publishing queue');
    }
}
