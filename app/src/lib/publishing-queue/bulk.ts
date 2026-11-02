/**
 * Bulk Upload — batch intake and processing for publishing queues.
 *
 * Why a queue at all: one drop can carry hundreds of rows, and each row needs a
 * Post per target profile plus a slot search. That is far beyond a request
 * timeout, so intake is cheap (rows written, job queued) and placement happens
 * in the worker.
 *
 * Files are *not* re-uploaded here. They go through the existing media upload
 * path first (which already streams to disk with backpressure), and a batch
 * references the resulting Media rows. That keeps one upload implementation
 * instead of a second, riskier one.
 */

import { db } from '@/lib/db';
import { invalidatePostCaches } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { bulkUploadQueue } from '@/lib/bullmq/queues';
import type { Prisma } from '@/generated/prisma/client';
import type { BulkUploadKind, QueueFillMode } from '@/generated/prisma/enums';
import { parseCSV } from '@/lib/csv-import';
import { QueueError, cancelQueueItem, resolveQueueForLabel, scheduleQueueItem, MAX_NAME_LENGTH } from './service';
import { withQueueLock } from './lock';
import { createQueueDraft, placementPostId } from './posts';
import { reschedulePost } from '@/lib/queue';

const log = logger.child({ service: 'publishing-queue/bulk' });

export const MAX_ITEMS_PER_BATCH = 500;
export const MAX_ACCOUNTS_PER_BATCH = 20;
/** Why: generous for a spreadsheet; a CSV bigger than this is a data import, not a queue drop. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

export interface BulkRowInput {
    caption: string;
    mediaIds?: string[];
    sourceName?: string;
    /** Overrides the batch label for this row. */
    label?: string | null;
}

export interface CreateBatchInput {
    organizationId: string;
    createdBy?: string;
    kind: BulkUploadKind;
    socialAccountIds: string[];
    label?: string | null;
    mode: QueueFillMode;
    pillarId?: string | null;
    rows: BulkRowInput[];
}

/**
 * Writes the batch and its rows, then queues the job.
 *
 * Queue-add failure deletes the batch rather than leaving a PENDING batch nobody
 * will ever pick up — the caller gets an error and can retry cleanly.
 */
export async function createBatch(input: CreateBatchInput) {
    if (input.rows.length === 0) throw new QueueError('Nothing to queue');
    if (input.rows.length > MAX_ITEMS_PER_BATCH) {
        throw new QueueError(`At most ${MAX_ITEMS_PER_BATCH} rows can be queued in one batch`);
    }
    if (input.socialAccountIds.length === 0) throw new QueueError('Choose at least one profile');
    if (input.socialAccountIds.length > MAX_ACCOUNTS_PER_BATCH) {
        throw new QueueError(`At most ${MAX_ACCOUNTS_PER_BATCH} profiles can be targeted at once`);
    }

    const accounts = await db.socialAccount.findMany({
        where: { id: { in: input.socialAccountIds }, organizationId: input.organizationId },
        select: { id: true },
    });
    if (accounts.length !== new Set(input.socialAccountIds).size) {
        throw new QueueError('One of the selected profiles is not in this workspace', 403);
    }

    if (input.pillarId) {
        const pillar = await db.contentPillar.findFirst({
            where: { id: input.pillarId, organizationId: input.organizationId }, select: { id: true },
        });
        if (!pillar) throw new QueueError('Content pillar not found', 404);
    }

    // Fail before writing anything when a target profile has no queue to fill —
    // a batch that can only half-place is worse than one that never started.
    for (const socialAccountId of input.socialAccountIds) {
        await resolveQueueForLabel(input.organizationId, socialAccountId, input.label);
    }

    const mediaIds = [...new Set(input.rows.flatMap(row => row.mediaIds ?? []))];
    if (mediaIds.length) {
        const found = await db.media.findMany({
            where: { id: { in: mediaIds }, organizationId: input.organizationId }, select: { id: true },
        });
        if (found.length !== mediaIds.length) {
            throw new QueueError('Some selected media is not in this workspace', 403);
        }
    }

    const batch = await db.bulkUploadBatch.create({
        data: {
            organizationId: input.organizationId,
            createdBy: input.createdBy,
            kind: input.kind,
            socialAccountIds: [...new Set(input.socialAccountIds)],
            label: normaliseBatchLabel(input.label),
            mode: input.mode,
            pillarId: input.pillarId ?? null,
            totalItems: input.rows.length,
            items: {
                create: input.rows.map((row, index) => ({
                    organizationId: input.organizationId,
                    position: index,
                    caption: row.caption.slice(0, 100_000),
                    // One asset per row. A multi-file drop or a library
                    // multi-select naturally yields one row per asset; for CSV
                    // rows that list several, the extras are reported as a
                    // warning rather than silently dropped.
                    mediaId: row.mediaIds?.[0] ?? null,
                    requiresMedia: !!row.mediaIds?.length,
                    sourceName: row.sourceName?.slice(0, 300) ?? null,
                    status: 'PENDING',
                })),
            },
        },
        select: { id: true, totalItems: true },
    });

    try {
        await bulkUploadQueue.add(`bulk-${batch.id}`, {
            organizationId: input.organizationId,
            batchId: batch.id,
        }, {
            jobId: `bulk-${batch.id}`,
        });
    } catch (error) {
        await db.bulkUploadBatch.delete({ where: { id: batch.id } }).catch((rollbackError: unknown) => {
            log.error({ batchId: batch.id, err: rollbackError }, 'Could not roll back batch after enqueue failure');
        });
        log.error({ batchId: batch.id, err: error }, 'Bulk job could not be queued');
        throw new QueueError('Could not start the bulk queue. Please try again.', 503);
    }

    log.info(
        { batchId: batch.id, rows: input.rows.length, accounts: input.socialAccountIds.length, kind: input.kind },
        'Bulk batch accepted',
    );
    return { batchId: batch.id, totalItems: input.rows.length };
}

function normaliseBatchLabel(label?: string | null): string | null {
    const trimmed = (label ?? '').trim();
    if (trimmed.length > MAX_NAME_LENGTH) throw new QueueError('Queue label is too long');
    return trimmed || null;
}

/**
 * Parses an uploaded spreadsheet into batch rows.
 *
 * Reuses the CSV service that already described the column contract. Queue dates
 * in the file are deliberately ignored - the whole point of a queue is that slot
 * times win - but they are reported as warnings so a user is not silently
 * surprised. `media_urls` resolve against this workspace's library.
 */
export async function parseCsvRows(organizationId: string, content: string): Promise<{
    rows: BulkRowInput[];
    warnings: Array<{ row: number; warning: string }>;
    errors: Array<{ row: number; error: string }>;
}> {
    if (Buffer.byteLength(content, 'utf8') > MAX_CSV_BYTES) {
        throw new QueueError('Spreadsheet is too large (2 MB max)');
    }
    let parsed;
    try {
        parsed = parseCSV(content);
    } catch (error) {
        throw new QueueError(error instanceof Error ? error.message : 'Could not read that spreadsheet');
    }
    if (parsed.length === 0) throw new QueueError('No rows found in the spreadsheet');
    if (parsed.length > MAX_ITEMS_PER_BATCH) {
        throw new QueueError(`At most ${MAX_ITEMS_PER_BATCH} rows per batch (found ${parsed.length})`);
    }

    const warnings: Array<{ row: number; warning: string }> = [];
    const errors: Array<{ row: number; error: string }> = [];
    for (const row of parsed) {
        if (row.scheduledAt) {
            warnings.push({ row: row.rowNumber, warning: 'scheduled_date is ignored - the queue decides the time' });
        }
        for (const error of row.errors) errors.push({ row: row.rowNumber, error });
        for (const warning of row.warnings) warnings.push({ row: row.rowNumber, warning });
    }
    if (errors.length) throw new QueueError(`Row ${errors[0].row}: ${errors[0].error}`);

    const urls = [...new Set(parsed.flatMap(row => row.mediaUrls ?? []))];
    const mediaBySource = new Map<string, string>();
    if (urls.length) {
        const rows = await db.media.findMany({
            where: { organizationId, url: { in: urls } },
            select: { id: true, url: true },
        });
        rows.forEach(row => mediaBySource.set(row.url, row.id));
    }

    const rows = parsed.map(row => {
        const mediaIds = (row.mediaUrls ?? []).map(url => mediaBySource.get(url)).filter((id): id is string => !!id);
        const unresolved = (row.mediaUrls ?? []).length - mediaIds.length;
        if (unresolved > 0) {
            warnings.push({
                row: row.rowNumber,
                warning: `${unresolved} media URL(s) are not in this workspace's library and will be skipped`,
            });
        }
        if (mediaIds.length > 1) {
            warnings.push({
                row: row.rowNumber,
                warning: 'A queued row carries one asset; the first is used and the rest ignored',
            });
        }
        return {
            caption: row.caption,
            mediaIds,
            sourceName: `Row ${row.rowNumber}`,
        } satisfies BulkRowInput;
    });

    return { rows, warnings, errors };
}

// ============================================================================
// WORKER SIDE
// ============================================================================

/**
 * Places every pending row of a batch.
 *
 * A batch lock prevents simultaneous attempts. Durable row/account reservations
 * and transactional draft creation let an interrupted attempt resume safely.
 */
export async function processBatch(organizationId: string, batchId: string) {
    try {
        return await withQueueLock(`batch:${organizationId}:${batchId}`, assertOwned => processBatchLocked(organizationId, batchId, assertOwned));
    } finally { invalidatePostCaches(organizationId); }
}

class BatchCancelled extends Error {}

async function assertBatchActive(organizationId: string, batchId: string) {
    const current = await db.bulkUploadBatch.findFirst({ where: { id: batchId, organizationId }, select: { status: true } });
    if (!current || current.status === 'CANCELLING' || current.status === 'CANCELLED') throw new BatchCancelled();
}

async function processBatchLocked(organizationId: string, batchId: string, assertOwned: () => void) {
    const batch = await db.bulkUploadBatch.findFirst({
        where: { id: batchId, organizationId },
        include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!batch) return;
    if (batch.status === 'CANCELLING') return finishCancellation(organizationId, batchId);
    if (['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(batch.status)) return;

    const claimed = await db.bulkUploadBatch.updateMany({
        where: { id: batchId, organizationId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'PROCESSING', startedAt: batch.startedAt ?? new Date(), error: null },
    });
    if (!claimed.count) return; // Another worker owns it, or it was cancelled.

    let processed = 0;
    let failed = 0;
    let anyPlaced = false;
    for (const item of batch.items) {
        assertOwned();
        try { await assertBatchActive(organizationId, batchId); }
        catch (error) { if (error instanceof BatchCancelled) return finishCancellation(organizationId, batchId); throw error; }
        if (item.status !== 'PENDING') {
            if (item.status === 'COMPLETED') processed++;
            else failed++;
            continue;
        }
        try {
            const result = await placeBulkItem(organizationId, batch, item, assertOwned);
            anyPlaced ||= result.placed > 0;
            if (result.errors.length) throw new QueueError(result.errors.join('; '));
            await db.bulkUploadItem.update({ where: { id: item.id }, data: { status: 'COMPLETED', error: null } });
            processed++;
        } catch (error) {
            if (error instanceof BatchCancelled) return finishCancellation(organizationId, batchId);
            failed++;
            const message = error instanceof QueueError ? error.message : 'Could not place this row in the queue';
            await db.bulkUploadItem.update({ where: { id: item.id }, data: { status: 'FAILED', error: message } });
            log.warn({ batchId, itemId: item.id, position: item.position, err: error }, 'Bulk row could not be placed');
        }
        // Incremental so the progress bar moves on a long batch.
        await db.bulkUploadBatch.update({
            where: { id: batchId },
            data: { processedItems: processed, failedItems: failed },
        });
    }

    // Include successful placements from previous attempts of a partially completed row.
    anyPlaced ||= (await db.publishingQueueItem.count({ where: { organizationId, bulkItem: { batchId }, status: 'SCHEDULED' } })) > 0;
    const status = processed === 0 && failed > 0 && !anyPlaced
        ? 'FAILED'
        : failed > 0 ? 'PARTIAL' : 'COMPLETED';
    await db.bulkUploadBatch.updateMany({
        where: { id: batchId, organizationId, status: 'PROCESSING' },
        data: { status, completedAt: new Date(), processedItems: processed, failedItems: failed },
    });
    const final = await db.bulkUploadBatch.findFirst({ where: { id: batchId, organizationId }, select: { status: true } });
    if (final?.status === 'CANCELLING') return finishCancellation(organizationId, batchId);

    log.info({ batchId, processed, failed, status }, 'Bulk batch finished');
}

type BatchRecord = Prisma.BulkUploadBatchGetPayload<{ include: { items: true } }>;

/**
 * One row -> one Post per target profile, linked as one multi-platform group the
 * way the composer does, then placed into each profile's queue.
 */
async function placeBulkItem(organizationId: string, batch: BatchRecord, item: BatchRecord['items'][number], assertOwned: () => void) {
    const mediaIds = await resolveRowMedia(organizationId, item);
    const errors: string[] = [];
    let placed = 0;
    for (const socialAccountId of batch.socialAccountIds) {
        assertOwned();
        await assertBatchActive(organizationId, batch.id);
        try {
            const placement = await reserveBulkPlacement(organizationId, batch, item, socialAccountId, mediaIds);
            assertOwned();
            await assertBatchActive(organizationId, batch.id);
            await reconcilePlacementSchedule(organizationId, placement);
            placed++;
        } catch (error) {
            if (error instanceof BatchCancelled) throw error;
            const reason = error instanceof Error ? error.message : 'Could not place this profile';
            errors.push(`${socialAccountId}: ${reason}`);
        }
    }
    return { placed, errors };
}

type Placement = Prisma.PublishingQueueItemGetPayload<{ include: { post: true } }>;

async function reserveBulkPlacement(organizationId: string, batch: BatchRecord, item: BatchRecord['items'][number], accountId: string, mediaIds: string[]): Promise<Placement> {
    const existing = await db.publishingQueueItem.findUnique({
        where: { bulkItemId_targetAccountId: { bulkItemId: item.id, targetAccountId: accountId } }, include: { post: true },
    });
    if (existing?.status === 'CANCELLED') throw new QueueError('This placement was cancelled; it will not be recreated');
    if (existing) return existing;
    const queue = await resolveQueueForLabel(organizationId, accountId, batch.label);
    const account = await db.socialAccount.findFirst({ where: { id: accountId, organizationId, isActive: true }, select: { platform: true } });
    if (!account) throw new QueueError('A selected profile is no longer connected', 409);

    return db.$transaction(async tx => {
        const postId = placementPostId(item.id, accountId);
        if (await tx.post.findUnique({ where: { id: postId }, select: { id: true } })) {
            throw new QueueError('The original placement was removed. Review its post before queuing again.');
        }
        const media = mediaIds.length ? await tx.media.findFirst({ where: { id: mediaIds[0], organizationId }, select: { mimeType: true } }) : null;
        const postType = media?.mimeType.startsWith('video/')
            ? (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK' ? 'REEL' : 'VIDEO') : 'FEED';
        await createQueueDraft(tx, {
            organizationId, userId: batch.createdBy || '', userName: 'Member (via bulk queue)', caption: item.caption,
            platformAccountIds: [accountId], mediaIds, pillarId: batch.pillarId,
            platformSettings: { [accountId]: { postType } },
        }, postId);
        await tx.post.update({ where: { id: postId }, data: { linkedGroupId: placementPostId(item.id, batch.socialAccountIds[0]) } });
        return tx.publishingQueueItem.create({
            data: { organizationId, queueId: queue.id, bulkItemId: item.id, targetAccountId: accountId, postId, mode: batch.mode }, include: { post: true },
        });
    });
}

async function reconcilePlacementSchedule(organizationId: string, placement: Placement) {
    const post = placement.post;
    if (!post) throw new QueueError('The placement post was removed');
    if (post.status === 'PUBLISHED' || post.status === 'PUBLISHING') return;
    if (post.status === 'SCHEDULED' && post.scheduledAt) {
        if (placement.status !== 'SCHEDULED') {
            // Recover a crash between scheduling and recording its result, without reallocating a slot.
            await reschedulePost(post.id, organizationId, post.scheduledAt, { autoPublish: 'preserve', expectedScheduledAt: post.scheduledAt });
            await db.publishingQueueItem.update({ where: { id: placement.id }, data: { status: 'SCHEDULED', scheduledAt: post.scheduledAt, error: null } });
        }
        return;
    }
    if (placement.status === 'SCHEDULED') throw new QueueError('This post was unscheduled outside the queue; it will not be scheduled again');
    await scheduleQueueItem(organizationId, placement.id);
}

/** Media for a row: the single asset it carries, when it has one. */
async function resolveRowMedia(organizationId: string, item: { mediaId: string | null; requiresMedia: boolean }) {
    if (!item.mediaId) {
        if (item.requiresMedia) throw new QueueError('Required media was removed from this workspace');
        return [];
    }
    const media = await db.media.findFirst({
        where: { id: item.mediaId, organizationId }, select: { id: true },
    });
    if (!media) throw new QueueError('Required media was removed from this workspace');
    return [media.id];
}

export async function getBatch(organizationId: string, batchId: string) {
    const batch = await db.bulkUploadBatch.findFirst({
        where: { id: batchId, organizationId },
        include: {
            items: {
                orderBy: { position: 'asc' },
                take: MAX_ITEMS_PER_BATCH,
                select: {
                    id: true, position: true, status: true, error: true, sourceName: true, caption: true,
                    queueItems: { select: { id: true, targetAccountId: true, scheduledAt: true, status: true, queue: { select: { label: true, name: true, socialAccountId: true } } } },
                },
            },
        },
    });
    if (!batch) throw new QueueError('Batch not found', 404);
    return {
        id: batch.id,
        kind: batch.kind,
        status: batch.status,
        mode: batch.mode,
        label: batch.label,
        totalItems: batch.totalItems,
        processedItems: batch.processedItems,
        failedItems: batch.failedItems,
        error: batch.error,
        createdAt: batch.createdAt.toISOString(),
        completedAt: batch.completedAt?.toISOString() ?? null,
        items: batch.items.map(item => ({
            id: item.id,
            position: item.position,
            status: item.status,
            error: item.error,
            sourceName: item.sourceName,
            caption: item.caption.slice(0, 200),
            placements: item.queueItems.map(qi => ({
                itemId: qi.id,
                status: qi.status,
                scheduledAt: qi.scheduledAt?.toISOString() ?? null,
                queue: qi.queue?.label || qi.queue?.name || 'Removed queue',
                socialAccountId: qi.targetAccountId || qi.queue?.socialAccountId || null,
            })),
        })),
    };
}

export async function listBatches(organizationId: string, limit = 20) {
    const batches = await db.bulkUploadBatch.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
            id: true, kind: true, status: true, mode: true, label: true,
            totalItems: true, processedItems: true, failedItems: true, createdAt: true,
        },
    });
    return batches;
}

/**
 * Cancels an unstarted/unfinished batch: pending rows stop being placed and
 * their already-scheduled posts are returned to drafts through the normal
 * cancellation path.
 */
export async function cancelBatch(organizationId: string, batchId: string) {
    const batch = await db.bulkUploadBatch.findFirst({
        where: { id: batchId, organizationId },
        select: { id: true, status: true },
    });
    if (!batch) throw new QueueError('Batch not found', 404);
    if (batch.status === 'COMPLETED') throw new QueueError('This batch is already finished');

    if (batch.status === 'CANCELLED') return { status: 'CANCELLED' as const };
    const requested = await db.bulkUploadBatch.updateMany({ where: { id: batchId, organizationId, status: { not: 'COMPLETED' } }, data: { status: 'CANCELLING', error: null } });
    if (!requested.count) throw new QueueError('This batch is already finished', 409);
    // The active worker sees the request before its next placement. This job also cleans up
    // after a crashed worker, using the same batch lock rather than racing its writes.
    await bulkUploadQueue.add(`cancel-${batchId}`, { organizationId, batchId }, { jobId: `bulk-cancel-${batchId}-${Date.now()}` });
    return { status: 'CANCELLING' as const };
}

async function finishCancellation(organizationId: string, batchId: string) {
    const items = await db.publishingQueueItem.findMany({
        where: { organizationId, bulkItem: { batchId }, status: { not: 'CANCELLED' } },
        select: { id: true, post: { select: { status: true } } },
    });
    const failures: string[] = [];
    let alreadyPublishing = 0;
    for (const item of items) {
        if (item.post?.status === 'PUBLISHED' || item.post?.status === 'PUBLISHING') { alreadyPublishing++; continue; }
        await cancelQueueItem(organizationId, item.id).catch((error: unknown) => {
            log.warn({ itemId: item.id, err: error }, 'Could not cancel queue item during batch cancel');
            failures.push(item.id);
        });
    }
    await db.bulkUploadBatch.updateMany({ where: { id: batchId, organizationId, status: 'CANCELLING' }, data: {
        status: failures.length ? 'CANCELLING' : 'CANCELLED', completedAt: failures.length ? null : new Date(),
        error: failures.length ? `${failures.length} placements could not be cancelled. Check their publishing state and retry cancellation.`
            : alreadyPublishing ? `${alreadyPublishing} posts were already publishing or published and could not be recalled. All other placements were cancelled.` : null,
    } });
    if (failures.length) throw new QueueError('Some placements could not be cancelled. Check the batch details before retrying.', 409);
    return { status: 'CANCELLED' as const, items: items.length, alreadyPublishing };
}

/** A user retry resumes only failed rows; successful posts and their schedules are reused. */
export async function retryBatch(organizationId: string, batchId: string) {
    return withQueueLock(`batch:${organizationId}:${batchId}`, async () => {
        const batch = await db.bulkUploadBatch.findFirst({ where: { id: batchId, organizationId } });
        if (!batch) throw new QueueError('Batch not found', 404);
        if (!['PARTIAL', 'FAILED'].includes(batch.status)) throw new QueueError('Only a failed or partial batch can be retried', 409);
        await db.$transaction([
            db.bulkUploadItem.updateMany({ where: { batchId, organizationId, status: 'FAILED' }, data: { status: 'PENDING', error: null } }),
            db.bulkUploadBatch.update({ where: { id: batchId }, data: { status: 'PENDING', completedAt: null, error: null } }),
        ]);
        try {
            await bulkUploadQueue.add(`retry-${batchId}`, { organizationId, batchId }, { jobId: `bulk-retry-${batchId}-${Date.now()}` });
        } catch (error) {
            await db.bulkUploadBatch.updateMany({ where: { id: batchId, organizationId, status: 'PENDING' }, data: { status: batch.status, error: 'Could not enqueue the retry. Please retry again.' } });
            throw error;
        }
        return { status: 'PENDING' as const };
    });
}
