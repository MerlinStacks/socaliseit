import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, reconcile } = vi.hoisted(() => ({
    db: {
        socialAccount: { findFirst: vi.fn() },
        post: { findFirst: vi.fn() },
        comment: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    },
    reconcile: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../webhook-idempotency', () => ({ extractWebhookEventId: () => null, checkAndMarkWebhook: vi.fn() }));
vi.mock('../platform-api/comment-sync', () => ({ syncCommentsForPlatformPost: reconcile }));
vi.mock('@/lib/services/inbox-notifications', () => ({ sendInboxNotifications: vi.fn() }));

import { processWebhook } from '../webhooks';

const change = (id: string, parentId?: string) => ({ field: 'comments', value: {
    id, text: 'Reply', media: { id: 'media' }, from: { id: 'shop', username: 'shop' },
    ...(parentId ? { parent_id: parentId } : {}),
} });
const payload = (changes: ReturnType<typeof change>[]) => ({ entry: [{ id: 'shop', changes }] });

describe('native comment reply webhooks', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.socialAccount.findFirst.mockResolvedValue({ id: 'account', organizationId: 'org' });
        db.post.findFirst.mockResolvedValue(null);
        db.comment.findUnique.mockResolvedValue(null);
        reconcile.mockResolvedValue({ success: true, count: 2 });
    });

    it('reconciles missing ancestry once per post after all webhook comments are saved', async () => {
        reconcile.mockImplementation(async () => {
            expect(db.comment.upsert).toHaveBeenCalledTimes(2);
            return { success: true };
        });
        await processWebhook('instagram.comments', payload([change('reply'), change('parent')]));
        expect(reconcile).toHaveBeenCalledExactlyOnceWith(
            { id: 'account', organizationId: 'org', platform: 'INSTAGRAM' }, 'media',
        );
    });

    it('uses explicit parent IDs with account and post scoping even if reconciliation fails', async () => {
        db.comment.findFirst.mockResolvedValue({ id: 'internal-parent' });
        reconcile.mockRejectedValue(new Error('Graph unavailable'));
        await expect(processWebhook('instagram.comments', payload([change('reply', 'parent')]))).resolves.toMatchObject({ success: true });
        expect(db.comment.findFirst).toHaveBeenCalledWith({
            where: { organizationId: 'org', socialAccountId: 'account', platformPostId: 'media', platformCommentId: 'parent' },
            select: { id: true },
        });
        expect(db.comment.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({ parentId: 'internal-parent' }),
            update: expect.objectContaining({ parentId: 'internal-parent' }),
        }));
    });

    it('does not reconcile Facebook reaction events', async () => {
        await processWebhook('facebook.feed', { entry: [{ id: 'shop', changes: [{ value: { item: 'reaction' } }] }] });
        expect(db.comment.upsert).not.toHaveBeenCalled();
        expect(reconcile).not.toHaveBeenCalled();
    });
});
