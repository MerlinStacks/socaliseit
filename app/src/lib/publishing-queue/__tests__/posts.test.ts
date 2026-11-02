// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
const m = vi.hoisted(() => ({ create: vi.fn(), source: vi.fn(), mediaCount: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/post-creation', () => ({ createPosts: m.create }));
vi.mock('@/lib/db', () => ({ db: { $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({
    post: { findFirst: m.source, updateMany: m.update }, media: { count: m.mediaCount },
}) } }));
import { createQueueDraft, cloneQueueDraft, placementPostId } from '../posts';

beforeEach(() => {
    vi.clearAllMocks(); m.mediaCount.mockResolvedValue(1); m.create.mockResolvedValue({ posts: [{ id: 'clone' }] });
});

it('uses one stable, collision-resistant identity per bulk row/account', () => {
    expect(placementPostId('row', 'account')).toBe(placementPostId('row', 'account'));
    expect(placementPostId('row', 'account')).not.toBe(placementPostId('row', 'other'));
    expect(placementPostId('a:b', 'c')).not.toBe(placementPostId('a', 'b:c'));
});

it('rejects missing creative before creating or scheduling any post', async () => {
    m.mediaCount.mockResolvedValue(0);
    const tx = { media: { count: m.mediaCount } } as unknown as Prisma.TransactionClient;
    await expect(createQueueDraft(tx, { organizationId: 'org', userId: 'user', userName: 'Member', platformAccountIds: ['a'], mediaIds: ['removed'] }, 'id')).rejects.toThrow(/Required media/);
    expect(m.create).not.toHaveBeenCalled();
});

it('clones composer metadata through validated draft creation rather than raw post writes', async () => {
    m.source.mockResolvedValue({ id: 'original', caption: 'Hello', linkedGroupId: 'group', pillarId: null,
        firstComment: 'A useful link', videoTitle: 'Full title', boardId: 'board', postType: 'VIDEO',
        media: [{ mediaId: 'asset', customThumbnailUrl: '/thumb.jpg' }],
        hashtags: [{ hashtag: { tag: 'launch' } }], productTags: [],
    });
    await cloneQueueDraft('org', 'original', 'target', 'user');
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({
        autoPublish: false, scheduledAt: null, mediaIds: ['asset'], hashtags: ['launch'],
        platformSettings: { target: expect.objectContaining({ firstComment: 'A useful link', videoTitle: 'Full title', boardId: 'board', customThumbnails: { asset: '/thumb.jpg' } }) },
    }), expect.objectContaining({ transaction: expect.any(Object), postId: expect.any(String) }));
});
