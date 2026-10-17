// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), sync: vi.fn(), syncAll: vi.fn(), catalog: vi.fn(), products: vi.fn(), shop: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/catalog-sync', () => ({ syncCatalogToPlatform: mocks.sync, syncAllCatalogs: mocks.syncAll }));
vi.mock('@/lib/logger', () => ({ createRouteLogger: () => ({ error: vi.fn() }) }));
vi.mock('@/lib/db', () => ({ db: {
    productCatalog: { findUnique: mocks.catalog }, product: { findMany: mocks.products },
    shopConnection: { findUnique: mocks.shop },
} }));
import { POST } from '../sync/route';
import { GET } from '../products/route';
const syncRequest = (platform: string) => new NextRequest('http://localhost/api/commerce/sync', {
    method: 'POST', body: JSON.stringify({ platform }),
});
const searchRequest = () => new NextRequest('http://localhost/api/commerce/products?platform=instagram&q=mug');

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { currentOrganizationId: 'org' } });
    mocks.catalog.mockResolvedValue({ id: 'catalog' });
    mocks.shop.mockResolvedValue({ isActive: true, catalogId: 'selected-meta' });
    mocks.products.mockResolvedValue([]);
});

describe('commerce import routes', () => {
    it('reports failed imports as failures, not HTTP success', async () => {
        mocks.sync.mockResolvedValue({ success: false, synced: 0, failed: 0, errors: ['Import failed'] });
        const response = await POST(syncRequest('INSTAGRAM'));
        expect(response.status).toBe(502);
        expect((await response.json()).success).toBe(false);
        expect(mocks.sync).toHaveBeenCalledWith('org', 'INSTAGRAM');
    });

    it('rejects unsupported sync platforms', async () => {
        expect((await POST(syncRequest('BOGUS'))).status).toBe(400);
        expect(mocks.sync).not.toHaveBeenCalled();
    });

    it('uses the catalog-deduplicating service when importing all connections', async () => {
        mocks.syncAll.mockResolvedValue({ INSTAGRAM: { success: true }, FACEBOOK: { success: true } });
        const response = await POST(new NextRequest('http://localhost/api/commerce/sync', { method: 'POST', body: '{}' }));
        expect(response.status).toBe(200);
        expect(mocks.syncAll).toHaveBeenCalledWith('org');
        expect(mocks.sync).not.toHaveBeenCalled();
    });

    it('only offers products mapped to the active catalog, scoped to the workspace', async () => {
        await GET(searchRequest());
        expect(mocks.catalog).toHaveBeenCalledWith({ where: { organizationId: 'org' } });
        expect(mocks.shop).toHaveBeenCalledWith({ where: { organizationId_platform: { organizationId: 'org', platform: 'INSTAGRAM' } } });
        expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({ where: {
            catalogId: 'catalog', isActive: true, NOT: { instagramProductId: null },
            OR: [{ name: { contains: 'mug', mode: 'insensitive' } }, { description: { contains: 'mug', mode: 'insensitive' } }],
            AND: [{ OR: [{ externalId: { startsWith: 'meta:selected-meta:' } }, { NOT: { externalId: { startsWith: 'meta:' } } }] }],
        } }));
    });

    it('does not offer disconnected shop products', async () => {
        mocks.shop.mockResolvedValue(null);
        expect(await (await GET(searchRequest())).json()).toEqual({ products: [] });
        expect(mocks.products).not.toHaveBeenCalled();
    });

    it('requires authentication for imports and product searches', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await POST(syncRequest('INSTAGRAM'))).status).toBe(401);
        expect((await GET(searchRequest())).status).toBe(401);
        expect(mocks.catalog).not.toHaveBeenCalled();
        expect(mocks.sync).not.toHaveBeenCalled();
    });
});
