import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recoverScheduledPublishes } from '../scheduled-publish-recovery';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), latestError: vi.fn(), jobs: vi.fn(), add: vi.fn(), lock: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { post: { findMany: mocks.findMany, findFirst: mocks.findFirst }, publishError: { findFirst: mocks.latestError } } }));
vi.mock('@/lib/bullmq/queues', () => ({ postPublishQueue: { getJobs: mocks.jobs, add: mocks.add } }));
vi.mock('@/lib/publish-lock', () => ({ acquirePublishLock: mocks.lock, releasePublishLock: mocks.release }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

describe('scheduled publish recovery', () => {
    let post: { id: string; organizationId: string; socialAccountId: string; scheduledAt: Date; updatedAt: Date };

    beforeEach(() => {
        vi.resetAllMocks();
        post = { id: 'post', organizationId: 'org', socialAccountId: 'account', scheduledAt: new Date(Date.now() + 30_000), updatedAt: new Date() };
        mocks.findMany.mockResolvedValue([post]);
        mocks.findFirst.mockResolvedValue(post);
        mocks.jobs.mockResolvedValue([]);
        mocks.lock.mockResolvedValue('lock');
    });

    it('restores a missing job from the DB snapshot with a stable job ID', async () => {
        await recoverScheduledPublishes();
        expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
            id: post.id, autoPublish: true, status: 'SCHEDULED', scheduledAt: post.scheduledAt, updatedAt: post.updatedAt,
        }) }));
        expect(mocks.add).toHaveBeenCalledExactlyOnceWith('publish-post', {
            postId: 'post', organizationId: 'org', platformIds: ['account'], scheduledAt: post.scheduledAt.toISOString(),
            recoverBefore: new Date(post.scheduledAt.getTime() + 30 * 60_000).toISOString(),
        }, expect.objectContaining({ jobId: `post-recovery-post-${post.scheduledAt.getTime()}-${post.updatedAt.getTime()}`, delay: expect.any(Number) }));
        expect(mocks.release).toHaveBeenCalledWith('post', 'lock');
    });

    it('does not duplicate a job that appeared while the edit still held the lock', async () => {
        mocks.jobs.mockResolvedValueOnce([]).mockResolvedValueOnce([{ data: {
            postId: 'post', organizationId: 'org', scheduledAt: post.scheduledAt.toISOString(),
        } }]);
        await recoverScheduledPublishes();
        expect(mocks.add).not.toHaveBeenCalled();
    });

    it('does not enqueue a post that changed before the recovery lock was acquired', async () => {
        mocks.findFirst.mockResolvedValue(null);
        await recoverScheduledPublishes();
        expect(mocks.add).not.toHaveBeenCalled();
    });

    it('does not retry an uncertain outcome or publish content missed during a long outage', async () => {
        mocks.latestError.mockResolvedValueOnce({ errorCode: 'STALE_PUBLISHING' });
        await recoverScheduledPublishes();
        post.scheduledAt = new Date(Date.now() - 31 * 60_000);
        await recoverScheduledPublishes();
        expect(mocks.add).not.toHaveBeenCalled();
    });
});
