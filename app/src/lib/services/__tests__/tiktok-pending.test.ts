import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { checkPublishStatus } from '@/lib/platform-api/tiktok-api';
import { reconcileTikTokPost, type PendingTikTokPost } from '../tiktok-pending';
import { acquirePublishLock, releasePublishLock } from '@/lib/publish-lock';

vi.mock('@/lib/db', () => ({ db: {
    $transaction: vi.fn(), post: { findFirst: vi.fn(), updateMany: vi.fn() }, publishError: { create: vi.fn() },
} }));
vi.mock('@/lib/platform-api/tiktok-api', () => ({ checkPublishStatus: vi.fn() }));
vi.mock('@/lib/publish-lock', () => ({ acquirePublishLock: vi.fn(), releasePublishLock: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

const post: PendingTikTokPost = {
    id: 'native', organizationId: 'org', socialAccountId: 'account', status: 'PUBLISHING',
    platformPostId: 'tiktok_pending:accepted', externalId: null,
    updatedAt: new Date('2026-01-01'), publishedAt: null,
};

describe('durable TikTok reconciliation', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(acquirePublishLock).mockResolvedValue('lock-token');
        vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db));
        vi.mocked(db.post.findFirst).mockResolvedValue(null);
        vi.mocked(db.post.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PUBLISH_COMPLETE' } });
    });

    it.each([false, true])('keeps completed uploads published and recoverable (legacy=%s)', async legacy => {
        const source = legacy ? { ...post, status: 'PUBLISHED' as const, platformPostId: null, externalId: post.platformPostId } : post;
        expect(await reconcileTikTokPost(source, 'token')).toBe('completed');
        expect(checkPublishStatus).toHaveBeenCalledWith('token', 'accepted');
        expect(db.post.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organizationId: 'org', socialAccountId: 'account', updatedAt: post.updatedAt, status: source.status }),
            data: expect.objectContaining({ status: 'PUBLISHED', platformPostId: 'tiktok_pending:accepted' }),
        }));
    });

    it('resolves a numeric ID and preserves the known publication date', async () => {
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PUBLISH_COMPLETE', publiclyAvailablePostId: ['123'] } });
        expect(await reconcileTikTokPost({ ...post, publishedAt: post.updatedAt }, 'token')).toBe('resolved');
        expect(db.post.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: {
            status: 'PUBLISHED', publishedAt: post.updatedAt, platformPostId: '123', externalId: '123',
        } }));
    });

    it('safely preserves an existing imported unique-key owner transactionally', async () => {
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PUBLISH_COMPLETE', publiclyAvailablePostId: ['123'] } });
        vi.mocked(db.post.findFirst).mockResolvedValue({ id: 'imported' } as never);
        expect(await reconcileTikTokPost(post, 'token')).toBe('resolved');
        expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
        expect(db.post.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ platformPostId: '123', externalId: null }) }));
    });

    it('does not claim success when a concurrent edit wins', async () => {
        vi.mocked(db.post.updateMany).mockResolvedValue({ count: 0 });
        expect(await reconcileTikTokPost(post, 'token')).toBe('unknown');
    });

    it('expires an old zero-byte upload and archives its session ID for a fresh retry', async () => {
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PROCESSING_UPLOAD', uploadedBytes: 0 } });
        expect(await reconcileTikTokPost({ ...post, externalId: post.platformPostId }, 'token')).toBe('expired');
        expect(db.post.updateMany).toHaveBeenCalledWith({
            where: { id: 'native', organizationId: 'org', socialAccountId: 'account', platform: 'TIKTOK',
                status: 'PUBLISHING', updatedAt: post.updatedAt, platformPostId: post.platformPostId, externalId: post.platformPostId },
            data: { status: 'FAILED', platformPostId: null, externalId: null },
        });
        expect(db.publishError.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            postId: 'native', errorCode: 'TIKTOK_UPLOAD_EXPIRED', errorRaw: expect.stringContaining('accepted'),
        }) });
        expect(releasePublishLock).toHaveBeenCalledWith('native', 'lock-token');
    });

    it.each([
        { status: 'PROCESSING_UPLOAD', uploadedBytes: undefined },
        { status: 'PROCESSING_UPLOAD', uploadedBytes: 1 },
        { status: 'PROCESSING_DOWNLOAD', uploadedBytes: 0 },
        { status: 'PROCESSING', uploadedBytes: 0 },
    ])('does not expire an uncertain or nonempty upload: %j', async data => {
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data });
        expect(await reconcileTikTokPost(post, 'token')).toBe('pending');
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('does not expire a recent upload or a post already marked published', async () => {
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PROCESSING_UPLOAD', uploadedBytes: 0 } });
        expect(await reconcileTikTokPost({ ...post, updatedAt: new Date() }, 'token')).toBe('pending');
        expect(await reconcileTikTokPost({ ...post, status: 'PUBLISHED' }, 'token')).toBe('pending');
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('does not expire an upload while a publisher holds the lock', async () => {
        vi.mocked(acquirePublishLock).mockResolvedValue(null);
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PROCESSING_UPLOAD', uploadedBytes: 0 } });
        expect(await reconcileTikTokPost(post, 'token')).toBe('pending');
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('does not archive an upload when the snapshot changed', async () => {
        vi.mocked(db.post.updateMany).mockResolvedValue({ count: 0 });
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PROCESSING_UPLOAD', uploadedBytes: 0 } });
        expect(await reconcileTikTokPost(post, 'token')).toBe('unknown');
        expect(db.publishError.create).not.toHaveBeenCalled();
        expect(releasePublishLock).toHaveBeenCalledWith('native', 'lock-token');
    });

    it('leaves published legacy rows intact on status lookup failure', async () => {
        vi.mocked(checkPublishStatus).mockRejectedValue(new Error('network'));
        expect(await reconcileTikTokPost({ ...post, status: 'PUBLISHED' }, 'token')).toBe('unknown');
        expect(db.$transaction).not.toHaveBeenCalled();
    });
});
