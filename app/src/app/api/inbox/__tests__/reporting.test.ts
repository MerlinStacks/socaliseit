// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), member: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { GET } from '../reporting/route';
import { buildReportingQuery, reportingDefinitions, reportingQuerySchema } from '../reporting/query';

const get = (params = {}) => GET(new NextRequest(`http://localhost/api/inbox/reporting?${new URLSearchParams(params)}`));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'reader', currentOrganizationId: 'org' } });
    mocks.member.mockResolvedValue({ role: 'VIEWER' });
    mocks.query.mockResolvedValue([{ data: { generatedAt: '2026-09-13T00:00:00.000Z', summary: {}, byType: [], byAssignee: [], ageBuckets: [] } }]);
    mocks.transaction.mockImplementation((fn) => fn({ organizationMember: { findFirst: mocks.member }, $queryRaw: mocks.query }));
});
describe('reporting access and contract', () => {
    it('requires a session and live membership before querying private data', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await get()).status).toBe(401);
        expect(mocks.transaction).not.toHaveBeenCalled();
        mocks.auth.mockResolvedValue({ user: { id: 'reader', currentOrganizationId: 'org' } });
        mocks.member.mockResolvedValue(null);
        expect((await get()).status).toBe(403);
        expect(mocks.member.mock.calls[0][0].where).toEqual({ organizationId: 'org', userId: 'reader' });
        expect(mocks.query).not.toHaveBeenCalled();
    });
    it('allows read-only members and returns the SQL snapshot and explicit definitions without caching', async () => {
        const response = await get({ platform: 'instagram', socialAccountId: 'account' });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        const body = await response.json();
        expect(Object.keys(body).sort()).toEqual(['data', 'definitions']);
        expect(body.data).toEqual((await mocks.query.mock.results[0].value)[0].data);
        expect(body.definitions).toEqual(reportingDefinitions);
        expect(body.data).not.toHaveProperty('recentResolutions');
        expect(body.definitions.resolutions).toContain('initial workflow write');
        expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
        expect(mocks.query.mock.calls[0][0].values).toEqual(expect.arrayContaining(['org', 'account', 'INSTAGRAM']));
    });
    it('validates filters and never interpolates user text into SQL', async () => {
        for (const params of [{ platform: 'bad' }, { socialAccountId: '' }, { queue: 'resolved' }]) {
            expect((await get(params)).status).toBe(400);
        }
        expect(mocks.query).not.toHaveBeenCalled();
        const id = "' OR TRUE; --";
        const sql = buildReportingQuery('org', reportingQuerySchema.parse({ socialAccountId: id }), new Date('2026-09-13'));
        expect(sql.text).not.toContain(id);
        expect(sql.values).toContain(id);
        expect(sql.text).not.toContain('InboxActivity');
    });
    it('handles database errors without exposing private details', async () => {
        mocks.query.mockRejectedValue(new Error('secret SQL'));
        const response = await get();
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Inbox reporting failed' });
    });
});
