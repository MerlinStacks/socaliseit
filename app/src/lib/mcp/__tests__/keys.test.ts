// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), member: vi.fn(), create: vi.fn(), list: vi.fn(), revoke: vi.fn(), activity: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: {
    organizationMember: { findUnique: mocks.member },
    publishingApiKey: { create: mocks.create, findMany: mocks.list, updateMany: mocks.revoke },
    activity: { create: mocks.activity },
} }));
import { GET, POST, DELETE } from '@/app/api/settings/publishing-keys/route';
import { hashKey } from '../auth';

const request = (body: unknown, method = 'POST') => new Request('http://localhost/api/settings/publishing-keys', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const get = () => GET(new Request('http://localhost/api/settings/publishing-keys'));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user1', currentOrganizationId: 'org1' } });
    mocks.member.mockResolvedValue({ organizationId: 'org1', userId: 'user1', role: 'OWNER', user: { name: 'Owner', bannedAt: null } });
    mocks.create.mockResolvedValue({ id: 'key1', name: 'Integration', expiresAt: new Date() });
    mocks.list.mockResolvedValue([]);
    mocks.revoke.mockResolvedValue({ count: 1 });
});

describe('workspace publishing key management', () => {
    it('returns the secret once and persists only its digest', async () => {
        const response = await POST(request({ name: 'Integration' }));
        expect(response.status).toBe(201);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        const body = await response.json();
        expect(body.key).toMatch(/^osp_[a-f0-9]{64}$/);
        const stored = mocks.create.mock.calls[0][0].data;
        expect(stored.keyHash).toBe(hashKey(body.key));
        expect(stored.key).toBeUndefined();
        expect(stored.organizationId).toBe('org1');
        expect(stored.userId).toBe('user1');
        expect(stored.scopes).toEqual(['read', 'publish']);
        expect(mocks.activity).toHaveBeenCalled();
    });
    it('only selects safe metadata for the current workspace', async () => {
        await get();
        const query = mocks.list.mock.calls[0][0];
        expect(query.where).toEqual({ organizationId: 'org1' });
        expect(query.select.keyHash).toBeUndefined();
        expect(query.select.keyPrefix).toBe(true);
    });
    it('paginates beyond 100 historical keys so older active keys remain reachable', async () => {
        const keys = Array.from({ length: 101 }, (_, index) => ({ id: `key${index + 1}`,
            name: `Integration ${index + 1}`, revokedAt: index < 100 ? new Date() : null }));
        mocks.list.mockResolvedValueOnce(keys);
        const first = await (await get()).json();
        expect(first.keys).toHaveLength(100);
        expect(first.nextCursor).toBe('key100');
        expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ take: 101,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));

        mocks.list.mockResolvedValueOnce([keys[100]]);
        const second = await (await GET(new Request('http://localhost/api/settings/publishing-keys?cursor=key100'))).json();
        expect(second).toEqual({ keys: [keys[100]], nextCursor: null });
        expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({
            where: { organizationId: 'org1' }, cursor: { id: 'key100' }, skip: 1, take: 101,
        }));
        expect((await DELETE(request({ id: second.keys[0].id }, 'DELETE'))).status).toBe(200);
        expect(mocks.revoke).toHaveBeenCalledWith(expect.objectContaining({ where: {
            id: 'key101', organizationId: 'org1', revokedAt: null,
        } }));
    });
    it.each(['', 'x'.repeat(101)])('rejects an invalid pagination cursor without querying keys', async cursor => {
        expect((await GET(new Request(`http://localhost/api/settings/publishing-keys?cursor=${cursor}`))).status).toBe(400);
        expect(mocks.list).not.toHaveBeenCalled();
    });
    it('allows explicit upload scopes while leaving defaults without upload access', async () => {
        expect((await POST(request({ name: 'Uploader', scopes: ['read', 'publish', 'upload'] }))).status).toBe(201);
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scopes: ['read', 'publish', 'upload'] }) }));
    });
    it.each(['MEMBER', 'VIEWER', 'CUSTOM'])('does not let %s members create or revoke keys', async role => {
        mocks.member.mockResolvedValue({ role, organizationId: 'org1', user: {} });
        expect((await POST(request({ name: 'Key' }))).status).toBe(403);
        expect((await DELETE(request({ id: 'key1' }, 'DELETE'))).status).toBe(403);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.revoke).not.toHaveBeenCalled();
    });
    it('rejects unauthenticated and banned issuers', async () => {
        mocks.auth.mockResolvedValueOnce(null);
        expect((await get()).status).toBe(403);
        mocks.member.mockResolvedValueOnce({ role: 'OWNER', user: { bannedAt: new Date() } });
        expect((await POST(request({ name: 'Key' }))).status).toBe(403);
    });
    it.each([{ name: '' }, { name: 'Key', scopes: ['admin'] }, { name: 'Key', expiresInDays: 366 },
        { name: 'Key', expiresInDays: 0 }, { name: 'Key', organizationId: 'foreign' }])('rejects invalid key settings %j', async body => {
        expect((await POST(request(body))).status).toBe(400);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('rejects malformed JSON and cross-origin mutations', async () => {
        expect((await POST(new Request('http://localhost/api/settings/publishing-keys', { method: 'POST', body: '{' }))).status).toBe(400);
        expect((await POST(new Request('http://localhost/api/settings/publishing-keys', {
            method: 'POST', headers: { Origin: 'https://foreign.example' }, body: '{}',
        }))).status).toBe(403);
    });
    it('revokes only active keys in the current workspace and audits revocation', async () => {
        expect((await DELETE(request({ id: 'key1' }, 'DELETE'))).status).toBe(200);
        expect(mocks.revoke).toHaveBeenCalledWith({ where: { id: 'key1', organizationId: 'org1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
        expect(mocks.activity).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'revoked', resourceId: 'key1' }) });
        mocks.revoke.mockResolvedValueOnce({ count: 0 });
        expect((await DELETE(request({ id: 'foreign' }, 'DELETE'))).status).toBe(404);
    });
});
