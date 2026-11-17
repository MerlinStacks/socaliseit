import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrganizationsPage from './page';

vi.mock('@/lib/client-logger', () => ({ clientLogger: { error: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

describe('OrganizationsPage', () => {
    it('supports the ADMIN filter and does not render obsolete workspace counts', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({
            organizations: [{ id: 'org-1', name: 'Gift This', slug: 'gift-this', tier: 'ADMIN',
                maxMembers: 5, memberCount: 1, createdAt: '2026-01-01T00:00:00Z' }],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }) }));
        vi.stubGlobal('fetch', fetchMock);
        render(<OrganizationsPage />);

        expect(await screen.findByText('Gift This')).toBeTruthy();
        expect(screen.queryByRole('columnheader', { name: 'Workspaces' })).toBeNull();
        expect(screen.getAllByRole('columnheader')).toHaveLength(4);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ADMIN' } });
        await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/organizations?page=1&limit=20&tier=ADMIN'));
    });
});
