import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateOrganizationModal } from './CreateOrganizationModal';

afterEach(() => vi.unstubAllGlobals());

function submit() {
    const onCreated = vi.fn();
    render(<CreateOrganizationModal onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Gift This' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ADMIN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Organization' }));
    return onCreated;
}

describe('CreateOrganizationModal', () => {
    it('submits ADMIN without the deprecated workspace limit', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        const onCreated = submit();

        await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            name: 'Gift This', slug: 'gift-this', tier: 'ADMIN', maxMembers: 5,
        });
        expect(screen.queryByText('Max Workspaces')).toBeNull();
    });

    it.each([
        [{ message: 'tier: Invalid option', error: 'Validation Error' }, 'tier: Invalid option'],
        [{ error: 'Authentication required' }, 'Authentication required'],
    ])('shows the API error instead of hiding it', async (body, message) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => body }));
        const onCreated = submit();

        expect(await screen.findByText(message)).toBeTruthy();
        expect(onCreated).not.toHaveBeenCalled();
    });

    it('handles non-JSON error responses', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false, json: async () => { throw new SyntaxError('Not JSON'); },
        }));
        submit();

        expect(await screen.findByText('Failed to create organization')).toBeTruthy();
    });
});
