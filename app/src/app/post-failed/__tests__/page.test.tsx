import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PostFailedPage from '../page';
import { getPublishingStatus } from '@/lib/publishing-status';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('postId=post'), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/client-logger', () => ({ clientLogger: { error: vi.fn() } }));
let post: { id: string; status: string; caption: string; publishing: ReturnType<typeof getPublishingStatus> };
const fetchMock = vi.fn();
beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    post = { id: 'post', status: 'failed', caption: 'Hello', publishing: getPublishingStatus({ status: 'FAILED' }, 'VIDEO_TRANSCODE_MISSING') };
    fetchMock.mockImplementation(async (url: string, options?: { method: string }) => ({
        ok: true, json: async () => options?.method === 'PATCH' ? { status: 'scheduled' } : url.endsWith('/errors') ? [] : post,
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('publishing recovery page', () => {
    it('offers a safe retry and calls the existing PATCH action', async () => {
        render(<PostFailedPage />);
        const retry = await screen.findByRole('button', { name: 'Retry Publishing' });
        expect((retry as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(retry);
        await screen.findByText('✅ Post queued for retry!');
        expect(fetchMock).toHaveBeenCalledWith('/api/posts/post', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ action: 'retry' }) }));
        expect(screen.getByText('Queued does not mean published. Refresh to check progress.')).toBeTruthy();
    });
    it('blocks retry and manual posting while platform confirmation is pending', async () => {
        post.status = 'publishing';
        post.publishing = getPublishingStatus({ status: 'PUBLISHING', platformPostId: 'ig_pending:123' });
        render(<PostFailedPage />);
        await screen.findByRole('heading', { name: 'Awaiting platform confirmation' });
        expect((screen.getByRole('button', { name: 'Retry Publishing' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Post Manually' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Refresh status' })).toBeTruthy();
    });
    it('shows server conflict messages without claiming the retry was queued', async () => {
        fetchMock.mockImplementation(async (url: string, options?: { method: string }) => ({
            ok: options?.method !== 'PATCH',
            json: async () => options?.method === 'PATCH' ? { error: 'Post status changed. Refresh before retrying.' } : url.endsWith('/errors') ? [] : post,
        }));
        render(<PostFailedPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Retry Publishing' }));
        await waitFor(() => expect(screen.getByText('Post status changed. Refresh before retrying.')).toBeTruthy());
        expect(screen.queryByText('✅ Post queued for retry!')).toBeNull();
    });
});
