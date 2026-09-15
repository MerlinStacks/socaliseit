/** Independent YouTube Analytics report families; failed reports never become zero metrics. */
import { z } from 'zod';

export type YouTubeAnalyticsAvailability = 'available' | 'empty' | 'reconnect_required' | 'unavailable' | 'not_requested';

export interface YouTubeAnalyticsMetrics {
    views: number;
    watchMinutes: number;
    averageViewDuration: number;
    averageViewPercentage: number;
    subscribersGained: number;
    subscribersLost: number;
}

export interface YouTubeAnalytics {
    startDate: string;
    endDate: string;
    /** Latest returned daily row, not a claim that the requested end date is processed. */
    dataThrough: string | null;
    daily: (YouTubeAnalyticsMetrics & { date: string })[];
    trafficSources: { source: string; views: number; watchMinutes: number }[];
    retention: { elapsedVideoTimeRatio: number; audienceWatchRatio: number; relativeRetentionPerformance: number | null }[];
    summary: (YouTubeAnalyticsMetrics & {
        netSubscribers: number;
        /** Subscribers gained / views * 100; null when views is zero. */
        subscriberConversionRate: number | null;
    }) | null;
    availability: Record<'daily' | 'trafficSources' | 'retention' | 'summary', YouTubeAnalyticsAvailability>;
}

export function emptyYouTubeAnalytics(
    startDate: string, endDate: string,
    status: YouTubeAnalyticsAvailability, videoId?: string,
): YouTubeAnalytics {
    return {
        startDate, endDate, dataThrough: null, daily: [], trafficSources: [], retention: [], summary: null,
        availability: { daily: status, trafficSources: status, summary: status, retention: videoId ? status : 'not_requested' },
    };
}

const reportSchema = z.object({
    columnHeaders: z.array(z.object({ name: z.string() })),
    rows: z.array(z.array(z.unknown())).optional(),
});
type Row = Record<string, unknown>;
const metrics = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost';

function number(row: Row, key: string): number {
    const value = row[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid metric ${key}`);
    return value;
}

function text(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== 'string' || !value) throw new Error(`Invalid dimension ${key}`);
    return value;
}

function parseMetrics(row: Row): YouTubeAnalyticsMetrics {
    return {
        views: number(row, 'views'), watchMinutes: number(row, 'estimatedMinutesWatched'),
        averageViewDuration: number(row, 'averageViewDuration'), averageViewPercentage: number(row, 'averageViewPercentage'),
        subscribersGained: number(row, 'subscribersGained'), subscribersLost: number(row, 'subscribersLost'),
    };
}

/** Quota, disabled APIs, and unsupported reports cannot be fixed by reconnecting. */
export function youTubeAnalyticsErrorAvailability(status: number, body: unknown): 'reconnect_required' | 'unavailable' {
    if (status === 401) return 'reconnect_required';
    const error = z.object({ error: z.object({
        errors: z.array(z.object({ reason: z.string() })).optional(),
        details: z.array(z.object({ reason: z.string().optional() }).passthrough()).optional(),
    }) }).safeParse(body);
    const reasons = error.success ? [
        ...(error.data.error.errors ?? []).map(item => item.reason),
        ...(error.data.error.details ?? []).map(item => item.reason),
    ] : [];
    return status === 403 && reasons.some(reason =>
        ['insufficientPermissions', 'forbidden', 'authError', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(reason ?? '')
    ) ? 'reconnect_required' : 'unavailable';
}

/** Caller must validate video ownership before requesting video-filtered private reports. */
export async function fetchYouTubeAnalytics(
    accessToken: string, channelId: string, startDate: string, endDate: string, videoId?: string,
): Promise<YouTubeAnalytics> {
    const analytics = emptyYouTubeAnalytics(startDate, endDate, 'unavailable', videoId);

    async function report<T>(
        family: keyof YouTubeAnalytics['availability'], params: Record<string, string>, parse: (row: Row) => T,
    ): Promise<T[]> {
        try {
            const query = new URLSearchParams({ ids: `channel==${channelId}`, startDate, endDate, ...params });
            if (videoId) query.set('filters', `video==${videoId}`);
            const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${query}`, {
                headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
                signal: AbortSignal.timeout(15_000),
            });
            const body: unknown = await response.json().catch(() => null);
            if (!response.ok) {
                analytics.availability[family] = youTubeAnalyticsErrorAvailability(response.status, body);
                return [];
            }
            const data = reportSchema.parse(body);
            const headers = data.columnHeaders.map(header => header.name);
            if (new Set(headers).size !== headers.length) throw new Error('Duplicate report headers');
            const rows = (data.rows ?? []).map(values => {
                if (values.length !== headers.length) throw new Error('Invalid report row');
                return parse(Object.fromEntries(headers.map((name, index) => [name, values[index]])));
            });
            analytics.availability[family] = rows.length ? 'available' : 'empty';
            return rows;
        } catch {
            analytics.availability[family] = 'unavailable';
            return [];
        }
    }

    const [daily, trafficSources, summary, retention] = await Promise.all([
        report('daily', { dimensions: 'day', metrics, sort: 'day' }, row => {
            const date = text(row, 'day');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < startDate || date > endDate) throw new Error('Invalid report day');
            return { date, ...parseMetrics(row) };
        }),
        report('trafficSources', {
            dimensions: 'insightTrafficSourceType', metrics: 'views,estimatedMinutesWatched', sort: '-views',
        }, row => ({ source: text(row, 'insightTrafficSourceType'), views: number(row, 'views'), watchMinutes: number(row, 'estimatedMinutesWatched') })),
        // Why: Averages across daily rows would incorrectly give low-view days equal weight.
        report('summary', { metrics }, parseMetrics),
        videoId ? report('retention', {
            dimensions: 'elapsedVideoTimeRatio', metrics: 'audienceWatchRatio,relativeRetentionPerformance', sort: 'elapsedVideoTimeRatio',
        }, row => ({
            elapsedVideoTimeRatio: number(row, 'elapsedVideoTimeRatio'), audienceWatchRatio: number(row, 'audienceWatchRatio'),
            relativeRetentionPerformance: row.relativeRetentionPerformance == null ? null : number(row, 'relativeRetentionPerformance'),
        })) : Promise.resolve([]),
    ]);
    analytics.daily = daily.sort((a, b) => a.date.localeCompare(b.date));
    analytics.dataThrough = analytics.daily.at(-1)?.date ?? null;
    analytics.trafficSources = trafficSources;
    analytics.retention = retention;
    if (summary.length === 1) {
        const total = summary[0];
        analytics.summary = {
            ...total, netSubscribers: total.subscribersGained - total.subscribersLost,
            subscriberConversionRate: total.views > 0 ? total.subscribersGained / total.views * 100 : null,
        };
    } else if (summary.length > 1) {
        analytics.availability.summary = 'unavailable';
    }
    return analytics;
}
