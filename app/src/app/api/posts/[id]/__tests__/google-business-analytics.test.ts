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
    id: 'post', organizationId: 'org', platform: 'GOOGLE_BUSINESS',
    status: 'PUBLISHED', platformPostId: 'google-post', socialAccountId: 'account',
    caption: 'Hello', postType: 'FEED', createdAt: new Date(), updatedAt: new Date(),
    media: [], hashtags: [], errors: [],
};

beforeEach(() => vi.resetAllMocks());

describe('Google Business post detail analytics', () => {
    it.each([null, { impressions: 0 }, { impressions: 123 }])(
        'returns unavailable analytics and does not sync legacy data %j', async (analytics) => {
            mocks.findUnique.mockResolvedValue({ ...post, analytics });
            const response = await handleGetPost(ctx);
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ analytics: null });
            expect(mocks.sync).not.toHaveBeenCalled();
        },
    );

    it('still rejects posts belonging to another organization', async () => {
        mocks.findUnique.mockResolvedValue({ ...post, organizationId: 'other' });
        expect((await handleGetPost(ctx)).status).toBe(404);
        expect(mocks.sync).not.toHaveBeenCalled();
    });
});
