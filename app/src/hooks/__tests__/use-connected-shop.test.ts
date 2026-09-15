import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useConnectedShop } from '../use-connected-shop';

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));
vi.mock('next-auth/react', () => ({ useSession: vi.fn() }));

const shop = { platform: 'INSTAGRAM', isActive: true, catalogId: 'catalog-1' };

function setShops(shops: unknown[], isError = false) {
    vi.mocked(useQuery).mockReturnValue({ data: { shops }, isError } as ReturnType<typeof useQuery>);
}

describe('useConnectedShop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useSession).mockReturnValue({
            data: { user: { currentOrganizationId: 'org-1' } }, status: 'authenticated',
        } as ReturnType<typeof useSession>);
        setShops([]);
    });

    it('hides tagging without a shop or while loading', () => {
        expect(useConnectedShop('instagram')).toBe(false);
        vi.mocked(useQuery).mockReturnValue({ data: undefined, isError: false } as ReturnType<typeof useQuery>);
        expect(useConnectedShop('instagram')).toBe(false);
    });

    it('enables tagging only for the connected platform', () => {
        setShops([shop]);
        expect(useConnectedShop('instagram')).toBe(true);
        expect(useConnectedShop('facebook')).toBe(false);
    });

    it.each([
        { ...shop, isActive: false },
        { ...shop, catalogId: '' },
        { ...shop, catalogId: '  ' },
    ])('hides tagging for an inactive or unconfigured shop: %j', (connection) => {
        setShops([connection]);
        expect(useConnectedShop('instagram')).toBe(false);
    });

    it('fails closed on errors even with previously cached connections', () => {
        setShops([shop], true);
        expect(useConnectedShop('instagram')).toBe(false);
    });

    it('scopes the query to the current workspace', () => {
        useConnectedShop('instagram');
        expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
            queryKey: ['commerce-shops', 'org-1'], enabled: true,
        }));
        vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated' } as ReturnType<typeof useSession>);
        setShops([shop]);
        expect(useConnectedShop('instagram')).toBe(false);
        expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
            queryKey: ['commerce-shops', undefined], enabled: false,
        }));
    });
});
