import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    tx: { $queryRaw: vi.fn(), sebReport: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn(), update: vi.fn() } },
    pending: vi.fn(), getJob: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { $transaction: (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx), sebReport: { findMany: mocks.pending } } }));
vi.mock('@/lib/bullmq/queues', () => ({ sebProactiveQueue: { getJob: mocks.getJob } }));
import { recordSebReview, reserveSebReview } from '../seb-review';
import { reconcileSebReviews } from '../seb-review-queue';

describe('durable Seb review lifecycle', () => {
    beforeEach(() => { vi.resetAllMocks(); mocks.tx.sebReport.count.mockResolvedValue(0); });
    it('locks the org before checking active work, reuses existing review without creating another', async () => {
        const report = { id: 'existing' };
        mocks.tx.sebReport.findFirst.mockResolvedValue(report);
        expect(await reserveSebReview('org', 'MANUAL', 'user', 5)).toEqual({ report, existing: true, limited: false });
        expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.sebReport.findFirst.mock.invocationCallOrder[0]);
        expect(mocks.tx.sebReport.create).not.toHaveBeenCalled();
    });
    it('checks quota inside reservation and persists queued stage', async () => {
        mocks.tx.sebReport.findFirst.mockResolvedValue(null);
        await reserveSebReview('org', 'MANUAL', 'user', 5);
        expect(mocks.tx.sebReport.create.mock.calls[0][0].data).toMatchObject({ organizationId: 'org', status: 'GENERATING', metadata: { review: { status: 'QUEUED' } } });
        mocks.tx.sebReport.count.mockResolvedValue(5);
        expect((await reserveSebReview('org', 'MANUAL', 'user', 5)).limited).toBe(true);
        expect(mocks.tx.sebReport.create).toHaveBeenCalledTimes(1);
    });
    it('restores prior lifecycle events while preserving generated progress notes', async () => {
        mocks.tx.sebReport.findFirst.mockResolvedValue({ id: 'report', status: 'COMPLETED', metadata: { progressNotes: ['insight'] } });
        const prior = [{ status: 'RUNNING' as const, stage: 'Generating report', createdAt: '2026-09-15T00:00:00Z' }];
        await recordSebReview('org', 'report', 'COMPLETED', 'Review completed', prior);
        const update = mocks.tx.sebReport.update.mock.calls[0][0];
        expect(update.where).toEqual({ id: 'report', organizationId: 'org' });
        expect(update.data.metadata.progressNotes).toEqual(['insight']);
        expect(update.data.metadata.reviewEvents.map((e: { status: string }) => e.status)).toEqual(['RUNNING', 'COMPLETED']);
    });
    it.each(['failed', 'completed', 'missing'])('repairs stranded generating reports when queue state is %s', async state => {
        mocks.pending.mockResolvedValue([{ id: 'report', metadata: {} }]);
        mocks.getJob.mockResolvedValue(state === 'missing' ? null : { getState: async () => state });
        mocks.tx.sebReport.findFirst.mockResolvedValue({ id: 'report', status: 'GENERATING', metadata: {} });
        await reconcileSebReviews('org');
        expect(mocks.tx.sebReport.update.mock.calls[0][0].data.status).toBe('FAILED');
        expect(mocks.pending.mock.calls[0][0].where).toMatchObject({ organizationId: 'org', status: 'GENERATING' });
    });
    it('does not fail live jobs or reports completed during reconciliation', async () => {
        mocks.pending.mockResolvedValue([{ id: 'report', metadata: { queueJobId: 'daily-job' } }]);
        mocks.getJob.mockResolvedValue({ getState: async () => 'active' });
        await reconcileSebReviews('org');
        expect(mocks.getJob).toHaveBeenCalledWith('daily-job');
        expect(mocks.tx.sebReport.update).not.toHaveBeenCalled();
        mocks.tx.sebReport.findFirst.mockResolvedValue({ status: 'COMPLETED' });
        await recordSebReview('org', 'report', 'FAILED', 'Interrupted');
        expect(mocks.tx.sebReport.update).not.toHaveBeenCalled();
    });
});
