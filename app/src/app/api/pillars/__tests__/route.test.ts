// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), transaction: vi.fn(), list: vi.fn(), organization: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: {
    $transaction: mocks.transaction,
    contentPillar: { findMany: mocks.list },
    organization: { findUniqueOrThrow: mocks.organization },
} }));
import { DELETE, GET, PATCH, POST } from '../route';

const tx = {
    organization: { update: vi.fn() },
    contentPillar: {
        findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    activity: { create: vi.fn() },
};
const pillar = { id: 'pillar', name: 'Education', color: '#D4A574', createdBySeb: true };
const request = (method: string, body?: unknown, id = 'pillar') => new NextRequest(
    `http://localhost/api/pillars?id=${id}`,
    { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
);

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user', name: 'User', currentOrganizationId: 'org' } });
    mocks.transaction.mockImplementation(async fn => fn(tx));
    mocks.list.mockResolvedValue([{ ...pillar, _count: { posts: 4 } }]);
    mocks.organization.mockResolvedValue({ pillarsInitializedAt: null });
    tx.contentPillar.findFirst.mockResolvedValue(pillar);
    tx.contentPillar.findMany.mockResolvedValue([]);
    tx.contentPillar.create.mockResolvedValue({ ...pillar, createdBySeb: false });
    tx.contentPillar.update.mockResolvedValue({ ...pillar, name: 'Learning' });
    tx.contentPillar.delete.mockResolvedValue(pillar);
});

describe('workspace pillars API', () => {
    it('requires an active organization for every method', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'user' } });
        for (const response of [await GET(), await POST(request('POST', { name: 'New' })),
            await PATCH(request('PATCH', { name: 'New' })), await DELETE(request('DELETE'))]) {
            expect(response.status).toBe(401);
        }
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it('scopes GET and exposes Seb provenance and lifecycle eligibility', async () => {
        const response = await GET();
        expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org' } }));
        expect(mocks.organization).toHaveBeenCalledWith({ where: { id: 'org' }, select: { pillarsInitializedAt: true } });
        expect(await response.json()).toMatchObject({
            pillars: [{ createdBySeb: true, posts: 4, percentage: 100 }],
            initialization: { eligibleForStarterSet: false },
        });
        mocks.list.mockResolvedValue([]);
        expect((await (await GET()).json()).initialization.eligibleForStarterSet).toBe(true);
        mocks.organization.mockResolvedValue({ pillarsInitializedAt: new Date() });
        expect((await (await GET()).json()).initialization.eligibleForStarterSet).toBe(false);
    });

    it.each(['PATCH', 'DELETE'])('rejects missing or foreign IDs for %s without a pillar write', async method => {
        tx.contentPillar.findFirst.mockResolvedValue(null);
        const response = method === 'PATCH'
            ? await PATCH(request(method, { name: 'Changed' }, 'foreign'))
            : await DELETE(request(method, undefined, 'foreign'));
        expect(response.status).toBe(404);
        expect(tx.contentPillar.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'org' } });
        expect(tx.contentPillar.update).not.toHaveBeenCalled();
        expect(tx.contentPillar.delete).not.toHaveBeenCalled();
        expect(tx.activity.create).not.toHaveBeenCalled();
    });

    it('edits the scoped existing pillar, preserving its identity and Seb attribution', async () => {
        const response = await PATCH(request('PATCH', { name: '  Learning  ' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ id: 'pillar', name: 'Learning', createdBySeb: true });
        expect(tx.contentPillar.update).toHaveBeenCalledWith({
            where: { id: 'pillar', organizationId: 'org' }, data: { name: 'Learning' },
        });
        expect(tx.contentPillar.create).not.toHaveBeenCalled();
    });

    it('normalizes names and always creates manual pillars in the session tenant', async () => {
        expect((await POST(request('POST', { name: '  Brand   Stories  ' }))).status).toBe(201);
        expect(tx.contentPillar.create).toHaveBeenCalledWith({ data: {
            name: 'Brand Stories', color: '#D4A574', organizationId: 'org', createdBySeb: false,
        } });
    });

    it.each(['POST', 'PATCH'])('rejects case/whitespace duplicates for %s inside the transaction', async method => {
        tx.contentPillar.findMany.mockResolvedValue([{ id: 'other', name: '  BRAND   stories ' }]);
        const response = await (method === 'POST' ? POST : PATCH)(request(method, { name: 'brand stories' }));
        expect(response.status).toBe(400);
        expect(tx.contentPillar.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org' }, select: { id: true, name: true } });
        expect(tx.contentPillar.create).not.toHaveBeenCalled();
        expect(tx.contentPillar.update).not.toHaveBeenCalled();
    });

    it('allows keeping the current name during an edit', async () => {
        tx.contentPillar.findMany.mockResolvedValue([pillar]);
        expect((await PATCH(request('PATCH', { name: 'education' }))).status).toBe(200);
    });

    it.each([{}, { name: '   ' }, { name: 1 }, { name: 'Valid', color: 'red' },
        { name: 'Valid', organizationId: 'foreign' }, { name: 'Valid', createdBySeb: true },
        { name: 'Valid', description: [] }])('rejects invalid creation payload %j before locking', async body => {
        expect((await POST(request('POST', body))).status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('validates PATCH payloads, IDs, and malformed JSON before locking', async () => {
        expect((await PATCH(request('PATCH', {}))).status).toBe(400);
        expect((await PATCH(request('PATCH', { name: 'Valid' }, ''))).status).toBe(400);
        expect((await DELETE(request('DELETE', undefined, ''))).status).toBe(400);
        expect((await POST(new NextRequest('http://localhost/api/pillars', { method: 'POST', body: '{' }))).status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it.each(['POST', 'PATCH', 'DELETE'])('%s locks and marks the org before any pillar operation in the same transaction', async method => {
        await (method === 'POST' ? POST : method === 'PATCH' ? PATCH : DELETE)(request(method, method === 'DELETE' ? undefined : { name: 'Learning' }));
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
        expect(tx.organization.update).toHaveBeenCalledWith({ where: { id: 'org' }, data: { pillarsInitializedAt: expect.any(Date) } });
        const lockOrder = tx.organization.update.mock.invocationCallOrder[0];
        for (const operation of Object.values(tx.contentPillar)) {
            for (const order of operation.mock.invocationCallOrder) expect(order).toBeGreaterThan(lockOrder);
        }
        expect(tx.activity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org' }) }));
        if (method === 'DELETE') expect(tx.contentPillar.delete).toHaveBeenCalledWith({ where: { id: 'pillar', organizationId: 'org' } });
    });

    it.each(['POST', 'PATCH', 'DELETE'])('%s propagates mutation failure through the transaction for marker rollback', async method => {
        const failure = new Error('Database write failed');
        const write = method === 'POST' ? tx.contentPillar.create : method === 'PATCH' ? tx.contentPillar.update : tx.contentPillar.delete;
        write.mockRejectedValue(failure);
        const rolledBack = vi.fn();
        mocks.transaction.mockImplementation(async fn => {
            try { return await fn(tx); }
            catch (error) { rolledBack(error); throw error; }
        });
        await expect((method === 'POST' ? POST : method === 'PATCH' ? PATCH : DELETE)(request(method, method === 'DELETE' ? undefined : { name: 'Learning' }))).rejects.toThrow(failure);
        expect(tx.organization.update).toHaveBeenCalledTimes(1);
        expect(rolledBack).toHaveBeenCalledWith(failure);
        expect(tx.activity.create).not.toHaveBeenCalled();
    });

    it('does not mutate pillars when the organization marker cannot be written', async () => {
        tx.organization.update.mockRejectedValue(new Error('Organization update failed'));
        await expect(POST(request('POST', { name: 'New' }))).rejects.toThrow('Organization update failed');
        for (const operation of Object.values(tx.contentPillar)) expect(operation).not.toHaveBeenCalled();
        expect(tx.activity.create).not.toHaveBeenCalled();
    });

    it('rolls back the marker for rejected ownership and duplicate checks', async () => {
        const rolledBack = vi.fn();
        mocks.transaction.mockImplementation(async fn => {
            try { return await fn(tx); }
            catch (error) { rolledBack(); throw error; }
        });
        tx.contentPillar.findFirst.mockResolvedValue(null);
        expect((await DELETE(request('DELETE'))).status).toBe(404);
        tx.contentPillar.findMany.mockResolvedValue([pillar]);
        expect((await POST(request('POST', { name: 'Education' }))).status).toBe(400);
        expect(rolledBack).toHaveBeenCalledTimes(2);
    });
});
