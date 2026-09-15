import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), sync: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { post: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/queue', () => ({}));
vi.mock('@/lib/cache', () => ({ invalidatePostCaches: vi.fn() }));
vi.mock('@/lib/services/platform-analytics-sync', () => ({ syncSinglePostAnalytics: mocks.sync }));
vi.mock('@/lib/schedule-conflicts', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

import { handleGetPost } from '../post-handlers';

const ctx = { id: 'post', organizationId: 'org', userId: 'user', userName: 'User' };
const post = {
    id: 'post', organizationId: 'org', platform: 'TIKTOK', status: 'PUBLISHED',
    platformPostId: null, externalId: 'tiktok_pending:publish-123', socialAccountId: 'account',
    caption: 'Hello', postType: 'REEL', createdAt: new Date(), updatedAt: new Date(),
    media: [], hashtags: [], errors: [], analytics: null,
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.sync.mockResolvedValue({ success: false, skipped: true });
});

describe('post detail TikTok recovery gate', () => {
    it('attempts on-demand recovery for an externalId-only pending marker', async () => {
        mocks.findUnique.mockResolvedValue(post);
        expect((await handleGetPost(ctx)).status).toBe(200);
        expect(mocks.sync).toHaveBeenCalledExactlyOnceWith('org', 'post');
    });

    it.each([{ organizationId: 'other' }, { status: 'DRAFT' }, { externalId: null }])('does not recover an ineligible post %j', async (override) => {
        mocks.findUnique.mockResolvedValue({ ...post, ...override });
        await handleGetPost(ctx);
        expect(mocks.sync).not.toHaveBeenCalled();
    });
});
