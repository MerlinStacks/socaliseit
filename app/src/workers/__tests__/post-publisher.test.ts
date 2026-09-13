import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { PostPublishJobData } from '@/lib/bullmq/queues';

const mocks = vi.hoisted(() => ({
    post: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    publishError: { findFirst: vi.fn(), create: vi.fn() },
    activity: { create: vi.fn() },
    publish: vi.fn(), acquire: vi.fn(), extend: vi.fn(), release: vi.fn(),
    notify: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: mocks }));
vi.mock('@/lib/logger', () => ({ createJobLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/bullmq/connection', () => ({ getBullMQConnection: vi.fn() }));
vi.mock('@/lib/bullmq/queues', () => ({ postPublishQueue: { add: vi.fn() } }));
vi.mock('@/lib/publish-lock', () => ({ acquirePublishLock: mocks.acquire, extendPublishLock: mocks.extend, releasePublishLock: mocks.release }));
vi.mock('@/lib/push-notifications', () => ({ sendPostFailedNotification: mocks.notify, sendPostPublishedNotification: mocks.notify }));
vi.mock('@/lib/resilience/dead-letter', () => ({ moveToDeadLetter: vi.fn() }));
vi.mock('../publish-helpers', () => ({ buildPublishPayload: vi.fn(() => ({})), publishSinglePlatform: mocks.publish }));
import { processPostPublish } from '../post-publisher';

let row: Record<string, unknown>;
const job = (attemptsMade = 0, isRetry = false) => ({
    id: 'job', data: { postId: 'post', organizationId: 'org', platformIds: ['account'], isRetry },
    attemptsMade, opts: { attempts: 3 },
}) as Job<PostPublishJobData>;

beforeEach(() => {
    vi.resetAllMocks();
    row = { id: 'post', organizationId: 'org', status: 'SCHEDULED', platformPostId: null,
        platform: 'FACEBOOK', caption: 'Hello', media: [], socialAccount: { id: 'account', isActive: true } };
    mocks.post.findUnique.mockImplementation(async () => ({ ...row }));
    mocks.post.update.mockImplementation(async ({ data }) => Object.assign(row, data));
    mocks.post.updateMany.mockImplementation(async ({ where, data }) => {
        if (where.status !== row.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
    });
    mocks.publishError.findFirst.mockResolvedValue(null);
    mocks.acquire.mockResolvedValue('token');
    mocks.extend.mockResolvedValue(true);
    mocks.release.mockResolvedValue(undefined);
    mocks.activity.create.mockResolvedValue({});
    mocks.notify.mockResolvedValue(undefined);
});

describe('publisher recovery invariants', () => {
    it('runs a BullMQ retry from a known safe FAILED state without the manual retry flag', async () => {
        row.status = 'FAILED';
        mocks.publishError.findFirst.mockResolvedValue({ errorCode: 'PRE_DISPATCH_FAILED' });
        mocks.publish.mockResolvedValue({ platform: 'FACEBOOK', success: true, postId: 'remote-id' });
        await processPostPublish(job(1));
        expect(row.status).toBe('PUBLISHED');
    });
    it('blocks old retry jobs for legacy failures with uncertain outcomes', async () => {
        row.status = 'FAILED';
        mocks.publishError.findFirst.mockResolvedValue({ errorCode: 'PUBLISH_FAILED' });
        await processPostPublish(job(1, true));
        expect(mocks.publish).not.toHaveBeenCalled();
    });
    it('keeps confirmed success when activity recording fails', async () => {
        mocks.publish.mockResolvedValue({ platform: 'FACEBOOK', success: true, postId: 'remote-id' });
        mocks.activity.create.mockRejectedValue(new Error('activity unavailable'));
        await processPostPublish(job());
        expect(row).toMatchObject({ status: 'PUBLISHED', platformPostId: 'remote-id' });
        expect(mocks.release).toHaveBeenCalledWith('post', 'token');
    });

    it('rethrows circuit-open results, retries without isRetry, then exhausts to FAILED', async () => {
        mocks.publish.mockResolvedValue({ platform: 'FACEBOOK', success: false, retrySafe: true, error: 'Circuit open' });
        for (let attempt = 0; attempt < 3; attempt++) {
            await expect(processPostPublish(job(attempt))).rejects.toThrow('Circuit open');
            expect(row.status).toBe(attempt < 2 ? 'SCHEDULED' : 'FAILED');
        }
        expect(mocks.publish).toHaveBeenCalledTimes(3);
    });

    it.each(['ig_pending:container', undefined])('does not republish ambiguous outcome %s even with a legacy retry flag', async pendingId => {
        mocks.publish.mockResolvedValue({ platform: 'FACEBOOK', success: false, outcomeUnknown: true, postId: pendingId });
        await processPostPublish(job());
        expect(row.status).toBe('PUBLISHING');
        await processPostPublish(job(1, true));
        expect(mocks.publish).toHaveBeenCalledTimes(1);
    });

    it('keeps unresolved state after remote success cannot be saved', async () => {
        mocks.publish.mockResolvedValue({ platform: 'FACEBOOK', success: true, postId: 'remote-id' });
        mocks.post.update.mockRejectedValue(new Error('database unavailable'));
        await expect(processPostPublish(job())).rejects.toThrow('database unavailable');
        expect(row.status).toBe('PUBLISHING');
        await processPostPublish(job(1, true));
        expect(mocks.publish).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch after lock renewal fails', async () => {
        mocks.extend.mockResolvedValue(false);
        await expect(processPostPublish(job())).rejects.toThrow('lock could not be renewed');
        expect(mocks.publish).not.toHaveBeenCalled();
    });
});
