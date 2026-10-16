import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishablePost } from '../publish-helpers';

const mocks = vi.hoisted(() => ({ generate: vi.fn(), update: vi.fn(), find: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { media: { updateMany: mocks.update, findFirst: mocks.find } } }));
vi.mock('@/lib/ai/generate-alt-text', () => ({ generateAltText: mocks.generate }));
import { ensurePublishAltText } from '../publish-alt-text';
import { buildPublishPayload } from '../publish-helpers';

const image = (id: string, altText: string | null = null, mimeType = 'image/jpeg') => ({
    media: { id, altText, mimeType, url: `/api/uploads/${id}.jpg` },
});
const post = (media = [image('one')], altText: string | null = null, platform = 'INSTAGRAM') => ({
    id: 'post', organizationId: 'org', caption: 'Post context', platform, altText, media,
}) as unknown as PublishablePost;

beforeEach(() => {
    vi.resetAllMocks();
    mocks.generate.mockImplementation(async (url: string) => `Description of ${url}`);
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.find.mockResolvedValue(null);
});

describe('automatic publishing alt text', () => {
    it('preserves media order and classifies a video-first mixed post as a carousel', () => {
        const value = post([image('video', null, 'video/mp4'), image('photo')]);
        const payload = buildPublishPayload(value);
        expect(payload.mediaType).toBe('carousel');
        expect(payload.mediaUrls).toEqual(['/api/uploads/video.jpg', '/api/uploads/photo.jpg']);
    });
    it('generates and persists a separate description per image, aligned with mixed media', async () => {
        const value = post([image('one'), image('video', null, 'video/mp4'), image('two')], '  ');
        await ensurePublishAltText(value);
        expect(mocks.generate).toHaveBeenCalledTimes(2);
        expect(mocks.generate).toHaveBeenCalledWith('/api/uploads/one.jpg', 'org', 'Post context');
        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: 'one', organizationId: 'org', altText: null },
            data: { altText: 'Description of /api/uploads/one.jpg' },
        });
        expect(buildPublishPayload(value)).toMatchObject({
            altText: 'Description of /api/uploads/one.jpg',
            altTexts: ['Description of /api/uploads/one.jpg', '', 'Description of /api/uploads/two.jpg'],
        });
    });

    it('preserves a manually supplied post description', async () => {
        const value = post([image('one'), image('two')], 'My description');
        await ensurePublishAltText(value);
        expect(mocks.generate).not.toHaveBeenCalled();
        expect(buildPublishPayload(value).altTexts).toEqual(['My description', 'My description']);
    });

    it('reuses saved media descriptions and only generates missing ones', async () => {
        const value = post([image('one', 'Saved description'), image('two', '  ')]);
        await ensurePublishAltText(value);
        expect(mocks.generate).toHaveBeenCalledTimes(1);
        expect(buildPublishPayload(value).altTexts[0]).toBe('Saved description');
    });

    it('uses a concurrent manual media edit instead of overwriting it', async () => {
        mocks.update.mockResolvedValue({ count: 0 });
        mocks.find.mockResolvedValue({ altText: 'Edited while generating' });
        const value = post();
        await ensurePublishAltText(value);
        expect(buildPublishPayload(value).altText).toBe('Edited while generating');
    });

    it.each(['YOUTUBE', 'TIKTOK', 'GOOGLE_BUSINESS', 'MANUAL'])('skips unsupported platform %s', async platform => {
        await ensurePublishAltText(post([image('one')], null, platform));
        expect(mocks.generate).not.toHaveBeenCalled();
    });

    it('skips text-only and video-only posts', async () => {
        await ensurePublishAltText(post([]));
        await ensurePublishAltText(post([image('video', null, 'video/mp4')]));
        expect(mocks.generate).not.toHaveBeenCalled();
    });

    it('fails before dispatch rather than silently publishing without alt text on AI failure', async () => {
        mocks.generate.mockRejectedValue(new Error('Provider unavailable'));
        await expect(ensurePublishAltText(post())).rejects.toThrow('Provider unavailable');
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
