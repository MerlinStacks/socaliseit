import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn(), add: vi.fn(), organization: vi.fn(), settings: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {
    media: { updateMany: mocks.update }, organization: { findUnique: mocks.organization }, globalAISettings: { findUnique: mocks.settings },
} }));
vi.mock('@/lib/bullmq/queues', () => ({ mediaTagQueue: { add: mocks.add } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
import { autoTagUpload, enqueueMediaTagging } from '../tag-queue';

describe('media tag queue', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.update.mockResolvedValue({ count: 1 });
        mocks.organization.mockResolvedValue({ mediaAutoTagEnabled: true });
        mocks.settings.mockResolvedValue({ isConfigured: true });
    });
    it('does not enqueue media already claimed by another request', async () => {
        mocks.update.mockResolvedValue({ count: 0 });
        expect(await enqueueMediaTagging('org', 'media')).toBe(false);
        expect(mocks.add).not.toHaveBeenCalled();
        expect(mocks.update.mock.calls[0][0].where).toMatchObject({ id: 'media', organizationId: 'org' });
    });
    it('records queue failure without failing the upload', async () => {
        mocks.add.mockRejectedValue(new Error('Redis down'));
        await expect(autoTagUpload('org', 'media', 'image/jpeg')).resolves.toBeUndefined();
        expect(mocks.update.mock.calls[1][0]).toMatchObject({
            where: { id: 'media', organizationId: 'org' }, data: { aiTagStatus: 'failed' },
        });
    });
    it('respects the workspace setting, provider availability and media type', async () => {
        mocks.organization.mockResolvedValueOnce({ mediaAutoTagEnabled: false });
        await autoTagUpload('org', 'media', 'image/jpeg');
        mocks.settings.mockResolvedValueOnce({ isConfigured: false });
        await autoTagUpload('org', 'media', 'video/mp4');
        await autoTagUpload('org', 'media', 'audio/mpeg');
        expect(mocks.add).not.toHaveBeenCalled();
    });
});
