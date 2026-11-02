// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    queueItemFindFirst: vi.fn(),
    queueItemFindMany: vi.fn(),
    queueItemUpdate: vi.fn(),
    queueFindFirst: vi.fn(),
    queueDelete: vi.fn(),
    postFindMany: vi.fn(),
    accountFindFirst: vi.fn(),
    schedulePost: vi.fn(),
    reschedulePost: vi.fn(),
    cancelScheduledPost: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    db: {
        publishingQueueItem: { findFirst: mocks.queueItemFindFirst, findMany: mocks.queueItemFindMany, update: mocks.queueItemUpdate },
        publishingQueue: { findFirst: mocks.queueFindFirst, delete: mocks.queueDelete },
        post: { findMany: mocks.postFindMany },
        socialAccount: { findFirst: mocks.accountFindFirst },
    },
}));
vi.mock('@/lib/logger', () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock('@/lib/cache', () => ({ invalidatePostCaches: vi.fn() }));
vi.mock('../lock', () => ({ withQueueLock: async (_key: string, operation: (assertOwned: () => void) => Promise<unknown>) => operation(() => {}) }));
vi.mock('@/lib/queue', () => ({
    schedulePost: mocks.schedulePost,
    reschedulePost: mocks.reschedulePost,
    cancelScheduledPost: mocks.cancelScheduledPost,
}));

import { QueueError, deleteQueue, resolveQueueForLabel, saveQueue, scheduleQueueItem } from '../service';

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const NOW = new Date('2026-03-02T00:00:00Z'); // Monday

function queueRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'queue-1',
        socialAccountId: 'acct-1',
        timezone: 'UTC',
        enabled: true,
        label: '',
        ...overrides,
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.queueFindFirst.mockResolvedValue(queueRow({ slots: [{ id: 'slot-1', daysOfWeek: EVERY_DAY, time: '09:00', enabled: true }] }));
    mocks.queueItemFindMany.mockResolvedValue([]);
    mocks.postFindMany.mockResolvedValue([]);
    mocks.schedulePost.mockResolvedValue({ success: true });
    mocks.reschedulePost.mockResolvedValue({ success: true });
    mocks.queueItemUpdate.mockResolvedValue({});
});

describe('resolveQueueForLabel', () => {
    it('uses the labelled queue when the profile has one', async () => {
        mocks.queueFindFirst
            .mockResolvedValueOnce(queueRow({ id: 'queue-weekends', label: 'weekends' }))
            .mockResolvedValueOnce(null);
        const queue = await resolveQueueForLabel('org', 'acct-1', 'weekends');
        expect(queue.id).toBe('queue-weekends');
    });

    it('falls back to the default queue when the label is missing on that profile', async () => {
        mocks.queueFindFirst
            .mockResolvedValueOnce(null) // no "weekends" here
            .mockResolvedValueOnce(queueRow({ id: 'queue-default', label: '' }));
        const queue = await resolveQueueForLabel('org', 'acct-1', 'weekends');
        expect(queue.id).toBe('queue-default');
    });

    it('explains itself when there is no queue at all', async () => {
        mocks.queueFindFirst.mockResolvedValue(null);
        await expect(resolveQueueForLabel('org', 'acct-1', null)).rejects.toThrow(/no publishing queue/);
    });
});

describe('saveQueue', () => {
    it('rejects a template with no slots', async () => {
        await expect(saveQueue({ organizationId: 'org', socialAccountId: 'acct-1', slots: [] }))
            .rejects.toThrow(/at least one time slot/);
    });

    it('rejects malformed slot times before touching the database', async () => {
        await expect(saveQueue({
            organizationId: 'org', socialAccountId: 'acct-1',
            slots: [{ daysOfWeek: [1], time: '24:00' }],
        })).rejects.toThrow(/HH:mm/);
    });
});

describe('deleteQueue', () => {
    it('removes the template and reports the posts left scheduled', async () => {
        mocks.queueFindFirst.mockResolvedValue({ id: 'queue-1', items: [{ id: 'i1', postId: 'p1' }, { id: 'i2', postId: null }] });
        const result = await deleteQueue('org', 'queue-1');
        expect(result).toEqual({ deleted: true, leftScheduled: 1 });
        expect(mocks.queueDelete).toHaveBeenCalledWith({ where: { id: 'queue-1' } });
        // The whole point: no post is cancelled as a side effect of deleting a template.
        expect(mocks.cancelScheduledPost).not.toHaveBeenCalled();
    });
});

describe('scheduleQueueItem', () => {
    function queuedItem(itemOverrides: Record<string, unknown> = {}) {
        mocks.queueItemFindFirst.mockResolvedValue({
            id: 'item-1',
            postId: 'post-1',
            mode: 'AVAILABLE',
            queue: {
                id: 'queue-1',
                socialAccountId: 'acct-1',
                socialAccount: { platform: 'INSTAGRAM' },
                timezone: 'UTC',
                enabled: true,
                slots: [{ id: 'slot-1', daysOfWeek: EVERY_DAY, time: '09:00', enabled: true }],
            },
            post: { id: 'post-1', status: 'DRAFT', platform: 'INSTAGRAM' },
            ...itemOverrides,
        });
    }

    it('schedules at the first open occurrence', async () => {
        queuedItem();
        const result = await scheduleQueueItem('org', 'item-1', { now: NOW });
        expect(mocks.reschedulePost).toHaveBeenCalledWith('post-1', 'org', new Date('2026-03-02T09:00:00Z'), { autoPublish: true });
        expect(mocks.schedulePost).not.toHaveBeenCalled();
        expect(result.displaced).toBe(0);
    });

    it('moves its own later items but never a hand-scheduled post', async () => {
        // 09:00 today is held by this queue's own item; 18:00 is a manual post.
        mocks.queueItemFindMany.mockResolvedValue([
            { id: 'item-other', post: { status: 'SCHEDULED', scheduledAt: new Date('2026-03-02T09:00:00Z') } },
        ]);
        mocks.postFindMany.mockResolvedValue([{ id: 'manual-post', scheduledAt: new Date('2026-03-02T18:00:00Z') }]);
        // Dispatch by id: the item being scheduled, then the displacement lookup.
        const scheduledLookup = {
            id: 'item-1', postId: 'post-1', mode: 'NEXT',
            queue: { id: 'queue-1', socialAccountId: 'acct-1', timezone: 'UTC', enabled: true, slots: [{ id: 'slot-1', daysOfWeek: EVERY_DAY, time: '09:00', enabled: true }] },
            post: { id: 'post-1', status: 'DRAFT', platform: 'INSTAGRAM' },
        };
        mocks.queueItemFindFirst.mockImplementation(async (args: { where: { id: string } }) =>
            (args.where.id === 'item-other' ? { id: 'item-other', postId: 'post-other' } : scheduledLookup));

        const result = await scheduleQueueItem('org', 'item-1', { now: NOW });

        // The new post takes 09:00 and the queue's own item is pushed to the next
        // open occurrence, skipping the manually scheduled 18:00 post.
        expect(mocks.reschedulePost).toHaveBeenCalledWith('post-other', 'org', new Date('2026-03-03T09:00:00Z'), { autoPublish: 'preserve', expectedScheduledAt: new Date('2026-03-02T09:00:00Z') });
        expect(result.displaced).toBe(1);
        expect(mocks.reschedulePost).toHaveBeenCalledWith('post-1', 'org', new Date('2026-03-02T09:00:00Z'), { autoPublish: true });
    });

    it('refuses to place an item whose post already published', async () => {
        queuedItem({ post: { id: 'post-1', status: 'PUBLISHED', platform: 'INSTAGRAM' } });
        await expect(scheduleQueueItem('org', 'item-1', { now: NOW })).rejects.toThrow(/already been published/);
        expect(mocks.schedulePost).not.toHaveBeenCalled();
    });

    it('surfaces a full queue as a queue error, not a crash', async () => {
        queuedItem();
        // Every daily 09:00 occurrence inside and beyond the widened horizon is taken.
        mocks.queueItemFindMany.mockImplementation(async () => {
            const taken = [];
            for (let day = 0; day < 200; day++) {
                taken.push({ id: `x${day}`, post: { status: 'SCHEDULED', scheduledAt: new Date(NOW.getTime() + day * 864e5 + 9 * 3600e3) } });
            }
            return taken;
        });
        await expect(scheduleQueueItem('org', 'item-1', { now: NOW })).rejects.toThrow(QueueError);
    });

    it('does not resurrect manually cancelled posts from historical queue timing', async () => {
        queuedItem({ mode: 'NEXT' });
        mocks.queueItemFindMany.mockResolvedValue([{ id: 'cancelled', scheduledAt: new Date('2026-03-02T09:00:00Z'), post: { status: 'DRAFT', scheduledAt: null } }]);
        await scheduleQueueItem('org', 'item-1', { now: NOW });
        expect(mocks.reschedulePost).toHaveBeenCalledTimes(1);
        expect(mocks.reschedulePost.mock.calls[0][0]).toBe('post-1');
    });

    it('reads other-label occupancy over the entire expanded search horizon', async () => {
        queuedItem();
        mocks.postFindMany.mockResolvedValue([{ id: 'labelled', scheduledAt: new Date('2026-03-02T09:00:00Z') }]);
        await scheduleQueueItem('org', 'item-1', { now: NOW });
        const where = mocks.postFindMany.mock.calls[0][0].where;
        expect(where).not.toHaveProperty('queueItem');
        expect(where.OR).toContainEqual({ queueItem: { queueId: { not: 'queue-1' } } });
        expect(where.scheduledAt.lte.getTime() - NOW.getTime()).toBe(180 * 864e5);
        expect(mocks.reschedulePost).toHaveBeenCalledWith('post-1', 'org', new Date('2026-03-03T09:00:00Z'), { autoPublish: true });
    });

    it('moves cascades from the tail first', async () => {
        queuedItem({ mode: 'NEXT' });
        mocks.queueItemFindMany.mockResolvedValue([0, 1].map(day => ({ id: `existing-${day}`, post: { status: 'SCHEDULED', scheduledAt: new Date(NOW.getTime() + day * 864e5 + 9 * 3600e3) } })));
        const original = mocks.queueItemFindFirst.getMockImplementation()!;
        mocks.queueItemFindFirst.mockImplementation(async args => args.where.id.startsWith('existing-') ? { id: args.where.id, postId: args.where.id } : original(args));
        await scheduleQueueItem('org', 'item-1', { now: NOW });
        expect(mocks.reschedulePost.mock.calls.map(call => call[0])).toEqual(['existing-1', 'existing-0', 'post-1']);
    });
});
