import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { syncWorkspacePosts } from '@/lib/services/posts-sync-service';
import { getTikTokVideos } from '@/lib/platform-api/posts-sync';
import { syncPostAnalytics } from '@/lib/services/platform-analytics-sync';
import { checkPublishStatus } from '@/lib/platform-api/tiktok-api';

vi.mock('@/lib/db', () => ({
    db: {
        $transaction: vi.fn(),
        socialAccount: { findMany: vi.fn(), update: vi.fn() },
        post: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/platform-api/posts-sync', () => ({
    getInstagramMedia: vi.fn(),
    getInstagramStories: vi.fn(),
    getFacebookPagePosts: vi.fn(),
    getFacebookPageStories: vi.fn(),
    getTikTokVideos: vi.fn(),
    getYouTubeVideos: vi.fn(),
    getPinterestPins: vi.fn(),
}));

vi.mock('@/lib/services/platform-analytics-sync', () => ({ syncPostAnalytics: vi.fn() }));
vi.mock('@/lib/platform-api/tiktok-api', () => ({ checkPublishStatus: vi.fn() }));
vi.mock('@/lib/services/token-service', () => ({
    ensureValidToken: vi.fn().mockResolvedValue({ success: true, accessToken: 'token' }),
}));
vi.mock('@/lib/sync-platforms', () => ({
    isPlatformPostSyncSupported: (platform: string) => platform === 'TIKTOK',
    isPermanentTokenError: () => false,
}));

describe('syncWorkspacePosts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db));
        vi.mocked(db.post.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(db.post.findFirst).mockResolvedValue(null);
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'tiktok-1', organizationId: 'org-1', platform: 'TIKTOK', platformId: 'user-1' },
            { id: 'threads-1', organizationId: 'org-1', platform: 'THREADS', platformId: 'user-2' },
        ] as never);
        vi.mocked(db.post.findMany).mockResolvedValue([]);
        vi.mocked(getTikTokVideos).mockResolvedValue({
            success: true,
            data: [{
                externalId: 'video-1',
                platform: 'TIKTOK',
                caption: 'Caption',
                mediaType: 'VIDEO',
                permalink: 'https://tiktok.example/video-1',
                publishedAt: new Date('2026-01-01T00:00:00Z'),
            }],
        });
    });

    it('counts only the winning create as imported across repeated syncs', async () => {
        const uniqueConflict = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        vi.mocked(db.post.create)
            .mockResolvedValueOnce({} as never)
            .mockRejectedValueOnce(uniqueConflict);
        vi.mocked(db.post.updateMany).mockResolvedValue({ count: 1 });

        const first = await syncWorkspacePosts('org-1');
        const second = await syncWorkspacePosts('org-1');

        expect(first).toMatchObject({
            totalAccounts: 2,
            attemptedAccounts: 1,
            unsupportedAccounts: 1,
            failedAccounts: 0,
            totalPostsAttempted: 1,
            totalPostsImported: 1,
            totalPostsUpdated: 0,
        });
        expect(second).toMatchObject({
            totalPostsAttempted: 1,
            totalPostsImported: 0,
            totalPostsUpdated: 1,
        });
        expect(syncPostAnalytics).toHaveBeenCalledTimes(1);
    });

    it('resolves pending native uploads before importing the same authoritative ID', async () => {
        vi.mocked(getTikTokVideos).mockResolvedValue({ success: true, data: [{ externalId: '123', caption: 'different caption' }] } as never);
        vi.mocked(db.post.findMany)
            .mockResolvedValueOnce([{ id: 'native', organizationId: 'org-1', socialAccountId: 'tiktok-1', platformPostId: 'tiktok_pending:accepted', externalId: null, status: 'PUBLISHING', updatedAt: new Date(), publishedAt: null }] as never)
            .mockResolvedValueOnce([{ id: 'native', platformPostId: '123', externalId: '123' }] as never);
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PUBLISH_COMPLETE', publiclyAvailablePostId: ['123'] } });
        const result = await syncWorkspacePosts('org-1');
        expect(result.totalPostsImported).toBe(0);
        expect(result.totalPostsSkipped).toBe(1);
        expect(db.post.create).not.toHaveBeenCalled();
    });

    it('defers unmatched imports when accepted outcomes remain unknown', async () => {
        vi.mocked(db.post.findMany).mockResolvedValueOnce([{ platformPostId: 'tiktok_pending:accepted' }] as never);
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: false });
        await syncWorkspacePosts('org-1');
        expect(db.post.create).not.toHaveBeenCalled();
    });

    it('preserves an existing imported duplicate and skips another import', async () => {
        vi.mocked(db.post.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([
            { id: 'native', platformPostId: 'video-1', externalId: null },
        ] as never);
        vi.mocked(db.post.findFirst).mockResolvedValue({ id: 'imported' } as never);
        await syncWorkspacePosts('org-1');
        expect(db.post.create).not.toHaveBeenCalled();
        expect(db.post.delete).not.toHaveBeenCalled();
        expect(db.post.updateMany).not.toHaveBeenCalled();
        expect(db.$transaction).toHaveBeenCalled();
    });

    it('scopes native matching and conflict updates to the same account', async () => {
        vi.mocked(db.post.create).mockRejectedValueOnce(Object.assign(new Error('Unique'), { code: 'P2002' }));
        vi.mocked(db.post.updateMany).mockResolvedValue({ count: 0 });
        const result = await syncWorkspacePosts('org-1');
        for (const [query] of vi.mocked(db.post.findMany).mock.calls) {
            expect(query?.where).toMatchObject({ organizationId: 'org-1', socialAccountId: 'tiktok-1', platform: 'TIKTOK' });
        }
        expect(db.post.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
            organizationId: 'org-1', socialAccountId: 'tiktok-1', platform: 'TIKTOK', isExternal: true, externalId: 'video-1',
        } }));
        expect(result.totalPostsUpdated).toBe(0);
    });

    it('does not match another account\'s native row with the same platform ID', async () => {
        const otherAccountPost = { id: 'other-native', platformPostId: 'video-1', externalId: null };
        vi.mocked(db.post.findMany).mockImplementation(query => {
            // Simulate the database excluding the other account only when scoped.
            return Promise.resolve(query?.where?.OR || query?.where?.socialAccountId === 'tiktok-1'
                ? [] : [otherAccountPost]) as never;
        });
        vi.mocked(db.post.create).mockResolvedValueOnce({} as never);
        const result = await syncWorkspacePosts('org-1');
        expect(result.totalPostsImported).toBe(1);
        expect(db.post.updateMany).not.toHaveBeenCalled();
        expect(db.post.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
            organizationId: 'org-1', socialAccountId: 'tiktok-1', externalId: 'video-1',
        }) }));
    });
});
