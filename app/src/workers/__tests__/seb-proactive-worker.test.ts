import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), generate: vi.fn(), record: vi.fn(), reserve: vi.fn(), settings: vi.fn(), orgs: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { sebReport: { findFirst: mocks.findFirst }, globalAISettings: { findUnique: mocks.settings }, organization: { findMany: mocks.orgs } } }));
vi.mock('@/lib/ai/seb-advisor', () => ({ generateSebReport: mocks.generate, isSameSebLocalDate: () => false, normalizeSebTimezone: () => 'UTC' }));
vi.mock('@/lib/ai/seb-initial-pillars', () => ({ initializeDueSebPillars: vi.fn(), initializeSebPillars: vi.fn() }));
vi.mock('@/lib/seb-review', () => ({ recordSebReview: mocks.record, reserveSebReview: mocks.reserve, reviewEvents: () => [] }));
vi.mock('@/lib/seb-review-queue', () => ({ reconcileSebReviews: vi.fn() }));
vi.mock('@/lib/bullmq/connection', () => ({ getBullMQConnection: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createJobLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
import { processSebProactive, runSebReview } from '../seb-proactive-worker';
import type { Job } from 'bullmq';
import type { SebProactiveJobData } from '@/lib/bullmq/queues';
describe('Seb worker lifecycle', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.findFirst.mockResolvedValue({ status: 'GENERATING' });
        mocks.record.mockResolvedValue({ metadata: {} });
    });
    it('records actual generation boundary and completion', async () => {
        await runSebReview({ type: 'generate-report', organizationId: 'org', reportId: 'report' });
        expect(mocks.record.mock.calls.map(args => args[2])).toEqual(['RUNNING', 'COMPLETED']);
        expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
        expect(mocks.generate).toHaveBeenCalledWith({ organizationId: 'org', reportId: 'report', userId: undefined, trigger: 'MANUAL' });
    });
    it('records failure even when advisor fails before its own catch', async () => {
        mocks.generate.mockRejectedValue(new Error('settings unavailable'));
        await expect(runSebReview({ type: 'generate-report', organizationId: 'org', reportId: 'report' })).rejects.toThrow('settings unavailable');
        expect(mocks.record.mock.calls.map(args => args[2])).toEqual(['RUNNING', 'FAILED']);
    });
    it.each(['COMPLETED', 'FAILED'])('ignores redelivery of terminal %s report', async status => {
        mocks.findFirst.mockResolvedValue({ status });
        await runSebReview({ type: 'generate-report', organizationId: 'org', reportId: 'report' });
        expect(mocks.generate).not.toHaveBeenCalled();
    });
    it('reserves proactive report before generating and associates scheduler job', async () => {
        mocks.settings.mockResolvedValue({ isConfigured: true, sebEnabled: true, sebProactiveEnabled: true });
        mocks.orgs.mockResolvedValue([{ id: 'org', timezone: 'UTC' }]);
        mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'GENERATING' });
        mocks.reserve.mockResolvedValue({ report: { id: 'proactive' }, existing: false });
        await processSebProactive({ id: 'daily', data: { type: 'daily-refresh' } } as Job<SebProactiveJobData>);
        expect(mocks.reserve).toHaveBeenCalledWith('org', 'PROACTIVE', undefined, undefined, 'daily');
        expect(mocks.generate).toHaveBeenCalledWith({ organizationId: 'org', reportId: 'proactive', trigger: 'PROACTIVE', userId: undefined });
    });
});
