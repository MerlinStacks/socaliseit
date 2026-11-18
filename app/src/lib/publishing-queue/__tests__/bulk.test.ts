// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn(), createDraft: vi.fn(), reschedule: vi.fn(), add: vi.fn(), rowUpdate: vi.fn() }));
vi.mock('../lock', () => ({ withQueueLock: async (_key: string, operation: (assertOwned: () => void) => Promise<unknown>) => operation(() => {}) }));
vi.mock('@/lib/logger', () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock('@/lib/cache', () => ({ invalidatePostCaches: vi.fn() }));
vi.mock('@/lib/bullmq/queues', () => ({ bulkUploadQueue: { add: m.add } }));
vi.mock('@/lib/queue', () => ({ reschedulePost: m.reschedule }));
vi.mock('../posts', () => ({ placementPostId: (row: string, account: string) => `${row}-${account}`, createQueueDraft: m.createDraft }));
vi.mock('../service', () => ({
    QueueError: class extends Error { constructor(message: string, public status = 400) { super(message); } },
    MAX_NAME_LENGTH: 80, scheduleQueueItem: m.schedule, cancelQueueItem: m.cancel,
    resolveQueueForLabel: async (_org: string, id: string) => ({ id: `queue-${id}` }),
}));

type Post = { id: string; status: string; scheduledAt: Date | null };
type Placement = { id: string; bulkItemId: string; targetAccountId: string; postId: string; status: string; post: Post };
type Row = { id: string; position: number; caption: string; status: string; error: string | null; mediaId: string | null; requiresMedia: boolean };
let batch: { id: string; status: string; socialAccountIds: string[]; items: Row[]; error?: string | null };
const posts = new Map<string, Post>();
const placements = new Map<string, Placement>();
const fakeDb = {
    bulkUploadBatch: {
        findFirst: vi.fn(async () => structuredClone(batch)),
        updateMany: vi.fn(async ({ where, data }) => {
            const status = where.status;
            const matches = !status || (typeof status === 'string' ? batch.status === status : status.in ? status.in.includes(batch.status) : batch.status !== status.not);
            if (matches) Object.assign(batch, data);
            return { count: matches ? 1 : 0 };
        }),
        update: vi.fn(async ({ data }) => Object.assign(batch, data)),
    },
    bulkUploadItem: { update: m.rowUpdate, updateMany: vi.fn(async ({ where, data }) => {
        const rows = batch.items.filter(row => row.status === where.status);
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
    }) },
    publishingQueueItem: {
        findUnique: vi.fn(async ({ where }) => [...placements.values()].find(p => p.bulkItemId === where.bulkItemId_targetAccountId.bulkItemId && p.targetAccountId === where.bulkItemId_targetAccountId.targetAccountId) ?? null),
        create: vi.fn(async ({ data }) => {
            const placement = { ...data, id: `placement-${data.postId}`, status: 'PENDING', post: posts.get(data.postId)! } as Placement;
            placements.set(placement.id, placement);
            return placement;
        }),
        update: vi.fn(async ({ where, data }) => Object.assign(placements.get(where.id)!, data)),
        findMany: vi.fn(async () => [...placements.values()].filter(p => p.status !== 'CANCELLED')),
        count: vi.fn(async () => [...placements.values()].filter(p => p.status === 'SCHEDULED').length),
    },
    post: { findUnique: vi.fn(async ({ where }) => posts.get(where.id) ?? null), update: vi.fn(async ({ where, data }) => Object.assign(posts.get(where.id)!, data)) },
    socialAccount: { findFirst: vi.fn(async () => ({ platform: 'INSTAGRAM' })) },
    media: { findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(async (operation: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[]) => {
        if (Array.isArray(operation)) return Promise.all(operation);
        const savedPosts = structuredClone(posts);
        const savedPlacements = structuredClone(placements);
        try { return await operation(fakeDb); }
        catch (error) {
            posts.clear(); savedPosts.forEach((value, key) => posts.set(key, value));
            placements.clear(); savedPlacements.forEach((value, key) => placements.set(key, value));
            throw error;
        }
    }),
};
vi.mock('@/lib/db', () => ({ get db() { return fakeDb; } }));

import { cancelBatch, processBatch, retryBatch } from '../bulk';

beforeEach(() => {
    vi.clearAllMocks(); posts.clear(); placements.clear();
    batch = { id: 'batch', status: 'PENDING', socialAccountIds: ['a'], items: [{ id: 'row', position: 0, caption: 'Hello', status: 'PENDING', error: null, mediaId: null, requiresMedia: false }] };
    m.rowUpdate.mockImplementation(async ({ where, data }) => Object.assign(batch.items.find(row => row.id === where.id)!, data));
    m.createDraft.mockImplementation(async (_tx, _input, id) => { posts.set(id, { id, status: 'DRAFT', scheduledAt: null }); return id; });
    m.schedule.mockImplementation(async (_org, id) => {
        const p = placements.get(id)!;
        p.post.status = 'SCHEDULED'; p.post.scheduledAt = new Date('2027-01-01T09:00:00Z'); p.status = 'SCHEDULED';
    });
    m.cancel.mockImplementation(async (_org, id) => { const p = placements.get(id)!; p.status = 'CANCELLED'; p.post.status = 'DRAFT'; p.post.scheduledAt = null; });
    m.add.mockResolvedValue({ id: 'job' });
});

describe('durable bulk placement', () => {
    it('does not recreate a post after a crash before row completion is recorded', async () => {
        m.rowUpdate.mockRejectedValueOnce(new Error('connection lost')).mockRejectedValueOnce(new Error('connection lost'));
        await expect(processBatch('org', 'batch')).rejects.toThrow('connection lost');
        await processBatch('org', 'batch');
        expect(m.createDraft).toHaveBeenCalledTimes(1);
        expect(m.schedule).toHaveBeenCalledTimes(1);
        expect(posts.size).toBe(1);
        expect(batch.status).toBe('COMPLETED');
    });

    it('repairs a committed schedule without reallocating when its result write was interrupted', async () => {
        m.schedule.mockImplementationOnce(async (_org, id) => {
            const p = placements.get(id)!;
            p.post.status = 'SCHEDULED'; p.post.scheduledAt = new Date('2027-01-01T09:00:00Z');
            throw new Error('result write interrupted');
        });
        m.rowUpdate.mockRejectedValueOnce(new Error('connection lost'));
        await expect(processBatch('org', 'batch')).rejects.toThrow('connection lost');
        await processBatch('org', 'batch');
        expect(m.createDraft).toHaveBeenCalledTimes(1);
        expect(m.reschedule).toHaveBeenCalledWith('row-a', 'org', expect.any(Date), expect.objectContaining({ autoPublish: 'preserve' }));
    });

    it('rolls back draft creation if its reservation cannot be saved', async () => {
        fakeDb.publishingQueueItem.create.mockRejectedValueOnce(new Error('placement insert failed'));
        await processBatch('org', 'batch');
        expect(posts.size).toBe(0);
        expect(m.schedule).not.toHaveBeenCalled();
    });

    it('reports partial target failure and retries only the failed placement', async () => {
        batch.socialAccountIds = ['a', 'b'];
        const schedule = m.schedule.getMockImplementation()!;
        m.schedule.mockImplementationOnce(schedule).mockRejectedValueOnce(new Error('queue full'));
        await processBatch('org', 'batch');
        expect(batch.status).toBe('PARTIAL');
        expect(batch.items[0].status).toBe('FAILED');
        await retryBatch('org', 'batch');
        await processBatch('org', 'batch');
        expect(m.createDraft).toHaveBeenCalledTimes(2);
        expect(m.schedule).toHaveBeenCalledTimes(3);
        expect(batch.status).toBe('COMPLETED');
    });

    it('preserves row diagnostics when Redis rejects a retry', async () => {
        batch.status = 'FAILED';
        batch.error = 'Original batch error';
        Object.assign(batch.items[0], { status: 'FAILED', error: 'No open slot' });
        const previous = structuredClone(batch);
        m.add.mockRejectedValueOnce(new Error('Redis offline'));

        await expect(retryBatch('org', 'batch')).rejects.toMatchObject({ status: 503 });
        expect(batch).toEqual(previous);
        await expect(retryBatch('org', 'batch')).resolves.toEqual({ status: 'PENDING' });
        expect(batch.items[0]).toMatchObject({ status: 'PENDING', error: null });
    });

    it('does not overwrite a cancellation requested while the retry is queued', async () => {
        batch.status = 'FAILED';
        Object.assign(batch.items[0], { status: 'FAILED', error: 'No open slot' });
        m.add.mockImplementationOnce(async () => { batch.status = 'CANCELLING'; });
        await expect(retryBatch('org', 'batch')).rejects.toMatchObject({ status: 409 });
        expect(batch.status).toBe('CANCELLING');
        expect(batch.items[0]).toMatchObject({ status: 'FAILED', error: 'No open slot' });
    });

    it('does not silently turn deleted creative into a text-only post', async () => {
        batch.items[0].requiresMedia = true;
        await processBatch('org', 'batch');
        expect(batch.status).toBe('FAILED');
        expect(m.createDraft).not.toHaveBeenCalled();
    });

    it('keeps a deleted-post reservation as a tombstone rather than recreating it', async () => {
        await processBatch('org', 'batch');
        const original = [...placements.values()][0];
        original.post = null as unknown as Post;
        batch.status = 'PROCESSING'; batch.items[0].status = 'PENDING';
        await processBatch('org', 'batch');
        expect(m.createDraft).toHaveBeenCalledTimes(1);
        expect(batch.items[0].status).toBe('FAILED');
    });
});

describe('cancellation handshake', () => {
    it('stops before the second row and releases schedules from the first', async () => {
        batch.items.push({ ...batch.items[0], id: 'row-2', position: 1 });
        const schedule = m.schedule.getMockImplementation()!;
        m.schedule.mockImplementationOnce(async (...args) => { await schedule(...args); await cancelBatch('org', 'batch'); });
        await processBatch('org', 'batch');
        expect(batch.status).toBe('CANCELLED');
        expect(m.createDraft).toHaveBeenCalledTimes(1);
        expect(m.cancel).toHaveBeenCalledTimes(1);
        expect(posts.get('row-a')?.status).toBe('DRAFT');
    });

    it('never places new content when a queued cancellation resumes after a worker crash', async () => {
        batch.status = 'CANCELLING';
        await processBatch('org', 'batch');
        expect(batch.status).toBe('CANCELLED');
        expect(m.createDraft).not.toHaveBeenCalled();
    });

    it('does not claim cancellation succeeded when cleanup failed', async () => {
        await processBatch('org', 'batch');
        batch.status = 'CANCELLING';
        m.cancel.mockRejectedValueOnce(new Error('publisher lock unavailable'));
        await expect(processBatch('org', 'batch')).rejects.toThrow(/could not be cancelled/);
        expect(batch.status).toBe('CANCELLING');
        expect(batch.error).toContain('could not be cancelled');
    });

    it('reports already-published posts honestly without an endless cancelling state', async () => {
        await processBatch('org', 'batch');
        posts.get('row-a')!.status = 'PUBLISHED';
        batch.status = 'CANCELLING';
        await processBatch('org', 'batch');
        expect(batch.status).toBe('CANCELLED');
        expect(batch.error).toContain('could not be recalled');
        expect(m.cancel).not.toHaveBeenCalled();
    });
});
