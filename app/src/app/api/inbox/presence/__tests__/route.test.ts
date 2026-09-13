// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), exchange: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('../redis', async (original) => ({ ...await original<object>(), exchangePresence: mocks.exchange }));
import { DELETE, GET, PUT } from '../route';
import { PresenceCapacityError, PresenceUnavailableError } from '../redis';

const tx = {
    organizationMember: { findFirst: vi.fn() },
    directMessage: { findFirst: vi.fn() }, comment: { findFirst: vi.fn() },
    mention: { findFirst: vi.fn() }, review: { findFirst: vi.fn() },
};
const item = { id: 'local-message', type: 'dm', socialAccountId: 'account' };
const tabId = '7a7b8172-1de8-4f73-9a80-555de4a025a3';
const heartbeat = { ...item, tabId, state: 'viewing' };
const data = { participants: [], ttlSeconds: 45 };
const url = 'http://localhost/api/inbox/presence';
const get = (input = item) => GET(new NextRequest(`${url}?${new URLSearchParams(input)}`));
const put = (body: unknown = heartbeat) => PUT(new NextRequest(url, { method: 'PUT', body: JSON.stringify(body) }));
const release = (body: unknown = { ...item, tabId }) => DELETE(new NextRequest(url, { method: 'DELETE', body: JSON.stringify(body) }));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'actor', currentOrganizationId: 'org', name: 'Stale session name' } });
    mocks.transaction.mockImplementation(async (fn) => fn(tx));
    tx.organizationMember.findFirst.mockResolvedValue({ role: 'MEMBER', user: { name: 'Live name' } });
    tx.directMessage.findFirst.mockResolvedValue({ id: item.id, conversationId: 'conversation' });
    for (const model of [tx.comment, tx.mention, tx.review]) model.findFirst.mockResolvedValue({ id: 'canonical-row' });
    mocks.exchange.mockResolvedValue(data);
});

describe('advisory presence API', () => {
    it('returns the exact GET/PUT/DELETE contracts with no caching', async () => {
        for (const response of [await get(), await put()]) {
            expect(response.status).toBe(200);
            expect(response.headers.get('cache-control')).toBe('private, no-store');
            expect(await response.json()).toEqual({ data });
        }
        expect(await (await release()).json()).toEqual({ success: true });
    });

    it('uses authenticated identity and a live membership name for every operation', async () => {
        await get(); await put(); await release();
        expect(tx.organizationMember.findFirst).toHaveBeenCalledTimes(3);
        expect(tx.organizationMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org', userId: 'actor' } }));
        expect(mocks.exchange.mock.calls.map((args) => args.slice(1))).toEqual([
            [{ id: 'actor', name: 'Live name' }, { kind: 'get' }],
            [{ id: 'actor', name: 'Live name' }, { kind: 'put', tabId, state: 'viewing' }],
            [{ id: 'actor', name: 'Live name' }, { kind: 'delete', tabId }],
        ]);
    });

    it('requires authentication and current membership on all methods', async () => {
        mocks.auth.mockResolvedValue(null);
        for (const call of [get, put, release]) expect((await call()).status).toBe(401);
        mocks.auth.mockResolvedValue({ user: { id: 'actor', currentOrganizationId: 'org' } });
        tx.organizationMember.findFirst.mockResolvedValue(null);
        for (const call of [get, put, release]) expect((await call()).status).toBe(403);
        expect(tx.directMessage.findFirst).not.toHaveBeenCalled();
        expect(mocks.exchange).not.toHaveBeenCalled();
    });

    it('resolves owned tenant/account rows on every method and rejects missing or foreign rows', async () => {
        tx.directMessage.findFirst.mockResolvedValue(null);
        for (const call of [get, put, release]) expect((await call()).status).toBe(404);
        expect(tx.directMessage.findFirst).toHaveBeenCalledTimes(3);
        expect(tx.directMessage.findFirst).toHaveBeenCalledWith({ where: {
            id: item.id, organizationId: 'org', socialAccountId: 'account', socialAccount: { organizationId: 'org' },
        } });
        expect(mocks.exchange).not.toHaveBeenCalled();
    });

    it('shares canonical DM identity across local rows but scopes it by tenant/account/type', async () => {
        await get();
        await get({ ...item, id: 'another-local-message' });
        expect(mocks.exchange.mock.calls[0][0]).toEqual({ organizationId: 'org', socialAccountId: 'account', type: 'DM', entityId: 'conversation' });
        expect(mocks.exchange.mock.calls[1][0]).toEqual(mocks.exchange.mock.calls[0][0]);
        await get({ ...item, socialAccountId: 'other-account' });
        expect(mocks.exchange.mock.calls[2][0].socialAccountId).toBe('other-account');
        mocks.auth.mockResolvedValue({ user: { id: 'actor', currentOrganizationId: 'other-org' } });
        await get();
        expect(mocks.exchange.mock.calls[3][0].organizationId).toBe('other-org');
        for (const type of ['comment', 'mention', 'review']) {
            await get({ ...item, type });
            expect(mocks.exchange.mock.lastCall?.[0]).toMatchObject({ type: type.toUpperCase(), entityId: 'canonical-row' });
        }
    });

    it('allows viewers to view/release but requires collaboration write for both active states', async () => {
        tx.organizationMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
        for (const call of [get, put, release]) expect((await call()).status).toBe(200);
        for (const state of ['replying', 'noting']) expect((await put({ ...heartbeat, state })).status).toBe(403);
        expect(mocks.exchange).toHaveBeenCalledTimes(3);
    });

    it('honors same-tenant CUSTOM posts.edit and rejects missing/foreign permissions', async () => {
        for (const [organizationId, code, status] of [['org', 'team.view', 403], ['foreign', 'posts.edit', 403], ['org', 'posts.edit', 200]] as const) {
            tx.organizationMember.findFirst.mockResolvedValue({ role: 'CUSTOM', customRole: { organizationId, permissions: [{ permission: { code } }] } });
            for (const state of ['replying', 'noting']) expect((await put({ ...heartbeat, state })).status).toBe(status);
        }
    });

    it('rejects spoofed actors, content, keys, invalid states and malformed identifiers before I/O', async () => {
        for (const extra of [{ userId: 'victim' }, { name: 'Spoof' }, { organizationId: 'foreign' }, { conversationId: 'spoof' },
            { draft: 'secret' }, { state: 'typing' }, { tabId: 'bad' }, { id: '' }, { socialAccountId: 'x'.repeat(257) }, { type: 'post' }]) {
            expect((await put({ ...heartbeat, ...extra })).status).toBe(400);
        }
        expect((await release({ ...item, tabId, userId: 'victim' })).status).toBe(400);
        expect((await release(heartbeat)).status).toBe(400);
        expect((await GET(new NextRequest(`${url}?${new URLSearchParams(item)}&userId=victim`))).status).toBe(400);
        expect((await GET(new NextRequest(`${url}?${new URLSearchParams(item)}&id=duplicate`))).status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.exchange).not.toHaveBeenCalled();
    });

    it('normalizes UUID casing, validates JSON and bounds body bytes without Content-Length', async () => {
        await put({ ...heartbeat, tabId: tabId.toUpperCase() });
        expect(mocks.exchange.mock.lastCall?.[2].tabId).toBe(tabId);
        expect((await PUT(new NextRequest(url, { method: 'PUT', body: '{' }))).status).toBe(400);
        expect((await put({ ...heartbeat, draft: 'x'.repeat(4096) })).status).toBe(413);
        expect((await PUT(new NextRequest(url, { method: 'PUT', headers: { 'content-length': '5000' }, body: '{}' }))).status).toBe(413);
    });

    it('reports Redis failure explicitly for every method, never empty success', async () => {
        mocks.exchange.mockRejectedValue(new PresenceUnavailableError());
        for (const call of [get, put, release]) {
            const response = await call();
            expect(response.status).toBe(503);
            expect(response.headers.get('retry-after')).toBe('1');
            expect(await response.json()).toEqual({ error: 'Inbox presence unavailable; retry shortly' });
        }
        mocks.exchange.mockRejectedValue(new PresenceCapacityError());
        expect((await put()).status).toBe(429);
        mocks.transaction.mockRejectedValue(new Error('database unavailable'));
        expect((await get()).status).toBe(500);
    });
});
