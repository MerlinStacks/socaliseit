import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { checkPublishStatus } from '@/lib/platform-api/tiktok-api';
import { reconcileTikTokPost, type PendingTikTokPost } from '../tiktok-pending';

vi.mock('@/lib/db', () => ({ db: {
    $transaction: vi.fn(), post: { findFirst: vi.fn(), updateMany: vi.fn() },
} }));
vi.mock('@/lib/platform-api/tiktok-api', () => ({ checkPublishStatus: vi.fn() }));

const post: PendingTikTokPost = {
    id: 'native', organizationId: 'org', socialAccountId: 'account', status: 'PUBLISHING',
    platformPostId: 'tiktok_pending:accepted', externalId: null,
    updatedAt: new Date('2026-01-01'), publishedAt: null,
};

describe('durable TikTok reconciliation', () => {
    beforeEach(() => {
        vi.resetAllMocks();
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

    it('leaves published legacy rows intact on status lookup failure', async () => {
        vi.mocked(checkPublishStatus).mockRejectedValue(new Error('network'));
        expect(await reconcileTikTokPost({ ...post, status: 'PUBLISHED' }, 'token')).toBe('unknown');
        expect(db.$transaction).not.toHaveBeenCalled();
    });
});
