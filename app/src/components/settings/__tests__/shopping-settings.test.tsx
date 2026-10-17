import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('@/lib/api-error', () => ({ showErrorToast: vi.fn() }));
import { ShoppingSettings } from '../shopping-settings';

const fetchMock = vi.fn();
const shared = { catalogId: 'shared', name: 'Shared Shop', syncStatus: 'SYNCED', lastSyncAt: null, lastSyncError: null };
beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes('/sync')
        ? { result: { success: true } }
        : url.includes('/available') ? { shops: [{ id: 'shared', name: 'Shared Shop' }] }
        : { shops: [{ ...shared, id: 'ig', platform: 'INSTAGRAM' }, { ...shared, id: 'fb', platform: 'FACEBOOK' }] },
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('shared Meta catalog settings', () => {
    it('renders one catalog and one import action for Facebook and Instagram', async () => {
        render(<ShoppingSettings />);
        expect(await screen.findByText('Meta (Facebook & Instagram)')).toBeTruthy();
        expect(screen.getAllByText('Shared Shop')).toHaveLength(1);
        const buttons = screen.getAllByRole('button', { name: 'Import Products' });
        expect(buttons).toHaveLength(1);
        fireEvent.click(buttons[0]);
        await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/commerce/sync')).toHaveLength(1));
    });

    it('offers shared Meta discovery rather than separate platform imports', async () => {
        render(<ShoppingSettings />);
        fireEvent.click(screen.getByRole('button', { name: 'Connect Shop' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/commerce/shops/available?platform=META', expect.anything()));
        expect(screen.getByRole('option', { name: 'Meta Catalog (Facebook & Instagram)' })).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'Instagram Shop' })).toBeNull();
    });
});
