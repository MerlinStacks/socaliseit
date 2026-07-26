import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { syncWorkspacePosts } from '@/lib/services/posts-sync-service';
import { getTikTokVideos } from '@/lib/platform-api/posts-sync';
import { syncPostAnalytics } from '@/lib/services/platform-analytics-sync';

vi.mock('@/lib/db', () => ({
    db: {
        socialAccount: { findMany: vi.fn(), update: vi.fn() },
        post: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
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
        vi.mocked(db.post.update).mockResolvedValue({} as never);

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
});
