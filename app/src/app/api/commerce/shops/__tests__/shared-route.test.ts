// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), upsert: vi.fn(), transaction: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { shopConnection: { upsert: mocks.upsert, deleteMany: mocks.remove }, $transaction: mocks.transaction } }));
vi.mock('@/lib/logger', () => ({ createRouteLogger: () => ({ error: vi.fn() }) }));
import { POST, DELETE } from '../route';

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { currentOrganizationId: 'org' } });
    mocks.upsert.mockImplementation(async ({ create }) => create);
    mocks.transaction.mockImplementation(operations => Promise.all(operations));
});
describe('shared Meta shop connection', () => {
    it('connects a selected catalog to both platforms in one transaction', async () => {
        const response = await POST(new NextRequest('http://localhost/api/commerce/shops', { method: 'POST',
            body: JSON.stringify({ platform: 'META', catalogId: 'shared', name: 'Shop' }) }));
        expect(response.status).toBe(200);
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
        for (const platform of ['INSTAGRAM', 'FACEBOOK']) expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { organizationId_platform: { organizationId: 'org', platform } },
            create: { organizationId: 'org', platform, catalogId: 'shared', name: 'Shop' },
        }));
    });
    it('disconnects only the selected shared catalog in the current workspace', async () => {
        expect((await DELETE(new NextRequest('http://localhost/api/commerce/shops?platform=META&catalogId=shared'))).status).toBe(200);
        expect(mocks.remove).toHaveBeenCalledWith({ where: { organizationId: 'org', catalogId: 'shared', platform: { in: ['INSTAGRAM', 'FACEBOOK'] } } });
    });
    it('requires a catalog ID before disconnecting a shared catalog', async () => {
        expect((await DELETE(new NextRequest('http://localhost/api/commerce/shops?platform=META'))).status).toBe(400);
        expect(mocks.remove).not.toHaveBeenCalled();
    });
});
