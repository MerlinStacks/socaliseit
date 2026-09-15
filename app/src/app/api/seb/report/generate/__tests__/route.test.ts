import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), reserve: vi.fn(), record: vi.fn(), enqueue: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/ai/seb-advisor', () => ({ getSebUsageLimits: async () => ({ maxReportsPerDay: 5 }) }));
vi.mock('@/lib/seb-review', () => ({ reserveSebReview: mocks.reserve, recordSebReview: mocks.record }));
vi.mock('@/lib/seb-review-queue', () => ({ reconcileSebReviews: vi.fn() }));
vi.mock('@/lib/bullmq/queues', () => ({ enqueueSebReportGeneration: mocks.enqueue }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }), EXPENSIVE_RATE_LIMIT: {}, createRateLimitHeaders: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createRouteLogger: () => ({ error: vi.fn() }) }));
import { POST } from '../route';
describe('manual Seb generation', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'org' } });
        mocks.reserve.mockResolvedValue({ report: { id: 'report', status: 'GENERATING' }, existing: false });
    });
    it('marks enqueue failure durably failed', async () => {
        mocks.enqueue.mockRejectedValue(new Error('Redis down'));
        expect((await POST()).status).toBe(500);
        expect(mocks.record).toHaveBeenCalledWith('org', 'report', 'FAILED', 'Could not enqueue review');
    });
    it('preserves report/jobId response and reuses concurrent review without enqueue', async () => {
        mocks.reserve.mockResolvedValue({ report: { id: 'report' }, existing: true });
        const response = await POST();
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ report: { id: 'report' }, jobId: 'seb-report-report', existing: true });
        expect(mocks.enqueue).not.toHaveBeenCalled();
    });
    it('does not reserve unauthenticated requests', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await POST()).status).toBe(401);
        expect(mocks.reserve).not.toHaveBeenCalled();
    });
});
