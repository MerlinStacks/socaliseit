import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublishingKeys } from '../publishing-keys';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), fetch: vi.fn(), swr: vi.fn(),
    state: { error: null as Error | null, isLoading: false, nextCursor: null as string | null } }));
vi.mock('swr', () => ({ default: (key: unknown, fetcher: unknown) => {
    mocks.swr(key, fetcher);
    return {
        data: { keys: [
            { id: 'key1', name: 'Existing integration', keyPrefix: 'osp_1234', scopes: ['read'], expiresAt: '2099-01-01', revokedAt: null },
        ], nextCursor: mocks.state.nextCursor },
        error: mocks.state.error, isLoading: mocks.state.isLoading, mutate: mocks.mutate,
    };
} }));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.state.error = null;
    mocks.state.isLoading = false;
    mocks.state.nextCursor = null;
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ key: 'osp_new_secret' }) });
});

describe('publishing key settings', () => {
    it('creates an immediate-publishing key and only shows the secret until dismissed', async () => {
        render(<PublishingKeys organizationId="org1" />);
        fireEvent.change(screen.getByLabelText('Integration name'), { target: { value: 'My software' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
        expect((await screen.findByLabelText('New publishing API key') as HTMLTextAreaElement).value).toBe('osp_new_secret');
        expect(mocks.fetch).toHaveBeenCalledWith('/api/settings/publishing-keys', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ name: 'My software', scopes: ['read', 'publish'] }),
        }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
        fireEvent.click(screen.getByRole('button', { name: 'I’ve saved the key' }));
        expect(screen.queryByLabelText('New publishing API key')).toBeNull();
    });
    it('supports a read-only key without publish permission', async () => {
        render(<PublishingKeys organizationId="org1" />);
        fireEvent.change(screen.getByLabelText('Integration name'), { target: { value: 'Reader' } });
        fireEvent.click(screen.getByRole('checkbox', { name: /Read-only/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
        await screen.findByLabelText('New publishing API key');
        expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).scopes).toEqual(['read']);
    });
    it('revokes a key and refreshes the list', async () => {
        render(<PublishingKeys organizationId="org1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Revoke Existing integration' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
        expect(mocks.fetch).toHaveBeenCalledWith('/api/settings/publishing-keys', expect.objectContaining({ method: 'DELETE', body: '{"id":"key1"}' }));
    });
    it('only adds upload permission when explicitly enabled', async () => {
        render(<PublishingKeys organizationId="org1" />);
        fireEvent.change(screen.getByLabelText('Integration name'), { target: { value: 'Uploader' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'Allow media uploads' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
        await screen.findByLabelText('New publishing API key');
        expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).scopes).toEqual(['read', 'publish', 'upload']);
    });
    it('only adds the post management scope when explicitly enabled', async () => {
        render(<PublishingKeys organizationId="org1" />);
        fireEvent.change(screen.getByLabelText('Integration name'), { target: { value: 'Post manager' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'Allow drafts, scheduling, and editing' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
        await screen.findByLabelText('New publishing API key');
        expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).scopes).toEqual(['read', 'publish', 'manage_posts']);
    });
    it('hides management controls when the API denies access', () => {
        mocks.state.error = new Error('Workspace owner or admin required');
        render(<PublishingKeys organizationId="org1" />);
        expect(screen.getByRole('alert').textContent).toContain('Workspace owner or admin required');
        expect(screen.queryByRole('button', { name: 'Create API Key' })).toBeNull();
    });
    it.each(['error', 'loading'])('keeps the one-time secret visible during a list %s state', async state => {
        const view = render(<PublishingKeys organizationId="org1" />);
        fireEvent.change(screen.getByLabelText('Integration name'), { target: { value: 'Integration' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
        await screen.findByLabelText('New publishing API key');
        if (state === 'error') mocks.state.error = new Error('Could not load publishing keys');
        else mocks.state.isLoading = true;
        view.rerender(<PublishingKeys organizationId="org1" />);
        expect((screen.getByLabelText('New publishing API key') as HTMLTextAreaElement).value).toBe('osp_new_secret');
        fireEvent.click(screen.getByRole('button', { name: 'I’ve saved the key' }));
        expect(screen.queryByLabelText('New publishing API key')).toBeNull();
    });
    it('keeps the issued secret available when the post-create refresh rejects', async () => {
        mocks.mutate.mockImplementationOnce(async () => {
            mocks.state.error = new Error('List refresh failed');
            throw mocks.state.error;
        });
        render(<PublishingKeys organizationId="org1" />);
        fireEvent.change(screen.getByLabelText('Integration name'), { target: { value: 'Integration' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
        expect((await screen.findByLabelText('New publishing API key') as HTMLTextAreaElement).value).toBe('osp_new_secret');
        await waitFor(() => expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('List refresh failed'))).toBe(true));
    });
    it('uses workspace-scoped cursor pages and allows returning after a page load fails', async () => {
        mocks.state.nextCursor = 'key100';
        const view = render(<PublishingKeys organizationId="org1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Next keys' }));
        expect(screen.getByText('Page 2')).toBeDefined();
        const [key, fetcher] = mocks.swr.mock.lastCall!;
        expect(key).toEqual(['publishing-keys', 'org1', 'key100']);
        await fetcher(key);
        expect(mocks.fetch).toHaveBeenCalledWith('/api/settings/publishing-keys?cursor=key100', { cache: 'no-store' });

        mocks.state.error = new Error('Page load failed');
        view.rerender(<PublishingKeys organizationId="org1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Previous keys' }));
        expect(mocks.swr.mock.lastCall![0]).toEqual(['publishing-keys', 'org1', null]);
    });
    it('returns to the newest page after creating a key from an older page', async () => {
        mocks.state.nextCursor = 'key100';
        render(<PublishingKeys organizationId="org1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Next keys' }));
        fireEvent.change(screen.getByLabelText('Integration name'), { target: { value: 'Integration' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
        await screen.findByLabelText('New publishing API key');
        expect(mocks.swr.mock.lastCall![0]).toEqual(['publishing-keys', 'org1', null]);
    });
});
