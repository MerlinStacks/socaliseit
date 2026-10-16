import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAccount, PublishPayload } from '../../types';
const mocks = vi.hoisted(() => ({ feed: vi.fn(), trial: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/platform-api/instagram-api', () => ({ publishInstagramFeedPost: mocks.feed, publishTrialReel: mocks.trial }));
vi.mock('@/lib/platform-api/youtube-api', () => ({ uploadYouTubeVideo: mocks.upload }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { publishToInstagram } from '../instagram';
import { publishToYouTube } from '../youtube';
import { instagramTagFields } from '@/lib/platform-api/instagram/tag-fields';

const account = { accountId: 'account', accessToken: 'token' } as PlatformAccount;
const tags = [{ username: 'person', x: 0.2, y: 0.3, mediaIndex: 0 }];
const products = [{ platformProductId: 'product', productName: 'Mug', mediaIndex: 1, positionX: 0.4, positionY: 0.5 }];
const payload = (extra: Partial<PublishPayload> = {}): PublishPayload => ({ caption: 'Caption', mediaUrls: ['https://example.com/video.mp4'], mediaType: 'video', postType: 'feed',
    instagramShareToFeed: false, thumbnailUrl: 'https://example.com/cover.jpg', userTags: tags, productTags: products, ...extra });

beforeEach(() => {
    vi.resetAllMocks();
    mocks.feed.mockResolvedValue({ success: true, data: { id: 'ig' } });
    mocks.trial.mockResolvedValue({ success: true, data: { id: 'ig' } });
    mocks.upload.mockResolvedValue({ success: true, data: { videoId: 'yt', url: 'https://youtube.com/watch?v=yt' } });
});

describe('Instagram reach settings', () => {
    it.each(['feed', 'reel'] as const)('preserves false feed sharing, covers and tags for %s video', async postType => {
        await publishToInstagram(account, payload({ postType }));
        expect(mocks.feed.mock.calls[0][2]).toMatchObject({
            instagramShareToFeed: false, coverImageUrl: 'https://example.com/cover.jpg', userTags: tags, productTags: products,
        });
    });
    it('sends tags only to the selected carousel child and strips coordinates from video tags', () => {
        expect(instagramTagFields({ userTags: tags, productTags: products }, 0)).toEqual({ user_tags: [{ username: 'person', x: 0.2, y: 0.3 }] });
        expect(instagramTagFields({ userTags: tags, productTags: products }, 1)).toEqual({ product_tags: [{ product_id: 'product', x: 0.4, y: 0.5 }] });
        expect(instagramTagFields({ userTags: tags, productTags: products }, 0, true)).toEqual({ user_tags: [{ username: 'person' }] });
        expect(instagramTagFields({ userTags: tags, productTags: products }, 1, true)).toEqual({ product_tags: [{ product_id: 'product' }] });
    });
});

describe('YouTube reach settings', () => {
    it('keeps the chosen title and visibility, uploads captions, and applies playlist/like choices', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetcher);
        try {
            const track = { name: 'English', language: 'en', text: '1\n00:00:00,000 --> 00:00:02,000\nHello.' };
            const result = await publishToYouTube(account, payload({ postType: 'reel', videoTitle: 'My chosen title', youtubePrivacy: 'unlisted', subtitleTracks: [track], youtubePlaylist: 'playlist', createFirstLike: true }));
            expect(result.success).toBe(true);
            expect(mocks.upload.mock.calls[0][1]).toMatchObject({ title: 'My chosen title', privacyStatus: 'unlisted' });
            expect(fetcher).toHaveBeenCalledTimes(3);
            const [url, request] = fetcher.mock.calls[0];
            expect(url).toContain('/captions?uploadType=multipart&part=snippet');
            expect(request.body).toContain('"videoId":"yt"');
            expect(request.body).toContain(track.text);
            expect(request.headers.Authorization).toBe('Bearer token');
            expect(JSON.parse(fetcher.mock.calls[1][1].body).snippet.playlistId).toBe('playlist');
            expect(fetcher.mock.calls[2][0]).toContain('rating=like');
        } finally { vi.unstubAllGlobals(); }
    });
    it('retains upload success if post-upload captions fail, without re-uploading', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
        try {
            const result = await publishToYouTube(account, payload({ subtitleTracks: [{ name: 'English', language: 'en', text: 'Timed captions' }] }));
            expect(result).toMatchObject({ success: true, postId: 'yt', warnings: [expect.stringContaining('Subtitles')] });
            expect(mocks.upload).toHaveBeenCalledTimes(1);
        } finally { vi.unstubAllGlobals(); }
    });
});
