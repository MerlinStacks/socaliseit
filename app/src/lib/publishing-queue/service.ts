/**
 * Publishing Queues — workspace service.
 *
 * Owns queue templates and the placement of content into them. Deliberately
 * narrow: it computes a datetime and then delegates to lib/queue.ts, the same
 * scheduling path the composer already uses. Nothing here changes how manual
 * scheduling, publish-now, or the calendar behave, and no existing code needs to
 * know these tables exist.
 *
 * Every function takes organizationId first and filters by it, matching the
 * workspace-isolation convention used across lib/.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { reschedulePost, cancelScheduledPost } from '@/lib/queue';
import { withQueueLock } from './lock';
import { cloneQueueDraft } from './posts';
import type { Prisma } from '@/generated/prisma/client';
import type { QueueFillMode } from '@/generated/prisma/enums';
import {
    allocateSlot,
    generateOccurrences,
    MAX_LABELS_PER_ACCOUNT,
    MINUTE_MS,
    previewOccurrences,
    validateSlots,
    DEFAULT_HORIZON_DAYS,
    type SlotTemplate,
    type TakenSlot,
} from './slots';

const log = logger.child({ service: 'publishing-queue' });

export const MAX_NAME_LENGTH = 80;
export const MAX_QUEUES_PER_ACCOUNT = MAX_LABELS_PER_ACCOUNT + 1; // + the default queue
/** A queue's own items are the only things it will ever move. */
const MAX_TAKEN_SCAN = 5000;

export class QueueError extends Error {
    constructor(message: string, public readonly status = 400) {
        super(message);
    }
}

export interface QueueSlotDto {
    id?: string;
    daysOfWeek: number[];
    time: string;
    enabled?: boolean;
}

export interface QueueDto {
    id: string;
    label: string;
    name: string;
    timezone: string;
    enabled: boolean;
    socialAccountId: string;
    accountName: string;
    platform: string;
    slotCount: number;
    scheduledCount: number;
    openCount: number;
    nextAt: string | null;
}

// ============================================================================
// TEMPLATE CRUD
// ============================================================================

function normaliseLabel(label?: string | null): string {
    const trimmed = (label ?? '').trim();
    if (trimmed.length > MAX_NAME_LENGTH) throw new QueueError('Queue label is too long');
    return trimmed; // '' is the default queue
}

function sanitiseSlots(slots: QueueSlotDto[]): Array<{ daysOfWeek: number[]; time: string; enabled: boolean }> {
    const cleaned = slots.map(slot => ({
        daysOfWeek: [...new Set(slot.daysOfWeek)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort(),
        time: slot.time.trim(),
        enabled: slot.enabled !== false,
    }));
    const problem = validateSlots(cleaned);
    if (problem) throw new QueueError(problem);
    return cleaned;
}

async function resolveTimezone(organizationId: string, requested?: string): Promise<string> {
    if (requested) {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: requested });
            return requested;
        } catch {
            throw new QueueError('Unknown timezone');
        }
    }
    const organization = await db.organization.findUnique({
        where: { id: organizationId }, select: { timezone: true },
    });
    return organization?.timezone || 'UTC';
}

async function assertAccountInWorkspace(organizationId: string, socialAccountId: string) {
    const account = await db.socialAccount.findFirst({
        where: { id: socialAccountId, organizationId },
        select: { id: true, name: true, platform: true },
    });
    if (!account) throw new QueueError('That profile is not in this workspace', 404);
    return account;
}

export async function listQueues(organizationId: string): Promise<QueueDto[]> {
    const queues = await db.publishingQueue.findMany({
        where: { organizationId },
        include: {
            slots: { orderBy: { time: 'asc' } },
            socialAccount: { select: { name: true, platform: true } },
            items: { where: { status: 'SCHEDULED', post: { status: 'SCHEDULED', scheduledAt: { not: null } } }, select: { post: { select: { scheduledAt: true } } }, take: MAX_TAKEN_SCAN },
        },
        orderBy: [{ socialAccountId: 'asc' }, { label: 'asc' }],
    });

    const now = new Date();
    const horizon = new Date(now.getTime() + DEFAULT_HORIZON_DAYS * 24 * 60 * MINUTE_MS);
    const occupancy = queues.length ? await db.post.findMany({
        where: { organizationId, socialAccountId: { in: [...new Set(queues.map(queue => queue.socialAccountId))] },
            status: { in: ['SCHEDULED', 'PUBLISHING'] }, scheduledAt: { gte: now, lte: horizon } },
        select: { socialAccountId: true, scheduledAt: true }, take: MAX_TAKEN_SCAN,
    }) : [];
    if (occupancy.length >= MAX_TAKEN_SCAN) throw new QueueError('Too many scheduled posts to safely summarize queue availability', 409);
    return queues.map(queue => {
        const taken = queue.items
            .map(item => item.post?.scheduledAt)
            .filter((at): at is Date => !!at && at >= now);
        const occurrences = generateOccurrences(queue.slots, queue.timezone, now, horizon);
        const open = occurrences.filter(o => !occupancy.some(post => post.socialAccountId === queue.socialAccountId
            && post.scheduledAt && Math.abs(post.scheduledAt.getTime() - o.at.getTime()) < MINUTE_MS));
        return {
            id: queue.id,
            label: queue.label,
            name: queue.name,
            timezone: queue.timezone,
            enabled: queue.enabled,
            socialAccountId: queue.socialAccountId,
            accountName: queue.socialAccount?.name ?? 'Removed profile',
            platform: String(queue.socialAccount?.platform ?? 'UNKNOWN'),
            slotCount: queue.slots.length,
            scheduledCount: taken.length,
            openCount: open.length,
            nextAt: (taken.length ? minDate(taken) : null)?.toISOString() ?? null,
        };
    });
}

function minDate(dates: Date[]): Date | undefined {
    return dates.reduce<Date | undefined>((min, at) => (!min || at < min ? at : min), undefined);
}

/** Creates a queue, or replaces the template of an existing one. */
export async function saveQueue(input: {
    organizationId: string;
    queueId?: string;
    socialAccountId?: string;
    label?: string | null;
    name?: string;
    timezone?: string;
    enabled?: boolean;
    slots: QueueSlotDto[];
}) {
    const slots = sanitiseSlots(input.slots);

    if (input.queueId) {
        const existing = await db.publishingQueue.findFirst({
            where: { id: input.queueId, organizationId: input.organizationId },
            include: { slots: true },
        });
        if (!existing) throw new QueueError('Queue not found', 404);

        const timezone = await resolveTimezone(input.organizationId, input.timezone ?? existing.timezone);
        // Why replace-not-patch: a queue template is edited as a whole by the UI,
        // and partial slot patching made "which line is this id?" ambiguous.
        return db.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.publishingQueueSlot.deleteMany({ where: { queueId: existing.id } });
            const queue = await tx.publishingQueue.update({
                where: { id: existing.id },
                data: {
                    timezone,
                    enabled: input.enabled ?? existing.enabled,
                    name: input.name?.trim() || existing.name,
                    slots: { create: slots },
                },
                include: { slots: { orderBy: { time: 'asc' } } },
            });
            // Already-scheduled items keep their datetimes on purpose: slotId is
            // kept as history even when the template line no longer exists.
            log.info({ queueId: queue.id, slotCount: slots.length }, 'Publishing queue template replaced');
            return queue;
        });
    }

    if (!input.socialAccountId) throw new QueueError('A queue needs a profile');
    const account = await assertAccountInWorkspace(input.organizationId, input.socialAccountId);
    const label = normaliseLabel(input.label);
    const timezone = await resolveTimezone(input.organizationId, input.timezone);

    const existingCount = await db.publishingQueue.count({
        where: { organizationId: input.organizationId, socialAccountId: account.id },
    });
    if (existingCount >= MAX_QUEUES_PER_ACCOUNT) {
        throw new QueueError(`A profile can have ${MAX_QUEUES_PER_ACCOUNT} queues at most`);
    }

    try {
        return await db.publishingQueue.create({
            data: {
                organizationId: input.organizationId,
                socialAccountId: account.id,
                label,
                name: input.name?.trim() || (label || 'Default queue'),
                timezone,
                enabled: input.enabled !== false,
                slots: { create: slots },
            },
            include: { slots: { orderBy: { time: 'asc' } } },
        });
    } catch (error) {
        // Why: (socialAccountId, label) is unique; surface it as a 409 instead of
        // a 500 when two tabs save the same queue at once.
        if (isUniqueViolation(error)) throw new QueueError('That profile already has a queue with this label', 409);
        throw error;
    }
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null
        && (error as { code?: string }).code === 'P2002';
}

export async function deleteQueue(organizationId: string, queueId: string) {
    const queue = await db.publishingQueue.findFirst({
        where: { id: queueId, organizationId },
        include: { items: { where: { status: 'SCHEDULED' }, select: { id: true, postId: true } } },
    });
    if (!queue) throw new QueueError('Queue not found', 404);

    // Deleting the template must not silently cancel real posts — users can move
    // those by hand. Bookkeeping retains a null queue pointer as a durable retry
    // tombstone; posts keep their schedules but are no longer movable by any queue.
    await db.publishingQueue.delete({ where: { id: queueId } });

    const leftScheduled = queue.items.filter(item => item.postId).length;
    log.info({ queueId, leftScheduled }, 'Publishing queue deleted');
    return { deleted: true, leftScheduled };
}

/** Queue list for one profile plus its labels, for pickers. */
export async function listQueueOptions(organizationId: string) {
    const accounts = await db.socialAccount.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, platform: true },
        orderBy: [{ platform: 'asc' }, { name: 'asc' }],
    });
    const queues = await db.publishingQueue.findMany({
        where: { organizationId, enabled: true },
        select: {
            id: true, label: true, name: true, socialAccountId: true,
            slots: { select: { id: true, daysOfWeek: true, time: true, enabled: true } },
        },
        orderBy: { label: 'asc' },
    });
    return accounts.map(account => ({
        ...account,
        queues: queues.filter(queue => queue.socialAccountId === account.id),
    }));
}

// ============================================================================
// ALLOCATION AGAINST THE DATABASE
// ============================================================================

interface LoadableQueue {
    id: string;
    label: string;
    name: string;
    socialAccountId: string;
    timezone: string;
    enabled: boolean;
    slots: SlotTemplate[];
}

async function loadQueue(organizationId: string, queueId: string): Promise<LoadableQueue> {
    const queue = await db.publishingQueue.findFirst({
        where: { id: queueId, organizationId },
        include: { slots: { where: { enabled: true }, orderBy: { time: 'asc' } } },
    });
    if (!queue) throw new QueueError('Queue not found', 404);
    return {
        id: queue.id,
        label: queue.label,
        name: queue.name,
        socialAccountId: queue.socialAccountId,
        timezone: queue.timezone,
        enabled: queue.enabled,
        slots: queue.slots,
    };
}

/**
 * Occupancy for a profile's queue.
 *
 * Two sources, on purpose:
 *  - this queue's own items (`owned`), which NEXT may push later;
 *  - every other scheduled post on the same profile (`owned: false`), which the
 *    queue must never move but equally must not double-book.
 * Times are read from the Post, not the queue row, so dragging a queued post on
 * the calendar is respected by the allocator instead of being overwritten.
 */
async function loadTaken(organizationId: string, queue: LoadableQueue, now: Date): Promise<TakenSlot[]> {
    const horizon = new Date(now.getTime() + DEFAULT_HORIZON_DAYS * 2 * 24 * 60 * MINUTE_MS);
    const [owned, external] = await Promise.all([
        db.publishingQueueItem.findMany({
            where: { queueId: queue.id, status: 'SCHEDULED', post: { status: 'SCHEDULED', scheduledAt: { gte: now, lte: horizon } } },
            select: { id: true, post: { select: { scheduledAt: true, status: true } } },
            take: MAX_TAKEN_SCAN,
        }),
        db.post.findMany({
            where: {
                organizationId,
                socialAccountId: queue.socialAccountId,
                status: { in: ['SCHEDULED', 'PUBLISHING'] },
                scheduledAt: { gte: now, lte: horizon },
                OR: [{ queueItem: null }, { queueItem: { queueId: null } }, { queueItem: { queueId: { not: queue.id } } }, { queueItem: { status: { not: 'SCHEDULED' } } }],
            },
            select: { id: true, scheduledAt: true },
            take: MAX_TAKEN_SCAN,
        }),
    ]);
    if (owned.length >= MAX_TAKEN_SCAN || external.length >= MAX_TAKEN_SCAN) {
        throw new QueueError('Too many scheduled posts to safely allocate another slot', 409);
    }

    const taken: TakenSlot[] = [];
    for (const item of owned) {
        const at = item.post?.scheduledAt;
        if (item.post?.status === 'SCHEDULED' && at && at >= now) taken.push({ at, ref: item.id, owned: true });
    }
    for (const post of external) {
        if (post.scheduledAt) taken.push({ at: post.scheduledAt, ref: post.id, owned: false });
    }
    return taken.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Finds a datetime for one queue item and applies it.
 *
 * Displacements are applied before the new item so the cascade's target slot is
 * genuinely free when schedulePost() is called. If a displacement fails partway,
 * the new item is not inserted and the partially-moved items are logged loudly —
 * BullMQ job moves are not transactional, exactly as in lib/queue.ts.
 */
export async function scheduleQueueItem(organizationId: string, itemId: string, options?: { now?: Date }) {
    const identity = await db.publishingQueueItem.findFirst({ where: { id: itemId, organizationId }, select: { queue: { select: { socialAccountId: true } } } });
    if (!identity) throw new QueueError('Queue item not found', 404);
    if (!identity.queue) throw new QueueError('The original queue was removed. Review the post before queuing again.', 409);
    return withQueueLock(`profile:${organizationId}:${identity.queue.socialAccountId}`, assertOwned => scheduleQueueItemLocked(organizationId, itemId, assertOwned, options));
}

async function scheduleQueueItemLocked(organizationId: string, itemId: string, assertOwned: () => void, options?: { now?: Date }) {
    const now = options?.now ?? new Date();
    const item = await db.publishingQueueItem.findFirst({
        where: { id: itemId, organizationId },
        include: { queue: { include: { slots: { where: { enabled: true } } } }, post: true },
    });
    if (!item) throw new QueueError('Queue item not found', 404);
    if (!item.queue) throw new QueueError('The original queue was removed', 409);
    if (item.status === 'CANCELLED') throw new QueueError('This queue item was cancelled', 409);
    if (!item.postId || !item.post) throw new QueueError('This queue item has no post to schedule', 409);
    if (item.post.status === 'PUBLISHED' || item.post.status === 'PUBLISHING') {
        throw new QueueError('This post has already been published', 409);
    }

    const queue: LoadableQueue = {
        id: item.queue.id,
        label: item.queue.label,
        name: item.queue.name,
        socialAccountId: item.queue.socialAccountId,
        timezone: item.queue.timezone,
        enabled: item.queue.enabled,
        slots: item.queue.slots,
    };
    if (!queue.enabled) throw new QueueError('This queue is disabled', 409);

    const taken = (await loadTaken(organizationId, queue, now)).filter(t => t.ref !== itemId);
    const allocation = allocateSlot({
        slots: queue.slots,
        timezone: queue.timezone,
        mode: item.mode,
        now,
        taken,
    });
    if (!allocation.ok) throw new QueueError(allocationFailureMessage(allocation.error), 409);

    for (const displacement of [...allocation.displacements].reverse()) {
        assertOwned();
        // ref is a queue item id; move its post through the normal rescheduler so
        // the delayed BullMQ job follows the new time.
        const moved = await db.publishingQueueItem.findFirst({
            where: { id: displacement.ref, organizationId },
            select: { id: true, postId: true },
        });
        if (!moved?.postId) continue;
        await reschedulePost(moved.postId, organizationId, displacement.to, { autoPublish: 'preserve', expectedScheduledAt: displacement.from });
        await db.publishingQueueItem.update({
            where: { id: moved.id },
            data: { scheduledAt: displacement.to },
        });
    }

    assertOwned();
    await reschedulePost(item.postId, organizationId, allocation.at, {
        autoPublish: true,
        ...(item.post.status === 'SCHEDULED' && item.post.scheduledAt ? { expectedScheduledAt: item.post.scheduledAt } : {}),
    });

    const updated = await db.publishingQueueItem.update({
        where: { id: itemId },
        data: { status: 'SCHEDULED', scheduledAt: allocation.at, slotId: allocation.slotId, error: null },
        include: { post: { select: { id: true, scheduledAt: true, status: true } } },
    });

    log.info(
        { itemId, postId: item.postId, scheduledAt: allocation.at, mode: item.mode, displaced: allocation.displacements.length },
        'Queue item scheduled',
    );
    return { item: updated, displaced: allocation.displacements.length };
}

function allocationFailureMessage(error: string): string {
    if (error === 'NO_SLOTS') return 'This queue has no enabled time slots yet';
    if (error === 'SHIFT_LIMIT') return 'Adding to the front would move too many scheduled posts — use Queue last instead';
    return 'Every time slot is full right now. Add more slots or try again later';
}

// ============================================================================
// ITEMS
// ============================================================================

/**
 * Places existing drafts into queues, one per target profile.
 * Shared by the "Add to queue" UI action and the API.
 */
export async function queueExistingDrafts(input: {
    organizationId: string;
    postIds: string[];
    socialAccountIds: string[];
    label?: string | null;
    mode: QueueFillMode;
    userId: string;
    canCreate: boolean;
}) {
    if (input.postIds.length === 0) throw new QueueError('Select at least one post');
    if (input.postIds.length > 200) throw new QueueError('At most 200 posts can be queued at once');
    if (input.socialAccountIds.length === 0) throw new QueueError('Choose at least one profile');

    const results: Array<{ postId: string; ok: boolean; scheduledAt?: string; error?: string }> = [];
    for (const postId of input.postIds) {
        const post = await db.post.findFirst({
            where: { id: postId, organizationId: input.organizationId },
            select: { id: true, status: true, socialAccountId: true },
        });
        if (!post) {
            results.push({ postId, ok: false, error: 'Post not found' });
            continue;
        }
        if (post.status === 'PUBLISHED' || post.status === 'PUBLISHING') {
            results.push({ postId, ok: false, error: 'Already published' });
            continue;
        }
        if (!input.canCreate && input.socialAccountIds.some(id => id !== post.socialAccountId)) {
            results.push({ postId, ok: false, error: 'Creating a post for another profile requires posts.create permission' });
            continue;
        }

        try {
            const created: Array<{ id: string }> = [];
            for (const socialAccountId of input.socialAccountIds) {
                const queue = await resolveQueueForLabel(input.organizationId, socialAccountId, input.label);
                const targetPostId = socialAccountId === post.socialAccountId
                    ? post.id
                    : await cloneQueueDraft(input.organizationId, post.id, socialAccountId, input.userId);
                const item = await db.publishingQueueItem.create({
                    data: { organizationId: input.organizationId, queueId: queue.id, postId: targetPostId, mode: input.mode },
                });
                created.push({ id: item.id });
            }
            // Schedule after every row exists so a mid-way failure leaves visible,
            // retryable PENDING items rather than a half-placed batch.
            let scheduledAt: string | undefined;
            for (const createdItem of created) {
                const scheduled = await scheduleQueueItem(input.organizationId, createdItem.id);
                scheduledAt = scheduled.item.scheduledAt?.toISOString();
            }
            results.push({ postId, ok: true, scheduledAt });
        } catch (error) {
            const message = error instanceof QueueError ? error.message : 'Could not add this post to the queue';
            log.warn({ postId, err: error }, 'Queue placement failed for one post');
            results.push({ postId, ok: false, error: message });
        }
    }
    return results;
}

/**
 * The queue a label points to on a profile, falling back to that profile's
 * default queue. Matches how comparable tools behave when one profile in a
 * multi-profile post does not carry the label.
 */
export async function resolveQueueForLabel(organizationId: string, socialAccountId: string, label?: string | null) {
    const wanted = normaliseLabel(label);
    if (wanted) {
        const labelled = await db.publishingQueue.findFirst({
            where: { organizationId, socialAccountId, label: wanted, enabled: true },
            include: { slots: { where: { enabled: true } } },
        });
        if (labelled) return labelled;
    }
    const fallback = await db.publishingQueue.findFirst({
        where: { organizationId, socialAccountId, label: '', enabled: true },
        include: { slots: { where: { enabled: true } } },
    });
    if (!fallback) {
        throw new QueueError(
            wanted
                ? `No queue named "${wanted}" on this profile, and no default queue to fall back to`
                : 'This profile has no publishing queue yet — add time slots first',
            409,
        );
    }
    return fallback;
}

export async function cancelQueueItem(organizationId: string, itemId: string) {
    const identity = await db.publishingQueueItem.findFirst({ where: { id: itemId, organizationId }, select: { queue: { select: { socialAccountId: true } } } });
    if (!identity) throw new QueueError('Queue item not found', 404);
    // Removed templates leave durable reservations. The post lock still protects cancellation.
    if (!identity.queue) return cancelQueueItemLocked(organizationId, itemId);
    return withQueueLock(`profile:${organizationId}:${identity.queue.socialAccountId}`, () => cancelQueueItemLocked(organizationId, itemId));
}

async function cancelQueueItemLocked(organizationId: string, itemId: string) {
    const item = await db.publishingQueueItem.findFirst({
        where: { id: itemId, organizationId },
        select: { id: true, status: true, postId: true, post: { select: { status: true } } },
    });
    if (!item) throw new QueueError('Queue item not found', 404);
    if (item.post?.status === 'PUBLISHED' || item.post?.status === 'PUBLISHING') {
        throw new QueueError('This post has already been published', 409);
    }
    if (item.postId && item.post) await cancelScheduledPost(item.postId);
    return db.publishingQueueItem.update({
        where: { id: itemId },
        data: { status: 'CANCELLED', scheduledAt: null, slotId: null },
    });
}

/** Re-runs allocation for one item — the "move to the next open slot" action. */
export async function reslotQueueItem(organizationId: string, itemId: string) {
    const item = await db.publishingQueueItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true } });
    if (!item) throw new QueueError('Queue item not found', 404);
    return scheduleQueueItem(organizationId, itemId);
}

// ============================================================================
// TIMELINE / PREVIEW
// ============================================================================

export async function getQueueTimeline(organizationId: string, options?: { queueId?: string; socialAccountId?: string; label?: string | null; limit?: number }) {
    const now = new Date();
    const queue = options?.queueId ? await loadQueue(organizationId, options.queueId) : options?.socialAccountId
        ? await resolveQueueForLabel(organizationId, options.socialAccountId, options.label)
        : null;
    if (!queue) throw new QueueError('A profile is required to preview a queue', 400);

    const items = await db.publishingQueueItem.findMany({
        where: { queueId: queue.id, status: 'SCHEDULED', post: { status: 'SCHEDULED', scheduledAt: { gte: now } } },
        orderBy: { scheduledAt: 'asc' },
        take: options?.limit ?? 50,
        select: {
            id: true, scheduledAt: true, slotId: true,
            post: {
                select: {
                    id: true, caption: true, status: true, scheduledAt: true, platform: true,
                    media: { select: { order: true, media: { select: { id: true, url: true, mimeType: true, thumbnailUrl: true } } } },
                },
            },
        },
    });

    const taken = await loadTaken(organizationId, {
        id: queue.id, label: queue.label, name: queue.name, socialAccountId: queue.socialAccountId, timezone: queue.timezone, enabled: queue.enabled, slots: queue.slots,
    }, now);
    const until = new Date(now.getTime() + 21 * 24 * 60 * MINUTE_MS);
    const preview = previewOccurrences({
        slots: queue.slots,
        timezone: queue.timezone,
        from: now,
        until,
        taken,
        limit: options?.limit ?? 50,
    });

    return {
        queue: {
            id: queue.id, label: queue.label, name: queue.name, timezone: queue.timezone,
            socialAccountId: queue.socialAccountId,
            slots: queue.slots,
        },
        items: items.map(item => ({
            id: item.id,
            postId: item.post?.id ?? null,
            caption: item.post?.caption ?? '',
            platform: item.post?.platform ?? null,
            // The post is the truth: it moves if a user drags it on the calendar.
            scheduledAt: item.post?.scheduledAt?.toISOString() ?? null,
            slotId: item.slotId,
        })),
        preview,
    };
}
