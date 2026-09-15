import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { ensureValidToken } from '../token-service';
import { checkPublishStatus, getTikTokVideoAnalytics } from '@/lib/platform-api/tiktok-api';
import { syncSinglePostAnalytics } from '../platform-analytics-sync';

const tx = vi.hoisted(() => ({ post: { findFirst: vi.fn(), updateMany: vi.fn() } }));
vi.mock('@/lib/db', () => ({ db: {
    post: { findFirst: vi.fn() }, postAnalytics: { upsert: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(tx)),
} }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/platform-api/tiktok-api', () => ({ checkPublishStatus: vi.fn(), getTikTokVideoAnalytics: vi.fn() }));
vi.mock('@/lib/platform-api/instagram-api', () => ({}));
vi.mock('@/lib/platform-api/facebook-api', () => ({}));
vi.mock('@/lib/platform-api/youtube-api', () => ({}));
vi.mock('@/lib/platform-api/pinterest-api', () => ({}));
vi.mock('@/lib/platform-api/threads-api', () => ({}));
vi.mock('@/lib/platform-api/google-business-api', () => ({}));

const post = {
    id: 'post', organizationId: 'org', platform: 'TIKTOK', status: 'PUBLISHED',
    platformPostId: 'tiktok_pending:publish-123', externalId: null, postType: 'REEL',
    socialAccountId: 'account', socialAccount: { id: 'account', organizationId: 'org', isActive: true },
    publishedAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01'),
};
const publicId = '7460123456789012345';
const metrics = { impressions: 100, reach: 80, likes: 10, comments: 2, shares: 3, saves: 0, clicks: 0, videoViews: 100, engagementRate: 15 };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.post.findFirst).mockReset().mockResolvedValueOnce(post as never)
        .mockResolvedValue({ platformPostId: publicId } as never);
    vi.mocked(ensureValidToken).mockResolvedValue({ success: true, accessToken: 'valid-token' });
    vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: {
        status: 'PUBLISH_COMPLETE', publiclyAvailablePostId: [publicId],
    } });
    vi.mocked(getTikTokVideoAnalytics).mockResolvedValue({ success: true, data: [metrics] });
    tx.post.findFirst.mockResolvedValue(null);
    tx.post.updateMany.mockResolvedValue({ count: 1 });
});

describe('on-demand TikTok pending ID recovery', () => {
    it.each(['platformPostId', 'externalId'])('resolves an old published %s marker and persists metrics', async (field) => {
        vi.mocked(db.post.findFirst).mockReset()
            .mockResolvedValueOnce({ ...post, platformPostId: null, [field]: post.platformPostId } as never)
            .mockResolvedValueOnce({ platformPostId: publicId } as never);

        expect(await syncSinglePostAnalytics('org', 'post')).toEqual({ id: 'post', platform: 'TIKTOK', success: true });
        expect(ensureValidToken).toHaveBeenCalledExactlyOnceWith('account');
        expect(checkPublishStatus).toHaveBeenCalledExactlyOnceWith('valid-token', 'publish-123');
        expect(tx.post.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'post', organizationId: 'org', socialAccountId: 'account', status: 'PUBLISHED' }),
            data: expect.objectContaining({ platformPostId: publicId, publishedAt: post.publishedAt }),
        }));
        expect(db.post.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({
            id: 'post', organizationId: 'org', status: 'PUBLISHED',
            socialAccount: { is: { isActive: true, organizationId: 'org' } },
            OR: expect.arrayContaining([expect.objectContaining({ platform: 'TIKTOK' })]),
        }) }));
        expect(db.post.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({
            id: 'post', organizationId: 'org', platform: 'TIKTOK', socialAccountId: 'account', status: 'PUBLISHED',
        }) }));
        expect(getTikTokVideoAnalytics).toHaveBeenCalledExactlyOnceWith('valid-token', [publicId]);
        expect(db.postAnalytics.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { postId: 'post' }, create: expect.objectContaining(metrics), update: expect.objectContaining(metrics),
        }));
    });

    it.each(['PROCESSING_UPLOAD', 'FAILED', 'PUBLISH_COMPLETE'])('skips %s without a public ID', async (status) => {
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status } } as never);
        expect(await syncSinglePostAnalytics('org', 'post')).toMatchObject({ success: false, skipped: true });
        expect(getTikTokVideoAnalytics).not.toHaveBeenCalled();
        expect(db.postAnalytics.upsert).not.toHaveBeenCalled();
    });

    it('skips an unavailable status response', async () => {
        vi.mocked(checkPublishStatus).mockRejectedValue(new Error('Unavailable'));
        expect(await syncSinglePostAnalytics('org', 'post')).toMatchObject({ success: false, skipped: true });
        expect(getTikTokVideoAnalytics).not.toHaveBeenCalled();
        expect(db.postAnalytics.upsert).not.toHaveBeenCalled();
    });

    it('stops before reconciliation when token refresh fails', async () => {
        vi.mocked(ensureValidToken).mockResolvedValue({ success: false, error: 'Expired' });
        expect(await syncSinglePostAnalytics('org', 'post')).toMatchObject({ success: false, error: 'Token refresh failed' });
        expect(checkPublishStatus).not.toHaveBeenCalled();
        expect(getTikTokVideoAnalytics).not.toHaveBeenCalled();
        expect(db.postAnalytics.upsert).not.toHaveBeenCalled();
    });

    it('does not access a post outside the requested tenant', async () => {
        vi.mocked(db.post.findFirst).mockReset().mockResolvedValue(null);
        expect(await syncSinglePostAnalytics('other-org', 'post')).toMatchObject({ success: false, skipped: true });
        expect(db.post.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'other-org' }) }));
        expect(ensureValidToken).not.toHaveBeenCalled();
        expect(checkPublishStatus).not.toHaveBeenCalled();
        expect(db.postAnalytics.upsert).not.toHaveBeenCalled();
    });

    it.each([null, 'tiktok_pending:publish-123', 'publish-123'])('skips when the scoped reload has no numeric public ID (%s)', async (platformPostId) => {
        vi.mocked(db.post.findFirst).mockReset().mockResolvedValueOnce(post as never)
            .mockResolvedValueOnce(platformPostId === null ? null : { platformPostId } as never);
        expect(await syncSinglePostAnalytics('org', 'post')).toMatchObject({ success: false, skipped: true });
        expect(getTikTokVideoAnalytics).not.toHaveBeenCalled();
        expect(db.postAnalytics.upsert).not.toHaveBeenCalled();
    });
});
