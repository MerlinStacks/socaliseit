import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getYouTubeChannelAnalytics } from '../youtube-api';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const publicData = { items: [{ statistics: { subscriberCount: '123', viewCount: '4567', videoCount: '8' } }] };
const names = ['day', 'views', 'estimatedMinutesWatched', 'averageViewDuration', 'subscribersGained', 'subscribersLost'];
const values = ['2026-09-12', 200, 345.5, 103.65, 4, 7];
const report = (columns = names, row = values) => ({ columnHeaders: columns.map(name => ({ name })), rows: [row] });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();

describe('getYouTubeChannelAnalytics', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it.each([false, true])('maps daily metrics by header name (reordered: %s)', async reordered => {
        fetchMock.mockResolvedValueOnce(response(publicData)).mockResolvedValueOnce(response(
            reordered ? report([...names].reverse(), [...values].reverse()) : report()
        ));
        const result = await getYouTubeChannelAnalytics('token', 'UC-explicit');
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ followers: 123, impressions: 4567, followersChange: -3 });
        expect(result.data?.platformMetrics).toEqual({
            video_count: 8,
            private_analytics_availability: 'available',
            latest_day_date: '2026-09-12',
            latest_day_views: 200,
            latest_day_watch_minutes: 345.5,
            latest_day_average_view_duration_seconds: 103.65,
            latest_day_subscribers_gained: 4,
            latest_day_subscribers_lost: 7,
            latest_day_subscribers_net: -3
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const publicParams = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
        expect(publicParams.get('id')).toBe('UC-explicit');
        expect(publicParams.has('mine')).toBe(false);
        const privateParams = new URL(String(fetchMock.mock.calls[1][0])).searchParams;
        expect(Object.fromEntries(privateParams)).toMatchObject({
            ids: 'channel==UC-explicit', startDate: '2020-01-01',
            endDate: new Date().toISOString().split('T')[0], dimensions: 'day', sort: '-day', maxResults: '1'
        });
    });

    it.each([
        ['missing scope', { error: { message: 'Insufficient authentication scopes' } }, 403, 'unavailable'],
        ['HTTP failure', {}, 503, 'unavailable'],
        ['API error', { error: { message: 'Access denied' } }, 200, 'unavailable'],
        ['empty rows', { rows: [] }, 200, 'no_data'],
        ['absent rows', {}, 200, 'no_data'],
        ['missing headers', { rows: [values] }, 200, 'unavailable']
    ])('preserves public counters with %s', async (_label, body, status, availability) => {
        fetchMock.mockResolvedValueOnce(response(publicData)).mockResolvedValueOnce(response(body, status as number));
        const result = await getYouTubeChannelAnalytics('token');
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ followers: 123, impressions: 4567, profileViews: 4567 });
        expect(result.data?.platformMetrics?.private_analytics_availability).toBe(availability);
        expect(result.data?.platformMetrics).not.toHaveProperty('latest_day_watch_minutes');
        expect(result.data?.platformMetrics).not.toHaveProperty('total_watch_minutes');
        const params = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
        expect(params.get('mine')).toBe('true');
        expect(params.has('id')).toBe(false);
        expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('ids')).toBe('channel==MINE');
    });

    it.each(['network', 'invalid JSON'])('preserves public counters after private %s failure', async failure => {
        fetchMock.mockResolvedValueOnce(response(publicData));
        if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('Connection failed'));
        else fetchMock.mockResolvedValueOnce(new Response('invalid JSON'));
        const result = await getYouTubeChannelAnalytics('token');
        expect(result.success).toBe(true);
        expect(result.data?.followers).toBe(123);
        expect(result.data?.platformMetrics).toMatchObject({ private_analytics_availability: 'unavailable' });
        expect(result.data?.platformMetrics?.private_analytics_error).toEqual(expect.any(String));
        expect(result.data?.platformMetrics).not.toHaveProperty('latest_day_watch_minutes');
    });

    it.each([
        [publicData, 503],
        [{ error: { message: 'Invalid token' } }, 401],
        [{ items: [] }, 200],
        [{ items: [{}] }, 200]
    ])('rejects public failure or missing channel (%j, %s)', async (body, status) => {
        fetchMock.mockResolvedValueOnce(response(body, status));
        const result = await getYouTubeChannelAnalytics('token');
        expect(result).toEqual({ success: false, error: expect.any(String) });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
