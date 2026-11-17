import { beforeEach, describe, expect, it, vi } from 'vitest';
import { metaFetch } from '../meta-fetch';
import { getThreadsMediaInsights, getThreadsUserInsights } from '../threads-api';

vi.mock('../meta-fetch', () => ({ metaFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

describe('Threads insights', () => {
    beforeEach(() => vi.resetAllMocks());

    it('reads followers from user insights and sums daily view values', async () => {
        vi.mocked(metaFetch).mockResolvedValue(Response.json({ data: [
            { name: 'followers_count', total_value: { value: 23 } },
            { name: 'views', values: [{ value: 10 }, { value: 20 }] },
            { name: 'likes', total_value: { value: 3 } },
        ] }));
        const result = await getThreadsUserInsights('token', 'user');
        expect(result).toMatchObject({ success: true, data: { followers: 23, impressions: 30, engagementRate: 10 } });
        expect(metaFetch).toHaveBeenCalledExactlyOnceWith('token', expect.stringContaining('/user/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count'));
    });

    it('uses the media insights edge', async () => {
        vi.mocked(metaFetch).mockResolvedValue(Response.json({ data: [{ name: 'views', values: [{ value: 42 }] }] }));
        expect(await getThreadsMediaInsights('token', 'post')).toMatchObject({ success: true, data: { impressions: 42 } });
        expect(metaFetch).toHaveBeenCalledWith('token', expect.stringContaining('/post/insights?'));
    });

    it.each([getThreadsUserInsights, getThreadsMediaInsights])('preserves API failures rather than storing zero metrics', async fetchInsights => {
        vi.mocked(metaFetch).mockResolvedValue(Response.json({ error: { message: 'Missing permission' } }, { status: 403 }));
        expect(await fetchInsights('token', 'id')).toEqual({ success: false, error: 'Missing permission' });
    });

    it.each([getThreadsUserInsights, getThreadsMediaInsights])('preserves HTTP status for non-JSON failures', async fetchInsights => {
        vi.mocked(metaFetch).mockResolvedValue(new Response('Bad gateway', { status: 502 }));
        expect(await fetchInsights('token', 'id')).toEqual({ success: false, error: 'Threads API returned 502' });
    });
});
