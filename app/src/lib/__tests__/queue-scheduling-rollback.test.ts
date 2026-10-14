/**
 * Tests for queue.ts scheduling compensation.
 *
 * Why: schedulePostLocked flips a post to SCHEDULED before the BullMQ job
 * exists. Without a rollback on enqueue failure the post is stranded in
 * SCHEDULED with nothing that will ever fire — it never publishes and sits on
 * the calendar forever as an overdue problem post. reschedulePost additionally
 * removes the old job first, so a failure there orphans the post outright.
 */

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    publishErrorFindFirst: vi.fn(),
    queueAdd: vi.fn(),
    queueGetJobs: vi.fn(),
    reminderQueueGetJobs: vi.fn(),
    acquirePublishLock: vi.fn(),
    releasePublishLock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    db: {
        post: {
            findUnique: mocks.findUnique,
            update: mocks.update,
            updateMany: mocks.updateMany,
        },
        publishError: { findFirst: mocks.publishErrorFindFirst },
    },
}));

vi.mock('@/lib/bullmq/queues', () => ({
    postPublishQueue: { add: mocks.queueAdd, getJobs: mocks.queueGetJobs },
    notificationReminderQueue: { getJobs: mocks.reminderQueueGetJobs },
}));

vi.mock('@/lib/publish-lock', () => ({
    acquirePublishLock: mocks.acquirePublishLock,
    releasePublishLock: mocks.releasePublishLock,
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { schedulePost, reschedulePost } from '@/lib/queue';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

function draftPost() {
    return {
        id: 'post-1',
        organizationId: 'org-1',
        status: 'DRAFT',
        scheduledAt: null,
        socialAccountId: 'account-1',
        platformPostId: null,
        autoPublish: true,
        caption: 'Post',
        platform: 'INSTAGRAM',
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.acquirePublishLock.mockResolvedValue('token-1');
    mocks.releasePublishLock.mockResolvedValue(undefined);
    mocks.publishErrorFindFirst.mockResolvedValue(null);
    mocks.queueGetJobs.mockResolvedValue([]);
    mocks.reminderQueueGetJobs.mockResolvedValue([]);
    mocks.update.mockResolvedValue({});
    mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe('schedulePost enqueue compensation', () => {
    it('restores the previous status and scheduledAt when the job cannot be enqueued', async () => {
        mocks.findUnique.mockResolvedValue(draftPost());
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));

        await expect(
            schedulePost('post-1', 'org-1', {
                datetime: FUTURE,
                timezone: 'UTC',
                platforms: [],
            }),
        ).rejects.toThrow('Redis unavailable');

        // First write flips to SCHEDULED, second restores the original DRAFT.
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenNthCalledWith(1, {
            where: { id: 'post-1' },
            data: { status: 'SCHEDULED', scheduledAt: FUTURE },
        });
        expect(mocks.updateMany).toHaveBeenCalledWith({
            where: { id: 'post-1', organizationId: 'org-1', status: 'SCHEDULED', scheduledAt: FUTURE, platformPostId: null },
            data: { status: 'DRAFT', scheduledAt: null },
        });
    });

    it('releases the publish lock when the rollback write also fails', async () => {
        mocks.findUnique.mockResolvedValue(draftPost());
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));
        // First write (to SCHEDULED) succeeds, the rollback write does not.
        mocks.updateMany.mockRejectedValueOnce(new Error('db down'));

        await expect(
            schedulePost('post-1', 'org-1', {
                datetime: FUTURE,
                timezone: 'UTC',
                platforms: [],
            }),
        ).rejects.toThrow('Redis unavailable');

        expect(mocks.releasePublishLock).toHaveBeenCalledWith('post-1', 'token-1');
    });

    it('does not roll back when the job is enqueued successfully', async () => {
        mocks.findUnique.mockResolvedValue(draftPost());
        mocks.queueAdd.mockResolvedValue({ id: 'job-1' });

        const result = await schedulePost('post-1', 'org-1', {
            datetime: FUTURE,
            timezone: 'UTC',
            platforms: [],
        });

        expect(result).toMatchObject({ success: true, jobId: 'job-1' });
        expect(mocks.update).toHaveBeenCalledTimes(1);
    });
});

describe('reschedulePost orphan compensation', () => {
    it('resets a stranded SCHEDULED post to DRAFT when the new job cannot be created', async () => {
        mocks.findUnique.mockResolvedValue({ ...draftPost(), status: 'SCHEDULED' });
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));

        await expect(reschedulePost('post-1', 'org-1', FUTURE)).rejects.toThrow('Redis unavailable');

        expect(mocks.updateMany).toHaveBeenCalledWith({
            where: { id: 'post-1', organizationId: 'org-1', status: { in: ['DRAFT', 'SCHEDULED', 'FAILED'] }, platformPostId: null },
            data: { status: 'DRAFT', scheduledAt: FUTURE },
        });
    });

    it('leaves a FAILED post untouched so its PublishError history survives', async () => {
        mocks.findUnique.mockResolvedValue({ ...draftPost(), status: 'FAILED' });
        mocks.publishErrorFindFirst.mockResolvedValue({ errorCode: 'PRE_DISPATCH_FAILED' });
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));

        await expect(reschedulePost('post-1', 'org-1', FUTURE)).rejects.toThrow();

        // A safe FAILED post remains FAILED if its new schedule cannot be queued.
        expect(mocks.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: 'FAILED', scheduledAt: FUTURE } }),
        );
    });

    it('acquires the lock before looking up or removing old jobs and holds it through rollback', async () => {
        mocks.findUnique.mockResolvedValue({ ...draftPost(), status: 'SCHEDULED' });
        const remove = vi.fn().mockResolvedValue(undefined);
        mocks.queueGetJobs.mockResolvedValue([{ data: { postId: 'post-1' }, remove }]);
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));

        await expect(reschedulePost('post-1', 'org-1', FUTURE)).rejects.toThrow('Redis unavailable');

        expect(mocks.acquirePublishLock).toHaveBeenCalledOnce();
        expect(mocks.acquirePublishLock.mock.invocationCallOrder[0]).toBeLessThan(mocks.queueGetJobs.mock.invocationCallOrder[0]);
        expect(remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.queueAdd.mock.invocationCallOrder[0]);
        expect(mocks.updateMany.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.releasePublishLock.mock.invocationCallOrder[0]);
    });

    it('does not mutate another request’s schedule when it cannot acquire the lock', async () => {
        mocks.acquirePublishLock.mockResolvedValue(null);
        await expect(reschedulePost('post-1', 'org-1', FUTURE)).rejects.toThrow(/lock is unavailable/);
        expect(mocks.queueGetJobs).not.toHaveBeenCalled();
        expect(mocks.findUnique).not.toHaveBeenCalled();
        expect(mocks.updateMany).not.toHaveBeenCalled();
        expect(mocks.releasePublishLock).not.toHaveBeenCalled();
    });

    it('leaves a successful overlapping request untouched while its enqueue is pending', async () => {
        mocks.findUnique.mockResolvedValue({ ...draftPost(), status: 'SCHEDULED' });
        mocks.acquirePublishLock.mockResolvedValueOnce('winner-token').mockResolvedValue(null);
        let finishEnqueue!: (job: { id: string }) => void;
        let signalEnqueue!: () => void;
        const enqueueStarted = new Promise<void>(resolve => { signalEnqueue = resolve; });
        mocks.queueAdd.mockImplementation(() => {
            signalEnqueue();
            return new Promise<{ id: string }>(resolve => { finishEnqueue = resolve; });
        });

        const winner = reschedulePost('post-1', 'org-1', FUTURE);
        await enqueueStarted;
        await expect(reschedulePost('post-1', 'org-1', new Date(FUTURE.getTime() + 60_000)))
            .rejects.toThrow(/lock is unavailable/);
        expect(mocks.updateMany).not.toHaveBeenCalled();
        expect(mocks.queueGetJobs).toHaveBeenCalledOnce();
        finishEnqueue({ id: 'winner-job' });
        await expect(winner).resolves.toMatchObject({ success: true, jobId: 'winner-job', scheduledAt: FUTURE });
        expect(mocks.updateMany).not.toHaveBeenCalled();
        expect(mocks.releasePublishLock).toHaveBeenCalledExactlyOnceWith('post-1', 'winner-token');
    });

    it('does not remove old publish jobs if reminder lookup fails', async () => {
        const oldTime = new Date(FUTURE.getTime() + 60_000);
        mocks.findUnique.mockResolvedValue({ ...draftPost(), status: 'SCHEDULED', scheduledAt: oldTime });
        const remove = vi.fn();
        mocks.queueGetJobs.mockResolvedValue([{ data: { postId: 'post-1' }, remove }]);
        mocks.reminderQueueGetJobs.mockRejectedValue(new Error('Reminder lookup unavailable'));
        await expect(reschedulePost('post-1', 'org-1', FUTURE)).rejects.toThrow('Reminder lookup unavailable');
        expect(remove).not.toHaveBeenCalled();
        expect(mocks.queueAdd).not.toHaveBeenCalled();
        expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: 'SCHEDULED', scheduledAt: oldTime, autoPublish: true },
        }));
    });

    it('compensates when reminder removal fails after old publish jobs are gone', async () => {
        mocks.findUnique.mockResolvedValue({ ...draftPost(), status: 'SCHEDULED' });
        const remove = vi.fn().mockResolvedValue(undefined);
        mocks.queueGetJobs.mockResolvedValue([{ data: { postId: 'post-1' }, remove }]);
        mocks.reminderQueueGetJobs.mockResolvedValue([{
            data: { postId: 'post-1' }, remove: vi.fn().mockRejectedValue(new Error('Reminder removal failed')),
        }]);
        await expect(reschedulePost('post-1', 'org-1', FUTURE)).rejects.toThrow('Reminder removal failed');
        expect(remove).toHaveBeenCalledOnce();
        expect(mocks.queueAdd).not.toHaveBeenCalled();
        expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: 'DRAFT', scheduledAt: FUTURE },
        }));
        expect(mocks.releasePublishLock).toHaveBeenCalledWith('post-1', 'token-1');
    });

    it('does not remove the existing job for an invalid date', async () => {
        mocks.findUnique.mockResolvedValue({ ...draftPost(), status: 'SCHEDULED' });
        await expect(reschedulePost('post-1', 'org-1', new Date('invalid'))).rejects.toThrow(/invalid time/);
        expect(mocks.queueGetJobs).not.toHaveBeenCalled();
        expect(mocks.queueAdd).not.toHaveBeenCalled();
    });

    it('persists the requested time when it falls just inside the clock-skew grace period', async () => {
        mocks.findUnique.mockResolvedValue({ ...draftPost(), status: 'SCHEDULED' });
        mocks.queueAdd.mockResolvedValue({ id: 'job-1' });
        const justPassed = new Date(Date.now() - 1_000);
        await expect(reschedulePost('post-1', 'org-1', justPassed)).resolves.toMatchObject({ scheduledAt: justPassed });
        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: 'post-1' }, data: { status: 'SCHEDULED', scheduledAt: justPassed },
        });
        expect(mocks.queueAdd).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            scheduledAt: justPassed.toISOString(),
        }), expect.objectContaining({ delay: 0 }));
    });
});
