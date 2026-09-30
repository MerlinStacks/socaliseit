import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, getComments } = vi.hoisted(() => ({
    db: { comment: { upsert: vi.fn(), findMany: vi.fn(), update: vi.fn() } },
    getComments: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('../instagram-api', () => ({ getInstagramComments: getComments }));
vi.mock('../facebook-api', () => ({ getFacebookComments: getComments }));
vi.mock('../tiktok-api', () => ({ getTikTokComments: vi.fn() }));
vi.mock('../youtube-api', () => ({ getYouTubeComments: vi.fn() }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { syncCommentsForPlatformPost } from '../comment-sync';

describe('comment thread reconciliation', () => {
    beforeEach(() => vi.resetAllMocks());

    it.each(['INSTAGRAM', 'FACEBOOK'] as const)('repairs existing orphan replies on %s even when fetched before the parent', async (platform) => {
        getComments.mockResolvedValue({ success: true, data: [
            { platformCommentId: 'native-reply', parentId: 'customer-comment', text: 'Our reply' },
            { platformCommentId: 'customer-comment', text: 'Customer question' },
        ] });
        db.comment.findMany.mockResolvedValue([
            { id: 'internal-reply', platformCommentId: 'native-reply', parentId: null },
            { id: 'internal-root', platformCommentId: 'customer-comment', parentId: null },
        ]);

        await expect(syncCommentsForPlatformPost(
            { id: 'account', organizationId: 'org', platform }, 'media', undefined, 'token',
        )).resolves.toEqual({ success: true, count: 2 });
        expect(db.comment.update).toHaveBeenCalledWith({
            where: { id: 'internal-reply' }, data: { parentId: 'internal-root' },
        });
        expect(db.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ socialAccountId: 'account' }),
        }));
    });
});
