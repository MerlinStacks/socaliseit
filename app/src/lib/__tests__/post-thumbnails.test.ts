import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({ mkdir: vi.fn(), write: vi.fn(), read: vi.fn(), find: vi.fn() }));
vi.mock('fs/promises', async importOriginal => {
    const actual = await importOriginal<typeof import('fs/promises')>();
    const mocked = { ...actual, mkdir: mocks.mkdir, writeFile: mocks.write, readFile: mocks.read };
    return { ...mocked, default: mocked };
});
vi.mock('@/lib/db', () => ({ db: { media: { findFirst: mocks.find } } }));
import { resolvePostThumbnails } from '../post-thumbnails';

beforeEach(() => vi.resetAllMocks());

describe('durable user-selected video covers', () => {
    it('turns a frame data URL into a scoped JPEG file and reusable public path', async () => {
        const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abc' } }).png().toBuffer();
        const result = await resolvePostThumbnails('org', { video: `data:image/png;base64,${png.toString('base64')}` });
        expect(result?.video).toMatch(/^\/api\/uploads\/thumbnails\/org\/[a-f0-9-]+\.jpg$/);
        expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining('/public/uploads/thumbnails/org/'), expect.any(Buffer));
        expect((await sharp(mocks.write.mock.calls[0][1]).metadata()).format).toBe('jpeg');
        await expect(resolvePostThumbnails('org', result)).resolves.toEqual(result);
        expect(mocks.write).toHaveBeenCalledTimes(1);
    });
    it('rejects external URLs, cross-organization paths, traversal and invalid image data', async () => {
        mocks.find.mockResolvedValue(null);
        for (const value of ['https://example.com/image.jpg', '/api/uploads/thumbnails/other/cover.jpg', '/api/uploads/thumbnails/org/../secret.jpg', 'data:image/png;base64,YmFk']) {
            await expect(resolvePostThumbnails('org', { video: value })).rejects.toThrow();
        }
        expect(mocks.write).not.toHaveBeenCalled();
    });
    it('preserves absence versus an explicit cleared cover', async () => {
        await expect(resolvePostThumbnails('org')).resolves.toBeUndefined();
        await expect(resolvePostThumbnails('org', { video: '' })).resolves.toEqual({ video: '' });
        expect(mocks.write).not.toHaveBeenCalled();
    });
});
