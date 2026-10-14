// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real queue functions as well as the handler: mocking reschedulePost
// hid the disagreement between the API response and the persisted scheduledAt.
const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), transaction: vi.fn(), activity: vi.fn(),
    queueAdd: vi.fn(), queueGetJobs: vi.fn(), reminderAdd: vi.fn(), reminderGetJobs: vi.fn(),
    acquire: vi.fn(), release: vi.fn(), findError: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {
    post: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany },
    publishError: { findFirst: mocks.findError }, activity: { create: mocks.activity }, $transaction: mocks.transaction,
} }));
vi.mock('@/lib/bullmq/queues', () => ({
    postPublishQueue: { add: mocks.queueAdd, getJobs: mocks.queueGetJobs },
    notificationReminderQueue: { add: mocks.reminderAdd, getJobs: mocks.reminderGetJobs },
}));
vi.mock('@/lib/publish-lock', () => ({ acquirePublishLock: mocks.acquire, releasePublishLock: mocks.release }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/cache', () => ({ invalidatePostCaches: vi.fn() }));
vi.mock('@/lib/services/platform-analytics-sync', () => ({ syncSinglePostAnalytics: vi.fn() }));
vi.mock('@/lib/schedule-conflicts', () => ({
    findDuplicatePlatforms: vi.fn(() => []), findScheduleConflict: vi.fn(), formatScheduleConflictError: vi.fn(),
}));

import { handleUpdatePost } from '@/app/api/posts/[id]/post-handlers';

const ctx = { id: 'post-1', organizationId: 'org-1', userId: 'user-1', userName: 'Test' };
const future = new Date(Date.now() + 3_600_000);
const oldTime = new Date(Date.now() + 7_200_000);
const body = { caption: 'Edited post', scheduledAt: future.toISOString(), autoPublish: true };
let row: ReturnType<typeof scheduledPost>;

function scheduledPost() {
    return {
        ...ctx, caption: 'Existing post', status: 'SCHEDULED', scheduledAt: oldTime as Date | null,
        autoPublish: true, socialAccountId: 'account-1', platform: 'INSTAGRAM', platformPostId: null,
        postType: 'FEED', customMediaIds: [], updatedAt: new Date(),
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    row = scheduledPost();
    mocks.findUnique.mockImplementation(async () => ({ ...row }));
    mocks.update.mockImplementation(async ({ data }) => {
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
    });
    mocks.updateMany.mockImplementation(async ({ where, data }) => {
        const statuses = typeof where.status === 'string' ? [where.status] : where.status?.in;
        if (statuses && !statuses.includes(row.status)) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date() });
        return { count: 1 };
    });
    mocks.transaction.mockImplementation(async callback => callback({ post: { update: mocks.update } }));
    mocks.activity.mockResolvedValue({});
    mocks.acquire.mockResolvedValue('token-1');
    mocks.release.mockResolvedValue(undefined);
    mocks.findError.mockResolvedValue(null);
    mocks.queueGetJobs.mockResolvedValue([]);
    mocks.reminderGetJobs.mockResolvedValue([]);
    mocks.queueAdd.mockResolvedValue({ id: 'job-1' });
    mocks.reminderAdd.mockResolvedValue({ id: 'reminder-1' });
});

describe('PUT scheduling compensation with the real queue implementation', () => {
    it('reports enqueue failure, persists content, and retains the chosen time in the database', async () => {
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));
        const response = await handleUpdatePost(ctx, body);
        const payload = await response.json();
        expect(response.status).toBe(503);
        expect(row).toMatchObject({ caption: 'Edited post', status: 'DRAFT', scheduledAt: future });
        expect(payload).toMatchObject({ status: 'draft', scheduledAt: row.scheduledAt?.toISOString() });
        expect(payload.error).toMatch(/could not be scheduled/i);
        expect(mocks.acquire).toHaveBeenCalledTimes(1);
        expect(mocks.release).toHaveBeenCalledWith(ctx.id, 'token-1');
    });

    it('does not change content, jobs, or scheduling state when the lock is unavailable', async () => {
        mocks.acquire.mockResolvedValue(null);
        const response = await handleUpdatePost(ctx, body);
        expect(response.status).toBe(409);
        expect(row).toMatchObject({ caption: 'Existing post', status: 'SCHEDULED', scheduledAt: oldTime });
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.queueGetJobs).not.toHaveBeenCalled();
        expect(mocks.updateMany).not.toHaveBeenCalled();
        expect(mocks.release).not.toHaveBeenCalled();
    });

    it('preserves the old schedule when reminder lookup fails before old-job removal', async () => {
        const remove = vi.fn();
        mocks.queueGetJobs.mockResolvedValue([{ data: { postId: ctx.id }, remove }]);
        mocks.reminderGetJobs.mockRejectedValue(new Error('Reminder lookup unavailable'));
        const response = await handleUpdatePost(ctx, body);
        const payload = await response.json();
        expect(response.status).toBe(503);
        expect(remove).not.toHaveBeenCalled();
        expect(row).toMatchObject({ caption: 'Edited post', status: 'SCHEDULED', scheduledAt: oldTime });
        expect(payload).toMatchObject({ status: 'scheduled', scheduledAt: oldTime.toISOString() });
        expect(payload.error).not.toMatch(/moved back to Draft/);
    });

    it('does not label a post Draft when old publish-job removal fails', async () => {
        const remove = vi.fn().mockRejectedValue(new Error('Job is active'));
        mocks.queueGetJobs.mockResolvedValue([{ data: { postId: ctx.id }, remove }]);
        const response = await handleUpdatePost(ctx, body);
        expect(response.status).toBe(503);
        expect(row).toMatchObject({ status: 'SCHEDULED', scheduledAt: oldTime });
        expect(mocks.queueAdd).not.toHaveBeenCalled();
        expect((await response.json()).status).toBe('scheduled');
    });

    it('restores autoPublish as well as the old time if disabling it cannot remove the existing job', async () => {
        mocks.queueGetJobs.mockResolvedValue([{
            data: { postId: ctx.id }, remove: vi.fn().mockRejectedValue(new Error('Job removal failed')),
        }]);
        const response = await handleUpdatePost(ctx, { ...body, autoPublish: false });
        expect(response.status).toBe(503);
        expect(row).toMatchObject({ autoPublish: true, status: 'SCHEDULED', scheduledAt: oldTime });
        expect(mocks.reminderAdd).not.toHaveBeenCalled();
    });

    it('rejects invalid dates before committing content', async () => {
        const response = await handleUpdatePost(ctx, { ...body, scheduledAt: 'invalid' });
        expect(response.status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.queueGetJobs).not.toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalledWith(ctx.id, 'token-1');
    });

    it('reports the actual row if the compensation write fails', async () => {
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));
        mocks.updateMany.mockRejectedValue(new Error('Database unavailable'));
        const response = await handleUpdatePost(ctx, body);
        const payload = await response.json();
        expect(response.status).toBe(503);
        expect(row.status).toBe('SCHEDULED');
        expect(payload.status).toBe('scheduled');
        expect(payload.error).not.toMatch(/moved back to Draft/);
        expect(mocks.release).toHaveBeenCalledWith(ctx.id, 'token-1');
    });

    it('does not erase FAILED status or its error history on enqueue failure', async () => {
        row.status = 'FAILED';
        mocks.findError.mockResolvedValue({ errorCode: 'PRE_DISPATCH_FAILED' });
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));
        const response = await handleUpdatePost(ctx, body);
        expect(response.status).toBe(503);
        expect(row.status).toBe('FAILED');
        expect((await response.json()).status).toBe('failed');
    });

    it('still automatically schedules when autoPublish is omitted from an existing auto-publish post', async () => {
        const response = await handleUpdatePost(ctx, { caption: body.caption, scheduledAt: body.scheduledAt });
        expect(response.status).toBe(200);
        expect(mocks.queueAdd).toHaveBeenCalledOnce();
        expect(mocks.reminderAdd).not.toHaveBeenCalled();
    });

    it('replaces an auto-publish job with a reminder when autoPublish is disabled', async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        mocks.queueGetJobs.mockResolvedValue([{ data: { postId: ctx.id }, remove }]);
        const response = await handleUpdatePost(ctx, { ...body, autoPublish: false });
        expect(response.status).toBe(200);
        expect(remove).toHaveBeenCalledOnce();
        expect(mocks.reminderAdd).toHaveBeenCalledOnce();
        expect(mocks.queueAdd).not.toHaveBeenCalled();
        expect(row.autoPublish).toBe(false);
    });

    it('returns 200 without compensation when scheduling succeeds', async () => {
        const response = await handleUpdatePost(ctx, body);
        expect(response.status).toBe(200);
        expect(row).toMatchObject({ status: 'SCHEDULED', scheduledAt: future });
        expect(mocks.updateMany).not.toHaveBeenCalled();
    });

    it('retains the requested time when reminder enqueue fails after removing the publish job', async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        mocks.queueGetJobs.mockResolvedValue([{ data: { postId: ctx.id }, remove }]);
        mocks.reminderAdd.mockRejectedValue(new Error('Reminder enqueue failed'));
        const response = await handleUpdatePost(ctx, { ...body, autoPublish: false });
        expect(response.status).toBe(503);
        expect(remove).toHaveBeenCalledOnce();
        expect(row).toMatchObject({ status: 'DRAFT', scheduledAt: future, autoPublish: false });
        expect((await response.json()).scheduledAt).toBe(future.toISOString());
    });

    it('compensates an immediate-publish enqueue failure without acquiring the lock twice', async () => {
        mocks.queueAdd.mockRejectedValue(new Error('Redis unavailable'));
        const response = await handleUpdatePost(ctx, { ...body, scheduledAt: '' });
        expect(response.status).toBe(503);
        expect(row).toMatchObject({ caption: body.caption, status: 'DRAFT', scheduledAt: null });
        expect(mocks.acquire).toHaveBeenCalledOnce();
        expect((await response.json()).status).toBe('draft');
    });
});
