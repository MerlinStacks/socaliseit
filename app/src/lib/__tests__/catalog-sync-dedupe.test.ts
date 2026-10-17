// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ shops: vi.fn(), importMeta: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { shopConnection: { findMany: mocks.shops } } }));
vi.mock('@/lib/meta-catalog-import', () => ({ importMetaCatalog: mocks.importMeta }));
vi.mock('@/lib/api/pinterest-commerce', () => ({}));
vi.mock('@/lib/api/tiktok-commerce', () => ({}));
import { syncAllCatalogs } from '../catalog-sync';

beforeEach(() => {
    vi.resetAllMocks();
    mocks.importMeta.mockResolvedValue({ success: true, synced: 2, failed: 0, errors: [] });
});
describe('shared Meta catalog imports', () => {
    it('downloads a shared catalog once for sync-all, returning the result for both platforms', async () => {
        mocks.shops.mockResolvedValue([{ platform: 'FACEBOOK', catalogId: 'shared' }, { platform: 'INSTAGRAM', catalogId: 'shared' }]);
        const result = await syncAllCatalogs('org');
        expect(mocks.importMeta).toHaveBeenCalledExactlyOnceWith('org', 'FACEBOOK');
        expect(result.FACEBOOK).toEqual(result.INSTAGRAM);
        expect(mocks.shops).toHaveBeenCalledWith({ where: { organizationId: 'org', isActive: true } });
    });
    it('does not deduplicate different catalogs', async () => {
        mocks.shops.mockResolvedValue([{ platform: 'FACEBOOK', catalogId: 'one' }, { platform: 'INSTAGRAM', catalogId: 'two' }]);
        await syncAllCatalogs('org');
        expect(mocks.importMeta).toHaveBeenCalledTimes(2);
    });
});
