// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { PostsSyncJobData } from '@/lib/bullmq/queues';
import type { WorkspaceSyncSummary } from '@/lib/services/posts-sync-service';

const mocks = vi.hoisted(() => ({
    worker: vi.fn(),
    on: vi.fn(),
    sync: vi.fn(),
    enqueue: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('bullmq', () => ({
    Worker: class {
        constructor(...args: unknown[]) { mocks.worker(...args); }
        on = mocks.on;
    },
}));
vi.mock('@/lib/bullmq/connection', () => ({ getBullMQConnection: vi.fn() }));
vi.mock('@/lib/bullmq/queues', () => ({ enqueueSebPillarInitialization: mocks.enqueue }));
vi.mock('@/lib/services/posts-sync-service', () => ({ syncWorkspacePosts: mocks.sync }));
vi.mock('@/lib/logger', () => ({ createJobLogger: () => ({ info: mocks.info, warn: mocks.warn, error: mocks.error }) }));

import { createPostsSyncWorker } from '../posts-sync-worker';

const organizationId = 'workspace-import';
const job = { id: 'posts-sync-test', data: { organizationId, daysSince: 14 } } as Job<PostsSyncJobData>;

function summary(successfulAccounts: number, failedAccounts: number, imported = 3): WorkspaceSyncSummary {
    const results: WorkspaceSyncSummary['results'] = [
        ...Array.from({ length: successfulAccounts }, (_, index) => ({
            socialAccountId: `success-${index}`, platform: 'INSTAGRAM' as const, success: true,
            postsAttempted: imported, postsImported: imported, postsUpdated: 0, postsSkipped: 0,
        })),
        ...Array.from({ length: failedAccounts }, (_, index) => ({
            socialAccountId: `failed-${index}`, platform: 'FACEBOOK' as const, success: false,
            postsAttempted: 0, postsImported: 0, postsUpdated: 0, postsSkipped: 0, error: 'Token refresh failed',
        })),
    ];
    return {
        organizationId, totalAccounts: results.length, attemptedAccounts: results.length, unsupportedAccounts: 0,
        successfulAccounts, failedAccounts, totalPostsAttempted: successfulAccounts * imported,
        totalPostsImported: successfulAccounts * imported, totalPostsUpdated: 0, totalPostsSkipped: 0, results,
    };
}

/** Exercise the real private processor through the public worker factory, without Redis. */
function processor() {
    createPostsSyncWorker();
    expect(mocks.worker).toHaveBeenCalledWith('posts-sync', expect.any(Function), expect.any(Object));
    return mocks.worker.mock.calls[0][1] as (job: Job<PostsSyncJobData>) => Promise<void>;
}

describe('posts sync starter-pillar hook', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.enqueue.mockResolvedValue(undefined);
    });

    it.each([
        { successfulAccounts: 2, failedAccounts: 0, imported: 3 },
        { successfulAccounts: 1, failedAccounts: 1, imported: 3 },
        { successfulAccounts: 1, failedAccounts: 0, imported: 0 },
    ])('enqueues once after successful sync: %j', async ({ successfulAccounts, failedAccounts, imported }) => {
        const result = summary(successfulAccounts, failedAccounts, imported);
        let completeSync!: (value: WorkspaceSyncSummary) => void;
        mocks.sync.mockReturnValue(new Promise<WorkspaceSyncSummary>(resolve => { completeSync = resolve; }));

        const completion = processor()(job);
        expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(organizationId, 14);
        expect(mocks.enqueue).not.toHaveBeenCalled();
        completeSync(result);

        await expect(completion).resolves.toBeUndefined();
        expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith(organizationId);
        expect(mocks.error).not.toHaveBeenCalled();
    });

    it('does not enqueue when every attempted account fails', async () => {
        mocks.sync.mockResolvedValue(summary(0, 2));

        await expect(processor()(job)).resolves.toBeUndefined();

        expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(organizationId, 14);
        expect(mocks.enqueue).not.toHaveBeenCalled();
        expect(mocks.warn).toHaveBeenCalledWith(
            expect.objectContaining({ successfulAccounts: 0, failedAccounts: 2 }),
            'Posts sync job completed with errors',
        );
        expect(mocks.error).not.toHaveBeenCalled();
    });

    it('logs queue failure while allowing successful sync to complete without retry', async () => {
        const error = new Error('Redis unavailable');
        mocks.sync.mockResolvedValue(summary(1, 0));
        mocks.enqueue.mockRejectedValueOnce(error);

        await expect(processor()(job)).resolves.toBeUndefined();

        expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(organizationId, 14);
        expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith(organizationId);
        expect(mocks.warn).toHaveBeenCalledExactlyOnceWith(
            { err: error, organizationId },
            'Could not enqueue Seb starter pillars; daily sweep will retry',
        );
        expect(mocks.info).toHaveBeenCalledWith(
            expect.objectContaining({ successfulAccounts: 1, totalPostsImported: 3 }),
            'Posts sync job completed',
        );
        expect(mocks.error).not.toHaveBeenCalled();
    });
});
