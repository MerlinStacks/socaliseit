/**
 * Bulk queueing API
 * POST /api/publishing-queues/bulk
 *   { kind: 'LIBRARY' | 'FILES', items: [{ mediaId?, caption, sourceName? }], socialAccountIds[], label?, mode, pillarId? }
 *   { kind: 'CSV', csv: "<spreadsheet text>", socialAccountIds[], label?, mode, pillarId? }
 * GET  /api/publishing-queues/bulk                       Recent batches
 *
 * Files are not POSTed here. They travel through the existing media upload path,
 * which already streams to disk with backpressure and enforces the size limits,
 * and this endpoint receives the Media ids it produced. One upload
 * implementation, not two.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { invalidatePostCaches } from '@/lib/cache';
import { createBatch, listBatches, parseCsvRows, type BulkRowInput } from '@/lib/publishing-queue/bulk';
import { QUEUE_SCHEDULE, QUEUE_CREATE, queueErrorResponse, readJsonBody, readMode, requireQueueAccess, optionalString, stringList } from '@/lib/publishing-queue/api';

export const dynamic = 'force-dynamic';
/** A spreadsheet is parsed inline; the heavy part runs in the worker. */
export const maxDuration = 60;

const KINDS = new Set(['LIBRARY', 'FILES', 'CSV', 'API']);

export async function GET(request: NextRequest) {
    const access = await requireQueueAccess(QUEUE_SCHEDULE);
    if ('response' in access) return access.response;

    try {
        const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get('limit')) || 20, 1), 50);
        const data = await listBatches(access.context.organizationId, limit);
        // Worker progress is polled here: invalidate Next's tags in the web runtime,
        // not inside the plain-Node background worker.
        invalidatePostCaches(access.context.organizationId);
        return NextResponse.json({ data });
    } catch (error) {
        logger.error({ err: error }, 'Failed to list bulk batches');
        return queueErrorResponse(error, 'Could not load bulk batches');
    }
}

export async function POST(request: NextRequest) {
    const access = await requireQueueAccess(QUEUE_SCHEDULE);
    if ('response' in access) return access.response;
    const creation = await requireQueueAccess(QUEUE_CREATE);
    if ('response' in creation) return creation.response;

    try {
        const body = readJsonBody(await request.json().catch(() => null));
        if (!body) return NextResponse.json({ error: 'JSON body required' }, { status: 400 });

        const kind = typeof body.kind === 'string' ? body.kind.toUpperCase() : '';
        if (!KINDS.has(kind)) {
            return NextResponse.json({ error: 'kind must be LIBRARY, FILES, CSV, or API' }, { status: 400 });
        }
        const socialAccountIds = stringList(body.socialAccountIds, 'socialAccountIds', 20);
        const shared = {
            organizationId: access.context.organizationId,
            createdBy: access.context.userId,
            socialAccountIds,
            label: optionalString(body.label, 'label', 80),
            mode: readMode(body.mode),
            pillarId: optionalString(body.pillarId, 'pillarId', 64),
        };

        if (kind === 'CSV') {
            if (typeof body.csv !== 'string' || !body.csv.trim()) {
                return NextResponse.json({ error: 'csv text is required for kind CSV' }, { status: 400 });
            }
            const parsed = await parseCsvRows(access.context.organizationId, body.csv);
            const batch = await createBatch({ ...shared, kind: 'CSV', rows: parsed.rows });
            return NextResponse.json({ data: { ...batch, warnings: parsed.warnings } }, { status: 202 });
        }

        const rows: BulkRowInput[] = Array.isArray(body.items) && body.items.length
            ? (body.items as unknown[]).map((entry, index) => {
                if (typeof entry !== 'object' || entry === null) throw new TypeError(`items[${index}] must be an object`);
                const row = entry as Record<string, unknown>;
                const caption = typeof row.caption === 'string' ? row.caption : '';
                if (caption.length > 100_000) throw new TypeError(`items[${index}].caption is too long`);
                const mediaId = optionalString(row.mediaId, `items[${index}].mediaId`, 64) ?? null;
                if (!caption.trim() && !mediaId) throw new TypeError(`items[${index}] needs a caption or a mediaId`);
                return {
                    caption,
                    mediaIds: mediaId ? [mediaId] : [],
                    sourceName: optionalString(row.sourceName, `items[${index}].sourceName`, 300),
                };
            })
            : [];

        if (rows.length === 0 && Array.isArray(body.mediaIds) && body.mediaIds.length) {
            // Shorthand for "queue these library assets with one caption each".
            const caption = typeof body.caption === 'string' ? body.caption : '';
            rows.push(...(body.mediaIds as unknown[]).map((mediaId, index) => {
                if (typeof mediaId !== 'string' || !mediaId.trim()) throw new TypeError(`mediaIds[${index}] must be an id`);
                return { caption, mediaIds: [mediaId.trim()], sourceName: `Asset ${index + 1}` };
            }));
        }

        if (rows.length === 0) return NextResponse.json({ error: 'items or mediaIds is required' }, { status: 400 });

        const batch = await createBatch({ ...shared, kind: kind as 'LIBRARY' | 'FILES' | 'API', rows });
        return NextResponse.json({ data: batch }, { status: 202 });
    } catch (error) {
        logger.warn({ err: error }, 'Bulk queue request failed');
        return queueErrorResponse(error, 'Could not start the bulk queue');
    }
}
