import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstagramMentions } from '../instagram/hashtags';
import { metaJson } from '../meta-fetch';

vi.mock('../meta-fetch', () => ({ metaJson: vi.fn() }));
describe('Instagram mention polling', () => {
    beforeEach(() => vi.resetAllMocks());

    it('imports tagged media without calling the unsupported mentioned_media collection', async () => {
        vi.mocked(metaJson).mockImplementation(async (_token, url) => {
            if (new URL(url).pathname.endsWith('/tags')) {
                return { data: [{ id: 'media-1', username: 'creator', caption: 'Tagged post', timestamp: '2026-10-12T00:00:00Z' }] };
            }
            return { error: { message: 'Unknown path components: /mentioned_media' } };
        });

        expect(await getInstagramMentions('token', 'account')).toEqual({
            success: true,
            data: [expect.objectContaining({ platformPostId: 'media-1', type: 'tag', authorUsername: 'creator', text: 'Tagged post' })],
        });
        expect(metaJson).toHaveBeenCalledTimes(1);
    });

    it('reports a failed tags request rather than claiming an empty successful sync', async () => {
        vi.mocked(metaJson).mockResolvedValueOnce({ error: { message: 'Rate limit reached' } });
        expect(await getInstagramMentions('token', 'account')).toEqual({
            success: false, error: 'Rate limit reached',
        });
    });

    it('follows cursors and deduplicates overlapping pages', async () => {
        const item = { id: 'one', timestamp: '2026-10-12T00:00:00Z' };
        vi.mocked(metaJson).mockResolvedValueOnce({ data: [item], paging: { next: 'https://graph.facebook.com/next', cursors: { after: 'cursor+1' } } })
            .mockResolvedValueOnce({ data: [item, { ...item, id: 'two' }] });
        const result = await getInstagramMentions('token', 'account');
        expect(result.data?.map(item => item.platformPostId)).toEqual(['one', 'two']);
        expect(new URL(vi.mocked(metaJson).mock.calls[1][1]).searchParams.get('after')).toBe('cursor+1');
    });

    it('reports later-page failures rather than claiming complete success', async () => {
        vi.mocked(metaJson).mockResolvedValueOnce({ data: [], paging: { next: 'next', cursors: { after: 'cursor' } } })
            .mockResolvedValueOnce({ error: { message: 'Rate limit reached' } });
        expect(await getInstagramMentions('token', 'account')).toEqual({ success: false, error: 'Rate limit reached' });
    });

    it('stops repeated pagination cursors', async () => {
        vi.mocked(metaJson).mockResolvedValue({ data: [], paging: { next: 'next', cursors: { after: 'cursor' } } });
        expect(await getInstagramMentions('token', 'account')).toEqual({ success: false, error: 'Instagram tags pagination did not advance' });
        expect(metaJson).toHaveBeenCalledTimes(2);
    });
});
