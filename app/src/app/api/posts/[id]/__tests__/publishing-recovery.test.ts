import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), retry: vi.fn(), activity: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { post: { findUnique: mocks.findUnique, update: mocks.update }, activity: { create: mocks.activity } } }));
vi.mock('@/lib/queue', () => ({ retryFailedPost: mocks.retry }));
vi.mock('@/lib/cache', () => ({ invalidatePostCaches: vi.fn() }));
vi.mock('@/lib/services/platform-analytics-sync', () => ({ syncSinglePostAnalytics: vi.fn() }));
vi.mock('@/lib/schedule-conflicts', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { handlePatchPost } from '../post-handlers';
import { PublishingConflictError } from '@/lib/publishing-status';
const ctx = { id: 'post', organizationId: 'org', userId: 'user', userName: 'User' };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUnique.mockResolvedValue({ id: 'post', organizationId: 'org', status: 'FAILED', caption: 'Hello' });
    mocks.retry.mockResolvedValue({ success: true, jobId: 'job' });
    mocks.activity.mockResolvedValue({});
});

describe('publishing recovery API', () => {
    it('rejects even an old PUBLISHING post without resetting or retrying it', async () => {
        mocks.findUnique.mockResolvedValue({ organizationId: 'org', status: 'PUBLISHING', updatedAt: new Date(0) });
        const response = await handlePatchPost(ctx, { action: 'retry' });
        expect(response.status).toBe(409);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.retry).not.toHaveBeenCalled();
    });
    it('does not expose or retry another organization’s post', async () => {
        mocks.findUnique.mockResolvedValue({ organizationId: 'other', status: 'FAILED' });
        expect((await handlePatchPost(ctx, { action: 'retry' })).status).toBe(404);
        expect(mocks.retry).not.toHaveBeenCalled();
    });
    it('returns queued status even when activity recording fails', async () => {
        mocks.activity.mockRejectedValue(new Error('Activity unavailable'));
        const response = await handlePatchPost(ctx, { action: 'retry' });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ status: 'scheduled', jobId: 'job' });
    });
    it('returns actionable conflict text when the queue refuses an unsafe retry', async () => {
        mocks.retry.mockRejectedValue(new PublishingConflictError('Check the platform before posting again.'));
        const response = await handlePatchPost(ctx, { action: 'retry' });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Check the platform before posting again.' });
    });
});
