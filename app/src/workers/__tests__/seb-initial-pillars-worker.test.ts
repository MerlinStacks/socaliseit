import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { SebProactiveJobData } from '@/lib/bullmq/queues';

const mocks = vi.hoisted(() => ({ initialize: vi.fn(), sweep: vi.fn(), settings: vi.fn(), orgs: vi.fn(), report: vi.fn() }));
vi.mock('@/lib/ai/seb-initial-pillars', () => ({ initializeSebPillars: mocks.initialize, initializeDueSebPillars: mocks.sweep }));
vi.mock('@/lib/ai/seb-advisor', () => ({ generateSebReport: mocks.report, isSameSebLocalDate: () => true, normalizeSebTimezone: () => 'UTC' }));
vi.mock('@/lib/db', () => ({ db: {
    globalAISettings: { findUnique: mocks.settings }, organization: { findMany: mocks.orgs },
    sebReport: { findFirst: vi.fn().mockResolvedValue({ createdAt: new Date() }) },
} }));
vi.mock('@/lib/seb-review', () => ({ recordSebReview: vi.fn(), reserveSebReview: vi.fn(), reviewEvents: vi.fn() }));
vi.mock('@/lib/seb-review-queue', () => ({ reconcileSebReviews: vi.fn() }));
vi.mock('@/lib/bullmq/connection', () => ({ getBullMQConnection: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createJobLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
import { processSebProactive } from '../seb-proactive-worker';

const job = (data: SebProactiveJobData) => ({ id: 'job', data }) as Job<SebProactiveJobData>;

describe('Seb initial pillars worker integration', () => {
    beforeEach(() => vi.clearAllMocks());
    it('dispatches account jobs to only the requested workspace initializer', async () => {
        await processSebProactive(job({ type: 'initialize-pillars', organizationId: 'workspace-a' }));
        expect(mocks.initialize).toHaveBeenCalledWith('workspace-a');
        expect(mocks.sweep).not.toHaveBeenCalled();
        expect(mocks.report).not.toHaveBeenCalled();
    });
    it('rejects missing tenant context', async () => {
        await expect(processSebProactive(job({ type: 'initialize-pillars' }))).rejects.toThrow('Missing Seb pillar organization');
        expect(mocks.initialize).not.toHaveBeenCalled();
    });
    it('reconciles pillars even when the daily report is already completed', async () => {
        mocks.settings.mockResolvedValue({ isConfigured: true, sebEnabled: true, sebProactiveEnabled: true });
        mocks.orgs.mockResolvedValue([{ id: 'workspace-a', timezone: 'UTC' }]);
        await processSebProactive(job({ type: 'daily-refresh' }));
        expect(mocks.sweep).toHaveBeenCalledOnce();
        expect(mocks.report).not.toHaveBeenCalled();
    });
});
