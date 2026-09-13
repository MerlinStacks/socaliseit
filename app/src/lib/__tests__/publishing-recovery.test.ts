import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    post: { findUnique: vi.fn(), updateMany: vi.fn() },
    publishError: { findFirst: vi.fn() },
    add: vi.fn(), lock: vi.fn(), release: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: mocks }));
vi.mock('@/lib/bullmq/queues', () => ({ postPublishQueue: { add: mocks.add }, notificationReminderQueue: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/publish-lock', () => ({ acquirePublishLock: mocks.lock, releasePublishLock: mocks.release }));
import { publishNow, retryFailedPost } from '../queue';
import { getPublishingStatus } from '../publishing-status';

beforeEach(() => {
    vi.resetAllMocks();
    mocks.lock.mockResolvedValue('token');
    mocks.post.findUnique.mockResolvedValue({ id: 'post', status: 'FAILED', platformPostId: null, socialAccountId: 'account' });
    mocks.publishError.findFirst.mockResolvedValue({ errorCode: 'VIDEO_TRANSCODE_MISSING' });
    mocks.post.updateMany.mockResolvedValue({ count: 1 });
    mocks.add.mockResolvedValue({ id: 'job' });
});

describe('publishing recovery', () => {
    it.each(['PUBLISHING', 'PUBLISHED'])('publish-now cannot override %s', async status => {
        mocks.post.findUnique.mockResolvedValue({ status, platformPostId: null });
        await expect(publishNow('post', 'org')).rejects.toThrow();
        expect(mocks.add).not.toHaveBeenCalled();
        expect(mocks.post.updateMany).not.toHaveBeenCalled();
    });
    it.each(['ig_pending:123', 'remote-id'])('blocks recovery of possible success %s', async platformPostId => {
        mocks.post.findUnique.mockResolvedValue({ status: 'FAILED', platformPostId });
        await expect(retryFailedPost('post', 'org')).rejects.toThrow();
        expect(mocks.add).not.toHaveBeenCalled();
    });
    it('blocks legacy failures without proof that nothing was sent', async () => {
        mocks.publishError.findFirst.mockResolvedValue({ errorCode: 'PUBLISH_FAILED' });
        await expect(retryFailedPost('post', 'org')).rejects.toThrow('cannot confirm');
        expect(mocks.add).not.toHaveBeenCalled();
    });
    it('queues a known pre-dispatch failure with compatible job data and tenant scope', async () => {
        await retryFailedPost('post', 'org');
        expect(mocks.post.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'post', organizationId: 'org' } }));
        expect(mocks.add).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ postId: 'post', organizationId: 'org', isRetry: true, platformIds: ['account'] }), expect.any(Object));
    });
    it('restores recoverable status if enqueue fails', async () => {
        mocks.add.mockRejectedValue(new Error('Redis unavailable'));
        await expect(retryFailedPost('post', 'org')).rejects.toThrow('Redis unavailable');
        expect(mocks.post.updateMany).toHaveBeenLastCalledWith({ where: { id: 'post', organizationId: 'org', status: 'SCHEDULED' }, data: { status: 'FAILED' } });
    });
    it('does not mutate a post while its publishing lock is held', async () => {
        mocks.lock.mockResolvedValue(null);
        await expect(retryFailedPost('post', 'org')).rejects.toThrow('Publishing is active');
        expect(mocks.post.findUnique).not.toHaveBeenCalled();
        expect(mocks.release).not.toHaveBeenCalled();
    });
    it('does not enqueue if the database claim loses a status race', async () => {
        mocks.post.updateMany.mockResolvedValue({ count: 0 });
        await expect(retryFailedPost('post', 'org')).rejects.toThrow('Post status changed');
        expect(mocks.add).not.toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalledWith('post', 'token');
    });
    it('shows pending confirmation instead of legacy published for pending IDs', () => {
        expect(getPublishingStatus({ status: 'PUBLISHED', platformPostId: 'tiktok_pending:123' })).toMatchObject({ label: 'Awaiting platform confirmation', canRetry: false });
        expect(getPublishingStatus({ status: 'FAILED' }, 'CIRCUIT_OPEN').canRetry).toBe(true);
        expect(getPublishingStatus({ status: 'FAILED' }, 'STALE_PUBLISHING').canRetry).toBe(false);
    });
});
