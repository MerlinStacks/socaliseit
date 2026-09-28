import { describe, expect, it, vi } from 'vitest';
import { getInstagramMentions } from '../instagram/hashtags';
import { metaJson } from '../meta-fetch';

vi.mock('../meta-fetch', () => ({ metaJson: vi.fn() }));
describe('Instagram mention failures', () => {
    it('reports a failed tags request rather than claiming an empty successful sync', async () => {
        vi.mocked(metaJson).mockResolvedValueOnce({ data: [] })
            .mockResolvedValueOnce({ error: { message: 'Rate limit reached' } });
        expect(await getInstagramMentions('token', 'account')).toEqual({
            success: false, error: 'Rate limit reached',
        });
    });
});
