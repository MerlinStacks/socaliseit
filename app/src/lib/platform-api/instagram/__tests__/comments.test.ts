import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstagramComments } from '../comments';
import { metaJson } from '../../meta-fetch';

vi.mock('../../meta-fetch', () => ({ metaJson: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

const comment = (id: string) => ({ id, text: id, username: 'customer', timestamp: '2026-09-30T10:00:00Z' });

describe('Instagram comment thread pagination', () => {
    beforeEach(() => vi.resetAllMocks());

    it('keeps native replies attached across both reply and comment pages', async () => {
        vi.mocked(metaJson)
            .mockResolvedValueOnce({
                data: [{ ...comment('root'), replies: {
                    data: [comment('reply-1')], paging: { next: 'https://graph.facebook.com/replies-page-2' },
                } }],
                paging: { next: 'https://graph.facebook.com/comments-page-2' },
            })
            .mockResolvedValueOnce({ data: [{ ...comment('native-reply'), from: { id: 'our-account', username: 'shop' } }] })
            .mockResolvedValueOnce({ data: [{ ...comment('root-2'), replies: { data: [comment('reply-2')] } }] });

        const result = await getInstagramComments('token', 'media');
        expect(result.success).toBe(true);
        expect(result.data?.map(c => [c.platformCommentId, c.parentId])).toEqual([
            ['root', undefined], ['reply-1', 'root'], ['native-reply', 'root'],
            ['root-2', undefined], ['reply-2', 'root-2'],
        ]);
        expect(result.data?.find(c => c.platformCommentId === 'native-reply')?.authorId).toBe('our-account');
    });

    it('reports a failed reply page rather than claiming a complete thread sync', async () => {
        vi.mocked(metaJson)
            .mockResolvedValueOnce({ data: [{ ...comment('root'), replies: {
                data: [], paging: { next: 'https://graph.facebook.com/replies-page-2' },
            } }] })
            .mockResolvedValueOnce({ error: { message: 'Rate limited' } });
        expect(await getInstagramComments('token', 'media')).toEqual({ success: false, error: 'Rate limited' });
    });
});
