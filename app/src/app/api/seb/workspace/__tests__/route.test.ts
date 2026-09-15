import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), reconcile: vi.fn(),
    report: { findFirst: vi.fn(), findMany: vi.fn() },
    recommendation: { findMany: vi.fn() }, experiment: { findMany: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { sebReport: mocks.report, sebRecommendation: mocks.recommendation, sebExperiment: mocks.experiment } }));
vi.mock('@/lib/seb-review-queue', () => ({ reconcileSebReviews: mocks.reconcile }));
vi.mock('@/lib/logger', () => ({ createRouteLogger: () => ({ error: vi.fn(), warn: vi.fn() }) }));
import { GET } from '../route';

const date = new Date('2026-09-15T10:00:00Z');
describe('Seb workspace', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'org-a' } });
        mocks.reconcile.mockResolvedValue(undefined);
        mocks.report.findFirst.mockResolvedValue(null);
        mocks.report.findMany.mockResolvedValue([]);
        mocks.recommendation.findMany.mockResolvedValue([]);
        mocks.experiment.findMany.mockResolvedValue([]);
    });
    it.each([null, { user: { id: 'user' } }, { user: { currentOrganizationId: 'org-a' } }])('requires authenticated user and organization (%j)', async session => {
        mocks.auth.mockResolvedValue(session);
        expect((await GET()).status).toBe(401);
        expect(mocks.report.findFirst).not.toHaveBeenCalled();
        expect(mocks.reconcile).not.toHaveBeenCalled();
    });
    it('keeps latest completed independently of queued refresh and scopes every query', async () => {
        const completed = { id: 'old', status: 'COMPLETED', createdAt: date, updatedAt: date };
        const queued = { id: 'new', status: 'GENERATING', metadata: { review: { status: 'QUEUED', stage: 'Waiting for worker' } }, createdAt: date, updatedAt: date };
        mocks.report.findFirst.mockResolvedValueOnce(completed).mockResolvedValueOnce(queued).mockResolvedValueOnce(queued);
        const body = await (await GET()).json();
        expect(body.latest.id).toBe('old');
        expect(body.review).toEqual({ id: 'new', status: 'QUEUED', stage: 'Waiting for worker', createdAt: date.toISOString(), updatedAt: date.toISOString() });
        expect(mocks.report.findFirst.mock.calls[0][0].where).toEqual({ organizationId: 'org-a', status: 'COMPLETED' });
        for (const mock of [mocks.report.findFirst, mocks.report.findMany, mocks.recommendation.findMany, mocks.experiment.findMany]) {
            for (const [query] of mock.mock.calls) expect(query.where.organizationId).toBe('org-a');
        }
    });
    it('returns cross-report active and recent closed backlog with evidence and account, bounded independently', async () => {
        const rec = { id: 'rec', reportId: 'older-report', createdAt: date, evidence: { postIds: ['post'] }, citations: [{ id: 'post' }], socialAccount: { id: 'account', name: 'Name', username: 'handle' } };
        mocks.recommendation.findMany.mockResolvedValueOnce(Array.from({ length: 101 }, (_, i) => ({ ...rec, id: `active-${i}` }))).mockResolvedValueOnce([{ ...rec, id: 'done', status: 'DONE' }]);
        mocks.experiment.findMany.mockResolvedValueOnce([{ id: 'exp', reportId: 'older-report', createdAt: date }]).mockResolvedValueOnce([{ id: 'finished', createdAt: date }]);
        const body = await (await GET()).json();
        expect(body.recommendations).toHaveLength(101);
        expect(body.recommendations[0]).toMatchObject({ evidence: rec.evidence, citations: rec.citations, socialAccount: rec.socialAccount });
        expect(body.recommendations.at(-1).id).toBe('done');
        expect(body.experiments.map((e: { id: string }) => e.id)).toEqual(['exp', 'finished']);
        expect(body.hasMore.recommendations).toEqual({ active: true, closed: false });
        for (const mock of [mocks.recommendation.findMany, mocks.experiment.findMany]) {
            for (const [query] of mock.mock.calls) expect(query.where).not.toHaveProperty('reportId');
        }
        expect(mocks.recommendation.findMany.mock.calls[1][0].where.status.in).toEqual(['DONE', 'DISMISSED']);
    });
    it('returns empty workspace and survives queue unavailability', async () => {
        mocks.reconcile.mockRejectedValue(new Error('Redis unavailable'));
        const response = await GET();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(await response.json()).toMatchObject({ latest: null, review: null, recommendations: [], experiments: [], history: [], activity: [] });
    });
    it('reports failed review without stale running stage and emits recorded milestones', async () => {
        const event = { status: 'FAILED', stage: 'Could not enqueue review', createdAt: date.toISOString() };
        const report = { id: 'failed', status: 'FAILED', createdAt: date, updatedAt: date, metadata: { review: event, reviewEvents: [event] } };
        mocks.report.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(report);
        mocks.report.findMany.mockResolvedValue([report]);
        const body = await (await GET()).json();
        expect(body.review.status).toBe('FAILED');
        expect(body.activity[0]).toMatchObject({ actor: 'System', title: event.stage, detail: 'Recorded review transition: FAILED' });
        expect(body.history[0]).not.toHaveProperty('metadata');
    });
});
