import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { processEngagementSync } from '@/workers/engagement-sync-worker';
import { syncWorkspaceEngagement } from '@/lib/services/engagement-sync-service';
import { syncWorkspaceReviews } from '@/lib/services/review-sync-service';

const mocks = vi.hoisted(() => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/bullmq/connection', () => ({
    getBullMQConnection: vi.fn(),
    getRedisConnection: () => mocks.redis,
}));
vi.mock('@/lib/logger', () => ({ createJobLogger: () => mocks.log }));
vi.mock('@/lib/services/engagement-sync-service', () => ({ syncWorkspaceEngagement: vi.fn() }));
vi.mock('@/lib/services/review-sync-service', () => ({ syncWorkspaceReviews: vi.fn() }));

const engagementResult = (errors: { accountId: string; platform: string; error: string }[] = []) => ({
    organizationId: 'org-1',
    commentsAdded: 0,
    commentNotificationsAdded: 0,
    commentsUpdated: 0,
    mentionsAdded: 0,
    mentionsUpdated: 0,
    dmsAdded: 0,
    dmsUpdated: 0,
    postsScanned: 0,
    accountsProcessed: 1,
    errors,
});

const job = { id: 'job-1', data: { organizationId: 'org-1', daysSince: 30 } } as Job<any>;

describe('processEngagementSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.redis.get.mockResolvedValue(null);
        vi.mocked(syncWorkspaceEngagement).mockResolvedValue(engagementResult());
        vi.mocked(syncWorkspaceReviews).mockResolvedValue({
            organizationId: 'org-1', reviewsAdded: 0, reviewsUpdated: 0, accountsProcessed: 1, errors: [],
        });
    });

    it('sets the empty-cycle TTL only when the inactivity window starts', async () => {
        mocks.redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

        await processEngagementSync(job);
        await processEngagementSync(job);

        expect(mocks.redis.incr).toHaveBeenCalledTimes(2);
        expect(mocks.redis.expire).toHaveBeenCalledTimes(1);
        expect(mocks.redis.expire).toHaveBeenCalledWith('sync:empty-cycles:org-1', 86_400);
    });

    it('resets backoff instead of counting a run with errors as inactivity', async () => {
        vi.mocked(syncWorkspaceEngagement).mockResolvedValue(engagementResult([
            { accountId: 'account-1', platform: 'TIKTOK', error: 'API unavailable' },
        ]));

        await processEngagementSync(job);

        expect(mocks.redis.incr).not.toHaveBeenCalled();
        expect(mocks.redis.del).toHaveBeenCalledWith('sync:empty-cycles:org-1');
        expect(mocks.log.warn).toHaveBeenCalledWith(
            expect.objectContaining({ errorCount: 1, emptyCycleCount: 0 }),
            'Engagement sync job completed with errors'
        );
    });

    it('includes review service result errors in the partial-failure summary', async () => {
        vi.mocked(syncWorkspaceReviews).mockResolvedValue({
            organizationId: 'org-1',
            reviewsAdded: 0,
            reviewsUpdated: 0,
            accountsProcessed: 1,
            errors: [{ accountId: 'account-2', platform: 'FACEBOOK', error: 'Permission denied' }],
        });

        await processEngagementSync(job);

        expect(mocks.log.warn).toHaveBeenCalledWith(
            expect.objectContaining({
                errorCount: 1,
                errors: ['REVIEW: FACEBOOK/account-2: Permission denied'],
            }),
            'Engagement sync job completed with errors'
        );
    });
});
