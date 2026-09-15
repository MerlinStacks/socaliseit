import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { ensureValidToken } from '@/lib/services/token-service';
import { getGoogleBusinessAnalytics } from '@/lib/platform-api/google-business-api';
import { getInstagramPostAnalytics } from '@/lib/platform-api/instagram-api';
import {
    syncPlatformAnalytics,
    syncPostAnalytics,
    syncSingleAccountAnalytics,
    syncSinglePostAnalytics,
} from '../platform-analytics-sync';

vi.mock('@/lib/db', () => ({ db: {
    socialAccount: { findMany: vi.fn(), findUnique: vi.fn() },
    platformAnalytics: { findFirst: vi.fn(), upsert: vi.fn() },
    post: { findMany: vi.fn(), findFirst: vi.fn() },
    postAnalytics: { upsert: vi.fn() },
} }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: vi.fn() }));
vi.mock('@/lib/platform-api/google-business-api', () => ({ getGoogleBusinessAnalytics: vi.fn() }));
vi.mock('@/lib/platform-api/instagram-api', () => ({ getInstagramPostAnalytics: vi.fn() }));
vi.mock('@/lib/platform-api/facebook-api', () => ({}));
vi.mock('@/lib/platform-api/tiktok-api', () => ({}));
vi.mock('@/lib/platform-api/youtube-api', () => ({}));
vi.mock('@/lib/platform-api/pinterest-api', () => ({}));
vi.mock('@/lib/platform-api/threads-api', () => ({}));

const account = {
    id: 'gbp-account', organizationId: 'org-1', platform: 'GOOGLE_BUSINESS',
    platformId: 'locations/123', isActive: true,
};
const post = {
    id: 'gbp-post', organizationId: 'org-1', platform: 'GOOGLE_BUSINESS',
    platformPostId: 'locations/123/localPosts/456', postType: 'FEED',
    socialAccountId: account.id, socialAccount: account, status: 'PUBLISHED',
};
const accountMetrics = {
    followers: 0, followersChange: 0, following: 0, impressions: 150, reach: 100,
    profileViews: 80, websiteClicks: 12, emailClicks: 0, engagementRate: 0,
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ensureValidToken).mockResolvedValue({ success: true, accessToken: 'valid-token' });
    vi.mocked(db.platformAnalytics.findFirst).mockResolvedValue(null);
    vi.mocked(getGoogleBusinessAnalytics).mockResolvedValue({ success: true, data: accountMetrics });
});

describe('Google Business analytics support', () => {
    it.each(['batch', 'single'])('excludes GBP from the %s post query', async (mode) => {
        vi.mocked(db.post.findMany).mockResolvedValue([]);
        vi.mocked(db.post.findFirst).mockResolvedValue(null);

        if (mode === 'batch') {
            expect(await syncPostAnalytics('org-1')).toEqual([]);
        } else {
            expect(await syncSinglePostAnalytics('org-1', post.id)).toMatchObject({ success: false, skipped: true });
        }

        const query = mode === 'batch'
            ? vi.mocked(db.post.findMany).mock.calls[0][0]
            : vi.mocked(db.post.findFirst).mock.calls[0][0];
        expect(query).toMatchObject({ where: { platform: { in: [
            'INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'PINTEREST', 'THREADS',
        ] } } });
        expect(ensureValidToken).not.toHaveBeenCalled();
        expect(db.postAnalytics.upsert).not.toHaveBeenCalled();
    });

    it.each(['batch', 'single'])('guards GBP posts before token sync in %s even if returned by the query', async (mode) => {
        vi.mocked(db.post.findMany).mockResolvedValue([post] as never);
        vi.mocked(db.post.findFirst).mockResolvedValue(post as never);

        const result = mode === 'batch'
            ? (await syncPostAnalytics('org-1'))[0]
            : await syncSinglePostAnalytics('org-1', post.id);

        expect(result).toEqual({
            id: post.id, platform: 'GOOGLE_BUSINESS', success: false,
            skipped: true, error: 'Unsupported platform',
        });
        expect(ensureValidToken).not.toHaveBeenCalled();
        expect(getGoogleBusinessAnalytics).not.toHaveBeenCalled();
        expect(db.postAnalytics.upsert).not.toHaveBeenCalled();
        expect(db.platformAnalytics.upsert).not.toHaveBeenCalled();
    });

    it.each(['batch', 'single'])('continues syncing GBP account metrics through %s sync', async (mode) => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([account] as never);
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account as never);

        if (mode === 'batch') {
            expect(await syncPlatformAnalytics('org-1')).toEqual({ accountsSynced: 1, accountsSkipped: 0, errors: [] });
        } else {
            expect(await syncSingleAccountAnalytics(account.id)).toEqual({ success: true, platform: 'GOOGLE_BUSINESS' });
        }

        expect(ensureValidToken).toHaveBeenCalledExactlyOnceWith(account.id);
        expect(getGoogleBusinessAnalytics).toHaveBeenCalledExactlyOnceWith('valid-token', account.platformId);
        expect(db.platformAnalytics.upsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            create: expect.objectContaining({ socialAccountId: account.id, ...accountMetrics }),
            update: expect.objectContaining(accountMetrics),
        }));
        expect(db.postAnalytics.upsert).not.toHaveBeenCalled();
    });

    it.each(['batch', 'single'])('continues syncing supported posts through %s sync', async (mode) => {
        const instagramPost = {
            ...post, id: 'instagram-post', platform: 'INSTAGRAM', platformPostId: 'media-123',
            socialAccount: { ...account, id: 'instagram-account', platform: 'INSTAGRAM' },
        };
        const metrics = { impressions: 100, reach: 80, likes: 10, comments: 2, shares: 3, saves: 4, clicks: 0, engagementRate: 15 };
        vi.mocked(db.post.findMany).mockResolvedValue([post, instagramPost] as never);
        vi.mocked(db.post.findFirst).mockResolvedValue(instagramPost as never);
        vi.mocked(getInstagramPostAnalytics).mockResolvedValue({ success: true, data: metrics });

        const result = mode === 'batch'
            ? (await syncPostAnalytics('org-1'))[1]
            : await syncSinglePostAnalytics('org-1', instagramPost.id);

        expect(result).toEqual({ id: instagramPost.id, platform: 'INSTAGRAM', success: true });
        expect(ensureValidToken).toHaveBeenCalledExactlyOnceWith('instagram-account');
        expect(getInstagramPostAnalytics).toHaveBeenCalledExactlyOnceWith('valid-token', 'media-123');
        expect(db.postAnalytics.upsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            where: { postId: instagramPost.id },
            create: expect.objectContaining(metrics),
            update: expect.objectContaining(metrics),
        }));
    });
});
