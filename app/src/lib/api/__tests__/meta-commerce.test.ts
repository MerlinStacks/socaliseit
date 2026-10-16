// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/platform-api/meta-fetch', () => ({ metaJson: vi.fn(), metaFetch: vi.fn() }));

import { metaJson } from '@/lib/platform-api/meta-fetch';
import { fetchMetaCatalogs } from '../meta-commerce';

const graph = vi.mocked(metaJson);
const shop = { id: 'catalog', name: 'Existing Instagram Shop' };

beforeEach(() => {
    vi.resetAllMocks();
    graph.mockResolvedValue({ data: [] });
});

describe('Meta catalog discovery', () => {
    it('finds Instagram catalogs even when user-only edges reject a Page token', async () => {
        graph.mockImplementation(async (_token, url) => url.includes('/ig/available_catalogs')
            ? { data: [shop] }
            : { error: { code: 100 } });
        expect(await fetchMetaCatalogs('page-token', { platform: 'INSTAGRAM', platformId: 'ig' })).toEqual([shop]);
        expect(graph).toHaveBeenCalledWith('page-token', expect.stringContaining('/ig/available_catalogs?'));
    });

    it('does not report permission failures as an empty catalog list', async () => {
        graph.mockResolvedValue({ error: { code: 200 } });
        await expect(fetchMetaCatalogs('token')).rejects.toThrow('catalog access could not be verified');
    });

    it('does not report transport failures as an empty catalog list', async () => {
        graph.mockRejectedValue(new Error('Network unavailable'));
        await expect(fetchMetaCatalogs('token')).rejects.toThrow('catalog access could not be verified');
    });

    it('returns an empty list when discovery succeeds without catalogs', async () => {
        expect(await fetchMetaCatalogs('token')).toEqual([]);
    });

    it('discovers shared business catalogs and deduplicates catalogs across sources', async () => {
        graph.mockImplementation(async (_token, url) => {
            const path = new URL(url).pathname;
            if (path.endsWith('/me/businesses')) return { data: [{ id: 'biz', name: 'Business' }] };
            if (path.endsWith('/me/accounts')) return { data: [{ id: 'page', name: 'Page' }] };
            if (path.endsWith('/client_product_catalogs') || path.endsWith('/page/product_catalogs')) return { data: [shop] };
            return { data: [] };
        });
        expect(await fetchMetaCatalogs('token')).toEqual([shop]);
        expect(graph).toHaveBeenCalledWith('token', expect.stringContaining('/biz/client_product_catalogs?'));
    });

    it('paginates catalog edges using cursors, not upstream next URLs', async () => {
        graph.mockImplementation(async (_token, url) => {
            const parsed = new URL(url);
            if (!parsed.pathname.endsWith('/ig/available_catalogs')) return { data: [] };
            if (parsed.searchParams.get('after') === 'second') return { data: [{ id: 'second', name: 'Second' }] };
            return { data: [shop], paging: { next: 'https://untrusted.example/', cursors: { after: 'second' } } };
        });
        expect(await fetchMetaCatalogs('token', { platform: 'INSTAGRAM', platformId: 'ig' })).toEqual([shop, { id: 'second', name: 'Second' }]);
        expect(graph.mock.calls.every(([, url]) => !url.includes('untrusted.example'))).toBe(true);
    });
});
