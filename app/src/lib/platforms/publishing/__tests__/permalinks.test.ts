import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishToInstagram } from '../instagram';
import { publishToThreads } from '../threads';
import { publishInstagramFeedPost } from '@/lib/platform-api/instagram-api';
import * as threads from '@/lib/platform-api/threads-api';
import { metaFetch } from '@/lib/platform-api/meta-fetch';
import type { PlatformAccount, PublishPayload } from '../../types';

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/platform-api/instagram-api', () => ({ publishInstagramFeedPost: vi.fn() }));
vi.mock('@/lib/platform-api/meta-fetch', () => ({ metaFetch: vi.fn() }));
vi.mock('@/lib/platform-api/threads-api', () => ({
    createThreadsTextPost: vi.fn(), createThreadsImagePost: vi.fn(),
    createThreadsVideoPost: vi.fn(), createThreadsCarouselPost: vi.fn(),
}));
const account: PlatformAccount = {
    id: 'account', platform: 'threads', accountId: 'user', accountName: 'creator',
    accessToken: 'token', tokenExpiresAt: new Date(), isConnected: true,
};
const payload: PublishPayload = { caption: 'Hello', mediaUrls: [], mediaType: 'text', postType: 'feed' };
const fetchMock = vi.fn();
beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    for (const fn of [threads.createThreadsTextPost, threads.createThreadsImagePost,
        threads.createThreadsVideoPost, threads.createThreadsCarouselPost]) {
        vi.mocked(fn).mockResolvedValue({ success: true, data: { id: '123' } });
    }
});
afterEach(() => vi.unstubAllGlobals());

describe('publisher permalinks', () => {
    it.each([undefined, 'https://www.instagram.com/p/ShortCode/'])('never invents an Instagram shortcode (%s)', async permalink => {
        vi.mocked(publishInstagramFeedPost).mockResolvedValue({ success: true, data: { id: '123', permalink } });
        const result = await publishToInstagram({ ...account, platform: 'instagram' }, {
            ...payload, mediaType: 'image', mediaUrls: ['https://example.com/photo.jpg'],
        });
        expect(result).toEqual({ success: true, postId: '123', postUrl: permalink });
    });

    it.each([
        { mediaUrls: [] }, { mediaUrls: ['https://example.com/image.jpg'] },
        { mediaUrls: ['https://example.com/video.mp4'] },
        { mediaUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'] },
    ])('fetches the Threads permalink for $mediaUrls', async ({ mediaUrls }) => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ permalink: 'https://www.threads.net/@creator/post/Code' })));
        const result = await publishToThreads(account, { ...payload, mediaUrls });
        expect(result).toMatchObject({ success: true, postId: '123', postUrl: 'https://www.threads.net/@creator/post/Code' });
        expect(fetchMock).toHaveBeenCalledWith('https://graph.threads.net/v1.0/123?fields=permalink', expect.objectContaining({
            headers: { Authorization: 'Bearer token' },
        }));
    });

    it.each(['http', 'network', 'json'])('keeps Threads published when URL lookup fails: %s', async failure => {
        if (failure === 'network') fetchMock.mockRejectedValue(new Error('offline'));
        else fetchMock.mockResolvedValue(new Response(failure === 'json' ? 'invalid' : '{}', { status: failure === 'http' ? 403 : 200 }));
        expect(await publishToThreads(account, payload)).toEqual({ success: true, postId: '123', postUrl: undefined });
        expect(threads.createThreadsTextPost).toHaveBeenCalledTimes(1);
    });

    it('retrieves the permalink after publishing a pending Threads container', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'FINISHED' })))
            .mockResolvedValueOnce(new Response(JSON.stringify({ permalink: 'https://www.threads.net/@creator/post/Code' })));
        vi.mocked(metaFetch).mockResolvedValue(new Response(JSON.stringify({ id: '123' })));
        expect(await publishToThreads(account, { ...payload, threadsPendingContainerId: 'container' }))
            .toMatchObject({ success: true, postId: '123', postUrl: 'https://www.threads.net/@creator/post/Code' });
        expect(threads.createThreadsTextPost).not.toHaveBeenCalled();
    });

    it('does not report Threads success without a published ID', async () => {
        vi.mocked(threads.createThreadsTextPost).mockResolvedValue({ success: true });
        expect(await publishToThreads(account, payload)).toMatchObject({ success: false });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
