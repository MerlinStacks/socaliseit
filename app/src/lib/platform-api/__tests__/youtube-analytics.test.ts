// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchYouTubeAnalytics } from '../youtube-analytics';

const fetchMock = vi.fn();
const metricNames = ['subscribersLost', 'averageViewPercentage', 'views', 'averageViewDuration', 'subscribersGained', 'estimatedMinutesWatched'];
function table(names: string[], rows?: unknown[][]) {
    return { columnHeaders: names.map(name => ({ name })), ...(rows ? { rows } : {}) };
}
function family(input: string) {
    return new URL(input).searchParams.get('dimensions') ?? 'summary';
}
function run(videoId?: string) {
    return fetchYouTubeAnalytics('fresh-token', 'UC-explicit-channel', '2026-08-01', '2026-08-30', videoId);
}

describe('fetchYouTubeAnalytics', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockImplementation(async (input: string) => {
            switch (family(input)) {
                case 'day': return Response.json(table(['day', ...metricNames], [
                    ['2026-08-28', 1, 40, 10, 30, 2, 5], ['2026-08-27', 2, 80, 90, 70, 8, 105],
                ]));
                case 'summary': return Response.json(table(metricNames, [[3, 76, 100, 66, 10, 110]]));
                case 'insightTrafficSourceType': return Response.json(table(
                    ['estimatedMinutesWatched', 'insightTrafficSourceType', 'views'], [[75, 'YT_SEARCH', 80]],
                ));
                default: return Response.json(table(
                    ['audienceWatchRatio', 'elapsedVideoTimeRatio', 'relativeRetentionPerformance'], [[1.2, 0.1, null], [0.8, 0.5, 0.6]],
                ));
            }
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('uses named headers and aggregate averages, returning actual data freshness', async () => {
        const result = await run();
        expect(result.summary).toEqual({ views: 100, watchMinutes: 110, averageViewDuration: 66,
            averageViewPercentage: 76, subscribersGained: 10, subscribersLost: 3, netSubscribers: 7, subscriberConversionRate: 10 });
        expect(result.daily.map(row => row.date)).toEqual(['2026-08-27', '2026-08-28']);
        expect(result.daily[1]).toMatchObject({ views: 10, watchMinutes: 5, averageViewDuration: 30 });
        expect(result.dataThrough).toBe('2026-08-28');
        expect(result.trafficSources).toEqual([{ source: 'YT_SEARCH', views: 80, watchMinutes: 75 }]);
        expect(result.retention).toEqual([]);
        expect(result.availability).toEqual({ daily: 'available', summary: 'available', trafficSources: 'available', retention: 'not_requested' });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        for (const [input, options] of fetchMock.mock.calls) {
            const query = new URL(input).searchParams;
            expect(query.get('ids')).toBe('channel==UC-explicit-channel');
            expect(query.get('startDate')).toBe('2026-08-01');
            expect(query.get('endDate')).toBe('2026-08-30');
            expect(query.has('filters')).toBe(false);
            expect(options).toMatchObject({ headers: { Authorization: 'Bearer fresh-token' }, cache: 'no-store' });
            if (query.get('dimensions') === 'insightTrafficSourceType') expect(query.get('metrics')).toBe('views,estimatedMinutesWatched');
        }
    });

    it('filters all report families to a video and requests retention separately', async () => {
        const result = await run('abcdefghijk');
        expect(result.retention).toEqual([
            { elapsedVideoTimeRatio: 0.1, audienceWatchRatio: 1.2, relativeRetentionPerformance: null },
            { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.8, relativeRetentionPerformance: 0.6 },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        for (const [input] of fetchMock.mock.calls) expect(new URL(input).searchParams.get('filters')).toBe('video==abcdefghijk');
        const retention = new URL(fetchMock.mock.calls.find(([input]) => family(input) === 'elapsedVideoTimeRatio')![0]);
        expect(retention.searchParams.get('metrics')).toBe('audienceWatchRatio,relativeRetentionPerformance');
    });

    it.each([
        [401, 'invalidCredentials', 'reconnect_required'],
        [403, 'insufficientPermissions', 'reconnect_required'],
        [403, 'forbidden', 'reconnect_required'],
        [403, 'quotaExceeded', 'unavailable'],
        [403, 'accessNotConfigured', 'unavailable'],
        [429, 'rateLimitExceeded', 'unavailable'],
        [400, 'badRequest', 'unavailable'],
        [500, 'backendError', 'unavailable'],
    ])('preserves other reports on HTTP %i / %s', async (status, reason, availability) => {
        const successful = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((input: string) => family(input) === 'summary'
            ? Promise.resolve(Response.json({ error: { errors: [{ reason }] } }, { status })) : successful(input));
        const result = await run();
        expect(result.summary).toBeNull();
        expect(result.availability.summary).toBe(availability);
        expect(result.daily).toHaveLength(2);
        expect(result.trafficSources).toHaveLength(1);
    });

    it('treats missing rows as empty, with no synthetic summary or freshness', async () => {
        fetchMock.mockImplementation(async () => Response.json(table(metricNames)));
        const result = await run('abcdefghijk');
        expect(result.summary).toBeNull();
        expect(result.dataThrough).toBeNull();
        expect(result.daily).toEqual([]);
        expect(Object.values(result.availability)).toEqual(['empty', 'empty', 'empty', 'empty']);
    });

    it.each([
        { unexpected: true },
        table(['day', 'views'], [['2026-08-01', 1]]),
        table(['day', ...metricNames], [['2026-08-01', 0, 0, null, 0, 0, 0]]),
        table(['day', ...metricNames], [['2026-08-01', 0, 0, '12', 0, 0, 0]]),
        table(['day', ...metricNames], [['2026-08-01', 0]]),
        table(['day', ...metricNames], [['2026-09-01', 0, 0, 1, 0, 0, 0]]),
        table(['day', 'day'], [['2026-08-01', '2026-08-01']]),
    ])('rejects malformed daily report without fabricating metrics: %j', async body => {
        const successful = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((input: string) => family(input) === 'day' ? Promise.resolve(Response.json(body)) : successful(input));
        const result = await run();
        expect(result.daily).toEqual([]);
        expect(result.dataThrough).toBeNull();
        expect(result.availability.daily).toBe('unavailable');
        expect(result.summary?.views).toBe(100);
    });

    it.each(['network', 'json'])('isolates %s failures', async mode => {
        const successful = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((input: string) => {
            if (family(input) !== 'insightTrafficSourceType') return successful(input);
            if (mode === 'network') return Promise.reject(new Error('timeout'));
            return Promise.resolve(new Response('not json'));
        });
        const result = await run();
        expect(result.trafficSources).toEqual([]);
        expect(result.availability.trafficSources).toBe('unavailable');
        expect(result.summary?.views).toBe(100);
    });

    it('keeps genuine zero totals and uses null for an undefined conversion rate', async () => {
        fetchMock.mockImplementation(async () => Response.json(table(metricNames, [[0, 0, 0, 0, 0, 0]])));
        const result = await run();
        expect(result.summary).toMatchObject({ views: 0, netSubscribers: 0, subscriberConversionRate: null });
        expect(result.availability.summary).toBe('available');
    });

    it('preserves channel metrics when video retention is unsupported', async () => {
        const successful = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((input: string) => family(input) === 'elapsedVideoTimeRatio'
            ? Promise.resolve(Response.json({ error: {} }, { status: 400 })) : successful(input));
        const result = await run('abcdefghijk');
        expect(result.retention).toEqual([]);
        expect(result.availability.retention).toBe('unavailable');
        expect(result.summary?.views).toBe(100);
        expect(result.daily).toHaveLength(2);
    });

    it('does not silently pick an arbitrary aggregate when multiple rows are returned', async () => {
        const successful = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((input: string) => family(input) === 'summary'
            ? Promise.resolve(Response.json(table(metricNames, [[0, 0, 1, 0, 0, 0], [0, 0, 2, 0, 0, 0]]))) : successful(input));
        const result = await run();
        expect(result.summary).toBeNull();
        expect(result.availability.summary).toBe('unavailable');
        expect(result.daily).toHaveLength(2);
    });
});
