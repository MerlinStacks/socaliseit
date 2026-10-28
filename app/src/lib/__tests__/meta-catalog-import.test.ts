// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ shop: vi.fn(), shops: vi.fn(), status: vi.fn(), accounts: vi.fn(),
    catalog: vi.fn(), product: vi.fn(), clear: vi.fn(), catalogUpdate: vi.fn(), transaction: vi.fn(),
    products: vi.fn(), decrypt: vi.fn(), connect: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {
    shopConnection: { findUnique: mocks.shop, findMany: mocks.shops, updateMany: mocks.status },
    socialAccount: { findMany: mocks.accounts }, productCatalog: { upsert: mocks.catalog },
    $transaction: mocks.transaction,
} }));
vi.mock('@/lib/token-encryption', () => ({ decryptToken: mocks.decrypt }));
vi.mock('@/lib/api/meta-commerce', () => ({ getMetaCatalogProducts: mocks.products }));
import { importMetaCatalog } from '../meta-catalog-import';
import { getPlatformProductId } from '@/components/compose/product-tagging-types';
import { instagramTagFields } from '@/lib/platform-api/instagram/tag-fields';
import { MetaCatalogError } from '@/lib/meta-catalog-error';

const shop = { isActive: true, catalogId: 'meta-catalog', platform: 'INSTAGRAM', name: 'Shared shop' };
const product = { id: 'graph-product', retailer_id: 'store-sku', name: 'Mug', price: 19.99, currency: 'AUD', image_url: 'https://example.com/mug.jpg', url: 'https://example.com/mug' };
beforeEach(() => {
    vi.resetAllMocks();
    mocks.shop.mockResolvedValue(shop);
    mocks.shops.mockResolvedValue([shop, { ...shop, platform: 'FACEBOOK' }]);
    mocks.accounts.mockResolvedValue([{ platform: 'INSTAGRAM', accessToken: 'encrypted' }]);
    mocks.decrypt.mockReturnValue('decrypted');
    mocks.products.mockResolvedValue([product]);
    mocks.catalog.mockResolvedValue({ id: 'local-catalog' });
    mocks.transaction.mockImplementation(async callback => callback({
        product: { upsert: mocks.product, updateMany: mocks.clear },
        productCatalog: { update: mocks.catalogUpdate }, shopConnection: { updateMany: mocks.status, upsert: mocks.connect, findMany: mocks.shops },
    }));
});

describe('read-only Meta catalog imports', () => {
    it('surfaces safe Meta error codes instead of hiding the failure behind reconnect advice', async () => {
        mocks.products.mockRejectedValue(new MetaCatalogError('Unable to read catalog (Meta code 10, subcode 123).', 10, 123));
        const result = await importMetaCatalog('org', 'INSTAGRAM');
        expect(result.errors[0]).toContain('Meta code 10, subcode 123');
        expect(mocks.clear).not.toHaveBeenCalled();
    });

    it('continues to another account if one encrypted token cannot be read', async () => {
        mocks.accounts.mockResolvedValue([{ platform: 'INSTAGRAM', accessToken: 'broken' }, { platform: 'FACEBOOK', accessToken: 'valid' }]);
        mocks.decrypt.mockImplementation(token => { if (token === 'broken') throw new Error('secret'); return token; });
        expect((await importMetaCatalog('org', 'INSTAGRAM')).success).toBe(true);
        expect(mocks.products).toHaveBeenCalledWith('meta-catalog', 'valid');
    });

    it('distinguishes database failures from catalog access failures', async () => {
        mocks.transaction.mockRejectedValue(new Error('Database failure with secret'));
        const result = await importMetaCatalog('org', 'INSTAGRAM');
        expect(result.errors[0]).toContain('saving products to the database failed');
        expect(JSON.stringify(result)).not.toContain('secret');
    });

    it('creates a local catalog without requiring Shopify or WooCommerce and uses Graph IDs for both shared mappings', async () => {
        expect(await importMetaCatalog('org', 'INSTAGRAM')).toEqual({ success: true, synced: 1, failed: 0, errors: [] });
        expect(mocks.products).toHaveBeenCalledWith('meta-catalog', 'decrypted');
        expect(mocks.catalog).toHaveBeenCalledWith({ where: { organizationId: 'org' }, update: {},
            create: { organizationId: 'org', source: 'META', externalId: 'meta-catalog' } });
        expect(mocks.product).toHaveBeenCalledWith(expect.objectContaining({
            where: { catalogId_externalId: { catalogId: 'local-catalog', externalId: 'meta:meta-catalog:graph-product' } },
            create: expect.objectContaining({ instagramProductId: 'graph-product', facebookProductId: 'graph-product', price: 19.99 }),
        }));
        expect(mocks.status).toHaveBeenLastCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organizationId: 'org', catalogId: 'meta-catalog', isActive: true }),
            data: expect.objectContaining({ syncStatus: 'SYNCED', lastSyncError: null }),
        }));
    });

    it('upserts deterministically on repeated imports instead of duplicating products', async () => {
        await importMetaCatalog('org', 'INSTAGRAM');
        await importMetaCatalog('org', 'INSTAGRAM');
        expect(mocks.product.mock.calls[0][0].where).toEqual(mocks.product.mock.calls[1][0].where);
    });

    it('connects the missing sibling on the same import but never overwrites an existing different catalog', async () => {
        await importMetaCatalog('org', 'INSTAGRAM');
        expect(mocks.connect).toHaveBeenCalledWith({
            where: { organizationId_platform: { organizationId: 'org', platform: 'FACEBOOK' } },
            create: { organizationId: 'org', platform: 'FACEBOOK', catalogId: 'meta-catalog', name: 'Shared shop' }, update: {},
        });
    });

    it('carries the imported Graph product ID through composer selection into native Instagram tags', async () => {
        await importMetaCatalog('org', 'INSTAGRAM');
        const imported = { id: 'local-product', ...mocks.product.mock.calls[0][0].create };
        const id = getPlatformProductId(imported, 'instagram')!;
        expect(id).toBe('graph-product');
        expect(instagramTagFields({ productTags: [{ platformProductId: id, productName: imported.name,
            mediaIndex: 0, positionX: 0.2, positionY: 0.3 }] }, 0)).toEqual({
            product_tags: [{ product_id: 'graph-product', x: 0.2, y: 0.3 }],
        });
    });

    it('does not assign Facebook IDs when the Facebook connection uses a different catalog', async () => {
        mocks.shops.mockResolvedValue([shop]);
        await importMetaCatalog('org', 'INSTAGRAM');
        expect(mocks.product.mock.calls[0][0].update).not.toHaveProperty('facebookProductId');
        expect(mocks.clear).toHaveBeenCalledWith({ where: { catalogId: 'local-catalog', externalId: { startsWith: 'meta:meta-catalog:' } }, data: { instagramProductId: null } });
    });

    it('tries another active workspace token without rediscovering or changing the selected catalog', async () => {
        mocks.accounts.mockResolvedValue([{ platform: 'INSTAGRAM', accessToken: 'first' }, { platform: 'FACEBOOK', accessToken: 'second' }]);
        mocks.decrypt.mockImplementation(token => token);
        mocks.products.mockRejectedValueOnce(new Error('Access denied')).mockResolvedValueOnce([product]);
        expect((await importMetaCatalog('org', 'INSTAGRAM')).success).toBe(true);
        expect(mocks.products.mock.calls).toEqual([['meta-catalog', 'first'], ['meta-catalog', 'second']]);
        expect(mocks.accounts).toHaveBeenCalledWith(expect.objectContaining({ where: {
            organizationId: 'org', isActive: true, platform: { in: ['INSTAGRAM', 'FACEBOOK'] },
        } }));
    });

    it('does not change products or clear mappings after a failed/partial download', async () => {
        mocks.products.mockRejectedValue(new Error('Page two failed with secret-token'));
        const result = await importMetaCatalog('org', 'INSTAGRAM');
        expect(result.success).toBe(false);
        expect(JSON.stringify(result)).not.toContain('secret-token');
        expect(mocks.catalog).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.clear).not.toHaveBeenCalled();
        expect(mocks.status).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'FAILED' }) }));
    });

    it('clears removed product mappings after a complete empty catalog import', async () => {
        mocks.products.mockResolvedValue([]);
        expect((await importMetaCatalog('org', 'INSTAGRAM')).success).toBe(true);
        expect(mocks.clear).toHaveBeenCalled();
        expect(mocks.product).not.toHaveBeenCalled();
    });

    it('fails without a connected shop', async () => {
        mocks.shop.mockResolvedValue(null);
        expect((await importMetaCatalog('org', 'INSTAGRAM')).success).toBe(false);
        expect(mocks.products).not.toHaveBeenCalled();
    });

    it('reports transaction failures without a false successful import count', async () => {
        mocks.transaction.mockRejectedValue(new Error('Database failure'));
        const result = await importMetaCatalog('org', 'INSTAGRAM');
        expect(result).toMatchObject({ success: false, synced: 0 });
        expect(mocks.status).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'FAILED' }) }));
    });
});
