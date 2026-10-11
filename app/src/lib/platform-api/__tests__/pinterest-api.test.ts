import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPinterestPinAnalytics, getPinterestUserAnalytics } from '../pinterest-api';

afterEach(() => vi.unstubAllGlobals());

function mockResponses(...bodies: unknown[]) {
    const fetchMock = vi.fn();
    for (const body of bodies) fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('Pinterest pin analytics', () => {
    it('fetches a single UTC day for account snapshots and returns percentage engagement', async () => {
        const fetchMock = mockResponses({ follower_count: 12 }, {
            all: { summary_metrics: { IMPRESSION: 100, ENGAGEMENT: 5, OUTBOUND_CLICK: 2 } },
        });
        const result = await getPinterestUserAnalytics('token');
        expect(result).toMatchObject({ success: true, data: { impressions: 100, engagementRate: 5,
            platformMetrics: { reporting_period: 'day' },
        } });
        const params = new URL(fetchMock.mock.calls[1][0]).searchParams;
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        expect(params.get('start_date')).toBe(yesterday.toISOString().slice(0, 10));
        expect(params.get('end_date')).toBe(params.get('start_date'));
    });
    it.each(['NO_SPLIT', 'all', 'root'])('reads %s summaries without substituting fallback counts', async key => {
        const report = { summary_metrics: { IMPRESSION: 10, PIN_CLICK: 2, SAVE: 3, OUTBOUND_CLICK: 1 } };
        const fetchMock = mockResponses(key === 'root' ? report : { [key]: report });
        const result = await getPinterestPinAnalytics('token', '123');
        expect(result).toMatchObject({ success: true, data: {
            impressions: 10, clicks: 2, saves: 3,
            platformMetrics: { outbound_clicks: 1, reporting_period: 'last_30_days' },
        } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sums nested daily metrics and excludes unready days', async () => {
        mockResponses({ NO_SPLIT: { daily_metrics: [
            { data_status: 'READY', metrics: { IMPRESSION: 4, PIN_CLICK: 1 } },
            { data_status: 'READY', metrics: { IMPRESSION: 6, PIN_CLICK: 1 } },
            { data_status: 'PROCESSING', metrics: { IMPRESSION: 99 } },
        ] } });
        expect(await getPinterestPinAnalytics('token', '123')).toMatchObject({
            success: true, data: { impressions: 10, clicks: 2 },
        });
    });

    it.each([
        { summary_metrics: { IMPRESSION: 0, PIN_CLICK: 0 } },
        { daily_metrics: [{ data_status: 'READY', metrics: { IMPRESSION: 0, PIN_CLICK: 0 } }] },
    ])('preserves reported zeros instead of substituting older activity', async report => {
        const fetchMock = mockResponses({ NO_SPLIT: report });
        expect(await getPinterestPinAnalytics('token', '123')).toMatchObject({ success: true, data: { impressions: 0 } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each(['90d_metrics', 'lifetime_metrics'])('labels the fallback period for %s', async key => {
        mockResponses({ code: 403 }, { pin_metrics: { [key]: { IMPRESSION: 15, PIN_CLICK: 4 } } });
        expect(await getPinterestPinAnalytics('token', '123')).toMatchObject({ success: true, data: {
            impressions: 15, clicks: 4,
            platformMetrics: { reporting_period: key === '90d_metrics' ? 'last_90_days' : 'lifetime' },
        } });
    });

    it('does not replace stored counts with fabricated zeros for empty fallback data', async () => {
        mockResponses({}, { pin_metrics: {} });
        expect(await getPinterestPinAnalytics('token', '123')).toMatchObject({ success: false });
    });
});
