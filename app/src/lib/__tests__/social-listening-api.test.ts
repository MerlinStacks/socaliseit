// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), permission: vi.fn(), validateUrl: vi.fn(),
    engagement: vi.fn(), crawler: vi.fn(),
    db: {
        socialListeningItem: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
        socialListeningMonitor: { findMany: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
        socialListeningSource: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
        socialAccount: { findMany: vi.fn() },
    },
}));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/auth/with-permission', () => ({
    hasPermission: mocks.permission,
    PERMISSIONS: { DISCOVERY_VIEW: 'discovery.view', DISCOVERY_MANAGE: 'discovery.manage' },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validate-url', async (original) => ({
    ...await original<typeof import('@/lib/validate-url')>(), validateExternalUrl: mocks.validateUrl,
}));
vi.mock('@/lib/services/engagement-sync-service', () => ({ syncWorkspaceEngagement: mocks.engagement }));
vi.mock('@/lib/services/social-listening-crawler', () => ({ crawlListeningSources: mocks.crawler }));

import { GET } from '@/app/api/listening/route';
import { GET as legacyGET } from '@/app/api/listening/data/route';
import { PATCH as itemsPATCH } from '@/app/api/listening/items/route';
import { PATCH as monitorPATCH, DELETE as monitorDELETE } from '@/app/api/listening/monitors/[id]/route';
import { POST as monitorPOST } from '@/app/api/listening/monitors/route';
import { POST as sourcePOST } from '@/app/api/listening/sources/route';
import { PATCH as sourcePATCH } from '@/app/api/listening/sources/[id]/route';
import { POST as syncPOST } from '@/app/api/listening/sync/route';
import { listeningQuerySchema, updateMonitorSchema } from '@/lib/validation/social-listening';

function request(path = '', body?: unknown, method = 'PATCH') {
    return new NextRequest(`http://localhost/api/listening${path}`, body === undefined ? undefined : {
        method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    });
}
const context = { params: Promise.resolve({ id: 'target' }) };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'tenant' } });
    mocks.permission.mockResolvedValue(true);
    mocks.db.socialListeningMonitor.findMany.mockResolvedValue([]);
    mocks.db.socialListeningItem.findMany.mockResolvedValue([{ id: 'one', sentiment: 'positive' }]);
    mocks.db.socialListeningItem.count.mockResolvedValue(63);
    mocks.db.socialListeningItem.groupBy.mockResolvedValue([{ sentiment: 'positive', _count: { _all: 63 } }]);
    mocks.db.socialAccount.findMany.mockResolvedValue([{ platform: 'INSTAGRAM' }]);
    mocks.db.socialListeningSource.findMany.mockResolvedValue([]);
    mocks.validateUrl.mockImplementation(async (url: string) => ({ valid: true, url: new URL(url) }));
});

describe('listening authorization and validation', () => {
    it('requires authentication and active-workspace permission before queries', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await GET(request())).status).toBe(401);
        expect(mocks.permission).not.toHaveBeenCalled();
        mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'tenant' } });
        mocks.permission.mockResolvedValue(false);
        expect((await GET(request('?organizationId=foreign'))).status).toBe(403);
        expect(mocks.permission).toHaveBeenCalledWith('tenant', 'user', 'discovery.view');
        expect(mocks.db.socialListeningItem.findMany).not.toHaveBeenCalled();
    });

    it('protects every mutation with discovery.manage', async () => {
        mocks.permission.mockResolvedValue(false);
        const responses = await Promise.all([
            itemsPATCH(request('', {})), monitorPATCH(request('', {}), context),
            monitorDELETE(request(), context), monitorPOST(request('', {})),
            sourcePOST(request('', {})), sourcePATCH(request('', {}), context), syncPOST(),
        ]);
        expect(responses.map((response) => response.status)).toEqual(Array(7).fill(403));
        expect(mocks.permission.mock.calls.every((call) => call[2] === 'discovery.manage')).toBe(true);
    });

    it.each([
        { page: '0' }, { pageSize: '101' }, { page: '1.5' }, { platform: 'INVALID' },
        { unread: 'yes' }, { from: '2026-01-01' }, { from: '2026-02-02T00:00:00Z', to: '2026-01-01T00:00:00Z' },
    ])('rejects invalid dashboard filters %j', (query) => {
        expect(listeningQuerySchema.safeParse(query).success).toBe(false);
    });

    it('returns 400 for malformed JSON, empty patches and excessive IDs', async () => {
        const malformed = new NextRequest('http://localhost/api/listening/items', { method: 'PATCH', body: '{' });
        expect((await itemsPATCH(malformed)).status).toBe(400);
        expect((await monitorPATCH(request('', {}), context)).status).toBe(400);
        expect((await itemsPATCH(request('', { ids: Array(101).fill('id'), isRead: true }))).status).toBe(400);
        expect((await itemsPATCH(request('', { ids: ['id'], isRead: 'false' }))).status).toBe(400);
        expect(mocks.db.socialListeningItem.updateMany).not.toHaveBeenCalled();
        expect(updateMonitorSchema.safeParse({ keywords: [' '] }).success).toBe(false);
    });
});

describe('dashboard database filtering', () => {
    it('paginates deterministically and aggregates the full filtered dataset', async () => {
        const response = await GET(request('?q=Brand&monitorId=m&platform=INSTAGRAM&sentiment=positive&sourceType=comment&unread=true&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&page=2&pageSize=10'));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            totalCount: 63, page: 2, pageSize: 10, totalPages: 7, sentiment: { positive: 63 },
            unreadCount: 63, hasAccounts: true, hasInstagram: true, monitors: [], crawlerSources: [],
        });
        const query = mocks.db.socialListeningItem.findMany.mock.calls[0][0];
        expect(query).toMatchObject({ take: 10, skip: 10, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], where: {
            organizationId: 'tenant', monitorId: 'm', platform: 'INSTAGRAM', sentiment: 'positive', sourceType: 'comment', isRead: false,
            occurredAt: { gte: new Date('2026-01-01T00:00:00Z'), lte: new Date('2026-02-01T00:00:00Z') },
            OR: [{ content: { contains: 'Brand', mode: 'insensitive' } }, { authorName: { contains: 'Brand', mode: 'insensitive' } }],
        } });
        expect(mocks.db.socialListeningItem.groupBy).toHaveBeenCalledWith({ by: ['sentiment'], where: query.where, _count: { _all: true } });
        expect(mocks.db.socialListeningItem.count).toHaveBeenCalledWith({ where: query.where });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('keeps the legacy alias and counts unread independently of the unread switch', async () => {
        expect(legacyGET).toBe(GET);
        await GET(request('?unread=false'));
        expect(mocks.db.socialListeningItem.findMany.mock.calls[0][0]).toMatchObject({ take: 25, skip: 0, where: { organizationId: 'tenant' } });
        expect(mocks.db.socialListeningItem.findMany.mock.calls[0][0].where).not.toHaveProperty('isRead');
        expect(mocks.db.socialListeningItem.count).toHaveBeenCalledWith({ where: { organizationId: 'tenant', isRead: false } });
    });
});

describe('tenant-scoped mutations', () => {
    it('bulk updates only matching tenant items and reports actual count', async () => {
        mocks.db.socialListeningItem.updateMany.mockResolvedValue({ count: 1 });
        const response = await itemsPATCH(request('', { ids: ['mine', 'foreign'], isRead: false }));
        expect(await response.json()).toEqual({ success: true, updatedCount: 1 });
        expect(mocks.db.socialListeningItem.updateMany).toHaveBeenCalledWith({
            where: { organizationId: 'tenant', id: { in: ['mine', 'foreign'] } }, data: { isRead: false },
        });
    });

    it('normalizes monitor edits, supports pause and uses ownership in the write', async () => {
        mocks.db.socialListeningMonitor.update.mockResolvedValue({ id: 'target' });
        expect((await monitorPATCH(request('', { keywords: [' Brand ', 'brand'], excludedTerms: [], platforms: [], isActive: false }), context)).status).toBe(200);
        expect(mocks.db.socialListeningMonitor.update).toHaveBeenCalledWith({ where: { id: 'target', organizationId: 'tenant' }, data: {
            keywords: ['brand'], excludedTerms: [], platforms: [], isActive: false,
        } });
        mocks.db.socialListeningMonitor.update.mockRejectedValue({ code: 'P2025' });
        expect((await monitorPATCH(request('', { name: 'Other' }), context)).status).toBe(404);
    });

    it('preserves comma-separated monitor creation', async () => {
        mocks.db.socialListeningMonitor.create.mockResolvedValue({ id: 'new' });
        expect((await monitorPOST(request('', { name: 'Brand', keywords: ' Brand, product ', excludedTerms: '' }, 'POST'))).status).toBe(201);
        expect(mocks.db.socialListeningMonitor.create.mock.calls[0][0].data).toMatchObject({ organizationId: 'tenant', keywords: ['brand', 'product'], excludedTerms: [] });
    });

    it.each(['http://127.0.0.1', 'http://169.254.169.254', 'file:///etc/passwd', 'https://user:pass@example.com', 'http://service.internal'])('rejects unsafe source URL %s before persistence', async (url) => {
        expect((await sourcePOST(request('', { name: 'Source', url, type: 'auto' }, 'POST'))).status).toBe(400);
        expect(mocks.db.socialListeningSource.create).not.toHaveBeenCalled();
    });

    it('checks DNS, normalizes URLs, and maps type to the actual sourceType field', async () => {
        mocks.db.socialListeningSource.create.mockResolvedValue({ id: 'source', sourceType: 'rss' });
        const input = { name: 'Feed', url: 'example.com/feed#fragment', type: 'rss' };
        expect((await sourcePOST(request('', input, 'POST'))).status).toBe(201);
        expect(mocks.validateUrl).toHaveBeenCalledWith('https://example.com/feed');
        expect(mocks.db.socialListeningSource.create).toHaveBeenCalledWith({ data: {
            organizationId: 'tenant', name: 'Feed', url: 'https://example.com/feed', sourceType: 'rss',
        } });
        mocks.validateUrl.mockResolvedValue({ valid: false });
        expect((await sourcePOST(request('', input, 'POST'))).status).toBe(400);
        expect(mocks.db.socialListeningSource.create).toHaveBeenCalledTimes(1);
    });

    it('returns 404 for foreign sources, allows disable, and revalidates enable', async () => {
        mocks.db.socialListeningSource.findFirst.mockResolvedValue(null);
        expect((await sourcePATCH(request('', { isActive: false }), context)).status).toBe(404);
        expect(mocks.db.socialListeningSource.findFirst).toHaveBeenCalledWith({ where: { id: 'target', organizationId: 'tenant' } });
        mocks.db.socialListeningSource.findFirst.mockResolvedValue({ url: 'https://example.com' });
        mocks.db.socialListeningSource.update.mockResolvedValue({ id: 'target', isActive: false });
        expect((await sourcePATCH(request('', { isActive: false }), context)).status).toBe(200);
        expect(mocks.validateUrl).not.toHaveBeenCalled();
        expect(mocks.db.socialListeningSource.update).toHaveBeenCalledWith({ where: { id: 'target', organizationId: 'tenant' }, data: { isActive: false } });
        mocks.validateUrl.mockResolvedValue({ valid: false });
        expect((await sourcePATCH(request('', { isActive: true }), context)).status).toBe(400);
    });
});

describe('synchronous sync outcomes', () => {
    it('continues after an upstream failure and surfaces returned crawler errors', async () => {
        mocks.engagement.mockRejectedValue(new Error('upstream secret'));
        mocks.crawler.mockResolvedValue({ sources: 2, errors: ['Feed failed'] });
        const response = await syncPOST();
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: false, partial: true, engagement: null,
            crawler: { errors: ['Feed failed'] }, listening: { synced: 0, monitors: 0 },
            errors: [{ stage: 'engagement', message: 'engagement sync failed' }, { stage: 'crawler' }],
        });
    });

    it('returns 500 when every stage fails', async () => {
        mocks.engagement.mockRejectedValue(new Error('failed'));
        mocks.crawler.mockRejectedValue(new Error('failed'));
        mocks.db.socialListeningMonitor.findMany.mockRejectedValue(new Error('failed'));
        const response = await syncPOST();
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ success: false, partial: false, listening: null });
    });
});
