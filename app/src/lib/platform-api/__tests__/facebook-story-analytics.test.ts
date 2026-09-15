import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFacebookStoryAnalytics } from '../facebook-api';
import { metaFetch } from '../meta-fetch';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }));
vi.mock('../meta-fetch', () => ({ metaFetch: vi.fn(), metaJson: vi.fn() }));

function respond(body: unknown, status = 200) {
    vi.mocked(metaFetch).mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => vi.resetAllMocks());

describe('Facebook story analytics', () => {
    it.each([200, 400])('preserves Graph errors with HTTP %s', async (status) => {
        respond({ error: { code: 190, message: 'Invalid OAuth access token' } }, status);
        expect(await getFacebookStoryAnalytics('token', 'story-1')).toEqual({
            success: false, error: 'Invalid OAuth access token', errorCode: '190',
        });
    });

    it('rejects HTTP failures even when the body contains metrics', async () => {
        respond({ data: [{ name: 'total_unique_impressions', values: [{ value: 12 }] }] }, 503);
        expect(await getFacebookStoryAnalytics('token', 'story-1')).toEqual({
            success: false, error: 'Facebook API returned 503', errorCode: '503',
        });
    });

    it('preserves transport failures', async () => {
        vi.mocked(metaFetch).mockRejectedValue(new Error('Network unavailable'));
        expect(await getFacebookStoryAnalytics('token', 'story-1')).toEqual({
            success: false, error: 'Network unavailable',
        });
    });

    it('rejects an invalid JSON response', async () => {
        vi.mocked(metaFetch).mockResolvedValue(new Response('not json'));
        expect(await getFacebookStoryAnalytics('token', 'story-1')).toMatchObject({ success: false });
    });

    it.each([
        {},
        { data: [] },
        { data: [{ name: 'other_metric', values: [{ value: 5 }] }] },
        { data: [{ name: 'total_unique_impressions' }] },
        { data: [{ name: 'total_unique_impressions', values: [] }] },
        { data: [{ name: 'total_unique_impressions', values: [{}] }] },
        { data: [{ name: 'total_unique_impressions', values: [{ value: null }] }] },
        { data: [{ name: 'total_unique_impressions', values: [{ value: '0' }] }] },
    ])('rejects unavailable reach: %j', async (body) => {
        respond(body);
        expect(await getFacebookStoryAnalytics('token', 'story-1')).toEqual({
            success: false, error: 'Facebook story insights unavailable',
        });
    });

    it.each([0, 42])('returns genuine reach %s without claiming views are available', async (reach) => {
        respond({ data: [{ name: 'total_unique_impressions', values: [{ value: reach }] }] });
        const result = await getFacebookStoryAnalytics('token', 'story-1');
        expect(result).toMatchObject({ success: true, data: { impressions: reach, reach, comments: 0 } });
        expect(result.data?.platformMetrics).toEqual({ storyMetrics: { reach } });
        expect(metaFetch).toHaveBeenCalledWith('token', expect.stringContaining('/story-1/insights?metric=total_unique_impressions'));
    });
});
