// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from '@/app/api/media/route';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), findMedia: vi.fn(), findLinks: vi.fn(), deleteLinks: vi.fn(),
    deleteMedia: vi.fn(), transaction: vi.fn(), unlink: vi.fn(), getJob: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: {
    media: { findMany: mocks.findMedia }, postMedia: { findMany: mocks.findLinks },
    $transaction: mocks.transaction,
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('fs/promises', () => ({ unlink: mocks.unlink, mkdir: vi.fn() }));
vi.mock('@/lib/media/thumbnail-generator', () => ({ generateVideoThumbnail: vi.fn() }));
vi.mock('@/lib/services/video-transcode', () => ({
    getVideoMetadata: vi.fn(), needsTranscoding: vi.fn(), isFFmpegAvailable: vi.fn(),
}));
vi.mock('@/lib/bullmq/queues', () => ({ videoTranscodeQueue: { getJob: mocks.getJob } }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), createRateLimitHeaders: vi.fn() }));
vi.mock('@/lib/media/image-hash', () => ({ computeImageHash: vi.fn() }));
vi.mock('@/lib/media/write-upload', () => ({ writeUpload: vi.fn() }));
vi.mock('@/lib/media/tag-queue', () => ({ autoTagUpload: vi.fn() }));

function request() {
    return new NextRequest('http://localhost/api/media', {
        method: 'DELETE', body: JSON.stringify({ ids: ['media', 'other-org-media'] }),
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'org' } });
    mocks.findMedia.mockResolvedValue([{
        id: 'media', url: '/api/uploads/original.mp4', thumbnailUrl: '/api/uploads/thumb.jpg',
        transcodedUrl: '/api/uploads/transcoded/video.mp4', transcodeStatus: 'completed',
        _count: { posts: 1 },
    }]);
    mocks.findLinks.mockResolvedValue([]);
    mocks.deleteMedia.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) => callback({
        postMedia: { deleteMany: mocks.deleteLinks }, media: { deleteMany: mocks.deleteMedia },
    }));
});

describe('media deletion', () => {
    it('detaches published links within the transaction before deletion and file cleanup', async () => {
        mocks.deleteLinks.mockImplementation(async () => {
            expect(mocks.deleteMedia).not.toHaveBeenCalled();
            expect(mocks.unlink).not.toHaveBeenCalled();
        });
        mocks.deleteMedia.mockImplementation(async () => {
            expect(mocks.unlink).not.toHaveBeenCalled();
            return { count: 1 };
        });
        const response = await DELETE(request());
        expect(await response.json()).toEqual({ success: true, deleted: 1 });
        expect(mocks.findMedia).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: { in: ['media', 'other-org-media'] }, organizationId: 'org' },
        }));
        expect(mocks.deleteLinks).toHaveBeenCalledWith({ where: {
            mediaId: { in: ['media'] }, media: { organizationId: 'org' },
            post: { organizationId: 'org', status: 'PUBLISHED' },
        } });
        expect(mocks.deleteMedia).toHaveBeenCalledWith({ where: {
            id: { in: ['media'] }, organizationId: 'org',
        } });
        expect(mocks.unlink).toHaveBeenCalledTimes(3);
    });

    it('blocks unpublished attachments without deleting any part of the batch', async () => {
        mocks.findLinks.mockResolvedValue([{ mediaId: 'media' }]);
        const response = await DELETE(request());
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual(expect.objectContaining({ blockedIds: ['media'] }));
        expect(mocks.findLinks).toHaveBeenCalledWith(expect.objectContaining({ where: {
            mediaId: { in: ['media'] }, post: { status: { not: 'PUBLISHED' } },
        } }));
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.unlink).not.toHaveBeenCalled();
    });

    it.each([
        [{ code: 'P2003' }, 409],
        [new Error('Database unavailable'), 500],
    ])('preserves files and jobs when database deletion fails (%j)', async (error, status) => {
        mocks.deleteMedia.mockRejectedValue(error);
        expect((await DELETE(request())).status).toBe(status);
        expect(mocks.unlink).not.toHaveBeenCalled();
        expect(mocks.getJob).not.toHaveBeenCalled();
    });
});
