import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrganizationDetailModal } from './OrganizationDetailModal';
import type { OrganizationDetail } from './types';

vi.mock('@/lib/client-logger', () => ({ clientLogger: { error: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

const organization: OrganizationDetail = {
    id: 'org-1', name: 'Gift This', slug: 'gift-this', tier: 'ADMIN', logo: null,
    maxMembers: 5, memberCount: 1, createdAt: '2026-01-01T00:00:00Z',
    members: [{
        id: 'member-1', role: 'MEMBER', joinedAt: '2026-01-01T00:00:00Z',
        user: { id: 'user-1', name: 'Existing User', email: 'existing@example.com', image: null },
    }],
};

function setup(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock);
    const callbacks = { onClose: vi.fn(), onUpdated: vi.fn(), onDeleted: vi.fn() };
    render(<OrganizationDetailModal organization={organization} loading={false} {...callbacks} />);
    return callbacks;
}

async function perform(action: string) {
    if (action === 'save') {
        fireEvent.click(screen.getByRole('button', { name: 'Edit organization' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    } else if (action === 'delete') {
        fireEvent.click(screen.getByRole('button', { name: 'Delete organization' }));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete' }));
    } else if (action === 'role') {
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ADMIN' } });
    } else if (action === 'remove') {
        fireEvent.click(screen.getByTitle('Remove member'));
    } else {
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        fireEvent.change(screen.getByPlaceholderText('Search users by name or email...'), { target: { value: 'New' } });
        fireEvent.click(await screen.findByRole('button', { name: /New User/ }));
    }
}

describe('OrganizationDetailModal', () => {
    it.each(['save', 'delete', 'role', 'remove', 'add'])('shows rejected %s requests without success callbacks', async (action) => {
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url.startsWith('/api/admin/users?')) return { ok: true, json: async () => ({ users: [
                { id: 'user-2', name: 'New User', email: 'new@example.com', image: null },
            ] }) };
            return { ok: false, json: async () => ({ message: 'Action denied by server' }) };
        });
        const callbacks = setup(fetchMock);
        await perform(action);

        expect((await screen.findByRole('alert')).textContent).toBe('Action denied by server');
        expect(callbacks.onUpdated).not.toHaveBeenCalled();
        expect(callbacks.onDeleted).not.toHaveBeenCalled();
    });

    it.each(['save', 'delete', 'role', 'remove'])('shows network errors for %s', async (action) => {
        setup(vi.fn().mockRejectedValue(new Error('Offline')));
        await perform(action);

        expect((await screen.findByRole('alert')).textContent).toMatch(/Failed to/);
    });

    it('submits only supported settings and removes workspace UI', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        const callbacks = setup(fetchMock);
        expect(screen.queryByText(/Workspaces/)).toBeNull();
        await perform('save');

        await waitFor(() => expect(callbacks.onUpdated).toHaveBeenCalledOnce());
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 'Gift This', tier: 'ADMIN', maxMembers: 5 });
        expect(screen.queryByText(/Workspaces/)).toBeNull();
    });
});
