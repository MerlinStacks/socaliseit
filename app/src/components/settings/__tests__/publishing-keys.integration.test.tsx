import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { PublishingKeys } from '../publishing-keys';

function settings() {
    return render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false,
            revalidateOnFocus: false, revalidateOnReconnect: false }}>
            <PublishingKeys organizationId="org1" />
        </SWRConfig>,
    );
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('publishing keys with real SWR requests', () => {
    it('reaches and revokes an active key older than 100 historical keys', async () => {
        let revoked = false;
        const fetch = vi.fn(async (url: string, init?: RequestInit) => {
            if (init?.method === 'DELETE') {
                expect(JSON.parse(init.body as string)).toEqual({ id: 'old-active' });
                revoked = true;
                return Response.json({ success: true });
            }
            if (url.includes('cursor=key100')) return Response.json({ keys: [{ id: 'old-active', name: 'Old active integration',
                keyPrefix: 'osp_old', scopes: ['read'], expiresAt: '2099-01-01', revokedAt: revoked ? '2026-10-31' : null }], nextCursor: null });
            return Response.json({ keys: Array.from({ length: 100 }, (_, index) => ({
                id: `key${index + 1}`, name: `Historical integration ${index + 1}`, keyPrefix: 'osp_history', scopes: ['read'],
                expiresAt: '2099-01-01', revokedAt: '2026-10-01',
            })), nextCursor: 'key100' });
        });
        vi.stubGlobal('fetch', fetch);
        settings();
        fireEvent.click(await screen.findByRole('button', { name: 'Next keys' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Revoke Old active integration' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Revoke Old active integration' })).toBeNull());
        expect(revoked).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Previous keys' }));
        await screen.findByText('Historical integration 1');
    });

    it('retains the one-time secret after a real post-create revalidation error', async () => {
        let issued = false;
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'POST') {
                issued = true;
                return Response.json({ key: 'osp_copy_before_leaving' }, { status: 201 });
            }
            return issued ? Response.json({ error: 'Metadata temporarily unavailable' }, { status: 503 })
                : Response.json({ keys: [], nextCursor: null });
        }));
        settings();
        fireEvent.change(await screen.findByLabelText('Integration name'), { target: { value: 'Integration' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
        await waitFor(() => expect(screen.getAllByRole('alert').some(alert =>
            alert.textContent?.includes('Metadata temporarily unavailable'))).toBe(true));
        expect((screen.getByLabelText('New publishing API key') as HTMLTextAreaElement).value).toBe('osp_copy_before_leaving');
        fireEvent.click(screen.getByRole('button', { name: 'I’ve saved the key' }));
        expect(screen.queryByLabelText('New publishing API key')).toBeNull();
    });
});
