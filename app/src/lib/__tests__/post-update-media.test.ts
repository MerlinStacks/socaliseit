// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleUpdatePost } from '@/app/api/posts/[id]/post-handlers';

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(), update: vi.fn(), deleteMedia: vi.fn(), createMedia: vi.fn(),
    activity: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {
    post: { findUnique: mocks.findUnique },
    activity: { create: mocks.activity },
    $transaction: mocks.transaction,
} }));
vi.mock('@/lib/queue', () => ({
    reschedulePost: vi.fn(), retryFailedPost: vi.fn(), schedulePublishReminder: vi.fn(),
    cancelPublishReminder: vi.fn(), schedulePost: vi.fn(),
}));
vi.mock('@/lib/publishing-status', () => ({
    getPublishingStatus: vi.fn(), PublishingConflictError: class extends Error {},
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/cache', () => ({ invalidatePostCaches: vi.fn() }));
vi.mock('@/lib/services/platform-analytics-sync', () => ({ syncSinglePostAnalytics: vi.fn() }));
vi.mock('@/lib/schedule-conflicts', () => ({
    findDuplicatePlatforms: vi.fn(), findScheduleConflict: vi.fn(), formatScheduleConflictError: vi.fn(),
}));

const ctx = { id: 'post-1', organizationId: 'org-1', userId: 'user-1', userName: 'Test' };
const existing = {
    ...ctx, caption: 'Existing post', status: 'DRAFT', scheduledAt: null,
    autoPublish: false, socialAccountId: 'google-account', platform: 'GOOGLE_BUSINESS',
    postType: 'FEED', customMediaIds: ['original'],
};

beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUnique.mockResolvedValue({ ...existing });
    mocks.update.mockImplementation(async ({ data }) => ({ id: ctx.id, ...data }));
    mocks.transaction.mockImplementation(async callback => callback({
        post: { update: mocks.update },
        postMedia: { deleteMany: mocks.deleteMedia, create: mocks.createMedia },
    }));
});

function expectSavedMedia(ids: string[]) {
    expect(mocks.update).toHaveBeenCalledWith({
        where: { id: ctx.id }, data: expect.objectContaining({ customMediaIds: ids }),
    });
    expect(mocks.deleteMedia).toHaveBeenCalledExactlyOnceWith({ where: { postId: ctx.id } });
    expect(mocks.createMedia.mock.calls).toEqual(ids.map((mediaId, order) => [{
        data: { postId: ctx.id, mediaId, order },
    }]));
}

describe('existing post platform media persistence', () => {
    it.each(['GOOGLE_BUSINESS', 'FACEBOOK', 'LINKEDIN'])('saves %s derivatives instead of original media', async platform => {
        mocks.findUnique.mockResolvedValue({ ...existing, platform });
        const response = await handleUpdatePost(ctx, {
            mediaIds: ['original'],
            platformSettings: {
                'other-account': { mediaIds: ['wrong-account-image'] },
                'google-account': { mediaIds: ['landscape-crop', 'second-crop'] },
            },
        });

        expect(response.status).toBe(200);
        expectSavedMedia(['landscape-crop', 'second-crop']);
    });

    it('accepts account media without top-level media IDs', async () => {
        await handleUpdatePost(ctx, {
            platformSettings: { 'google-account': { mediaIds: ['landscape-crop'] } },
        });
        expectSavedMedia(['landscape-crop']);
    });

    it('falls back to top-level media when the account has no override', async () => {
        await handleUpdatePost(ctx, {
            mediaIds: ['replacement'], platformSettings: { 'google-account': { postType: 'feed' } },
        });
        expectSavedMedia(['replacement']);
    });

    it.each([
        {},
        { mediaIds: [] },
        { mediaIds: ['original'], platformSettings: { 'google-account': { mediaIds: [] } } },
    ])('preserves existing media for omitted or empty media payloads: %j', async body => {
        await handleUpdatePost(ctx, body);
        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: ctx.id }, data: expect.objectContaining({ customMediaIds: ['original'] }),
        });
        expect(mocks.deleteMedia).not.toHaveBeenCalled();
        expect(mocks.createMedia).not.toHaveBeenCalled();
    });

    it('does not modify published posts', async () => {
        mocks.findUnique.mockResolvedValue({ ...existing, status: 'PUBLISHED' });
        const response = await handleUpdatePost(ctx, {
            platformSettings: { 'google-account': { mediaIds: ['landscape-crop'] } },
        });
        expect(response.status).toBe(400);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});
