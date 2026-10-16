import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAccount, PublishPayload } from '../../types';

const mocks = vi.hoisted(() => ({
    bluesky: vi.fn(), thread: vi.fn(), linkedin: vi.fn(),
    threadsImage: vi.fn(), threadsCarousel: vi.fn(),
}));
vi.mock('@/lib/platform-api/bluesky-api', () => ({ createBlueskyPost: mocks.bluesky, createBlueskyThread: mocks.thread }));
vi.mock('@/lib/platform-api/linkedin-api', () => ({ publishLinkedInPost: mocks.linkedin, publishLinkedInArticle: vi.fn() }));
vi.mock('@/lib/platform-api/threads-api', () => ({
    createThreadsImagePost: mocks.threadsImage, createThreadsCarouselPost: mocks.threadsCarousel,
    createThreadsTextPost: vi.fn(), createThreadsVideoPost: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { publishToBluesky } from '../bluesky';
import { publishToLinkedIn } from '../linkedin';
import { publishToThreads } from '../threads';

const account = { accountId: 'account', accessToken: 'token', accountName: 'name' } as PlatformAccount;
const payload = (overrides: Partial<PublishPayload> = {}): PublishPayload => ({
    caption: 'Caption', mediaUrls: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
    mediaType: 'carousel', postType: 'feed', altText: 'Fallback', altTexts: ['First image', 'Second image'],
    ...overrides,
});

beforeEach(() => {
    vi.resetAllMocks();
    mocks.bluesky.mockResolvedValue({ success: true, data: { uri: 'at://account/post/one' } });
    mocks.thread.mockResolvedValue({ success: true, data: { posts: [{ uri: 'at://account/post/one' }] } });
    mocks.linkedin.mockResolvedValue({ success: true, data: { id: 'one' } });
    // No published ID means no permalink fetch is needed for these handoff tests.
    mocks.threadsImage.mockResolvedValue({ success: true });
    mocks.threadsCarousel.mockResolvedValue({ success: true });
});

describe('publisher alt text handoffs', () => {
    it('passes per-image descriptions to Bluesky', async () => {
        await publishToBluesky(account, payload());
        expect(mocks.bluesky).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ images: [
            { url: 'https://example.com/one.jpg', alt: 'First image' },
            { url: 'https://example.com/two.jpg', alt: 'Second image' },
        ] }));
    });

    it.each(['Single paragraph', 'First paragraph\n\nSecond paragraph'])('preserves alt text for Bluesky thread caption %s', async caption => {
        await publishToBluesky(account, payload({ postType: 'thread', caption }));
        const sent = caption.includes('\n\n') ? mocks.thread.mock.calls[0][1][0] : mocks.bluesky.mock.calls[0][1];
        expect(sent.images.map((image: { alt: string }) => image.alt)).toEqual(['First image', 'Second image']);
    });

    it('forwards single and per-image descriptions to LinkedIn', async () => {
        await publishToLinkedIn(account, payload());
        expect(mocks.linkedin).toHaveBeenCalledWith('token', 'urn:li:person:account', expect.objectContaining({
            altText: 'Fallback', altTexts: ['First image', 'Second image'],
        }));
    });

    it('forwards per-image descriptions to Threads carousel children', async () => {
        await publishToThreads(account, payload());
        expect(mocks.threadsCarousel.mock.calls[0][3]).toEqual([
            { type: 'IMAGE', url: 'https://example.com/one.jpg', altText: 'First image' },
            { type: 'IMAGE', url: 'https://example.com/two.jpg', altText: 'Second image' },
        ]);
    });

    it('forwards single image alt text to Threads', async () => {
        await publishToThreads(account, payload({ mediaUrls: ['https://example.com/one.jpg'], mediaType: 'image' }));
        expect(mocks.threadsImage.mock.calls[0][4]).toMatchObject({ altText: 'Fallback' });
    });
});
