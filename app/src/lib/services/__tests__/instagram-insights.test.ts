import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstagramStoryAnalytics } from '@/lib/platform-api/instagram/analytics';
import { metaJson } from '@/lib/platform-api/meta-fetch';
import { getContentInsights } from '../instagram-stories';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn() }, createWorkerLogger: () => ({}) }));
vi.mock('@/lib/platform-api/meta-fetch', () => ({ metaJson: vi.fn() }));

const fetchMock = vi.fn();
const metrics = (values: Record<string, number>) => ({
    data: Object.entries(values).map(([name, value]) => ({ name, values: [{ value }] })),
});

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('Instagram story analytics', () => {
    it('requests current metrics and maps views, replies, and navigation', async () => {
        vi.mocked(metaJson).mockResolvedValue(metrics({ views: 123, reach: 90, replies: 4, navigation: 20 }));
        const result = await getInstagramStoryAnalytics('token', 'story-1');
        const url = new URL(vi.mocked(metaJson).mock.calls[0][1]);
        expect(url.searchParams.get('metric')).toBe('views,reach,replies,navigation');
        expect(result).toMatchObject({ success: true, data: {
            impressions: 123, reach: 90, comments: 4,
            platformMetrics: { views: 123, replies: 4, navigation: 20,
                storyMetrics: { views: 123, reach: 90, replies: 4, navigation: 20 } },
        } });
    });

    it('keeps genuine zero views as available data', async () => {
        vi.mocked(metaJson).mockResolvedValue(metrics({ views: 0, reach: 0 }));
        expect(await getInstagramStoryAnalytics('token', 'story-1')).toMatchObject({
            success: true, data: { impressions: 0, platformMetrics: { views: 0 } },
        });
    });

    it.each<Record<string, number>>([
        { reach: 15 },
        { views: 0, reach: 0 },
        { replies: 0, navigation: 0 },
        { views: 12, replies: 2 },
    ])('includes only returned raw metrics: %j', async (values) => {
        vi.mocked(metaJson).mockResolvedValue(metrics(values));
        const result = await getInstagramStoryAnalytics('token', 'story-1');
        expect(result).toMatchObject({ success: true, data: {
            impressions: values.views ?? 0, reach: values.reach ?? 0, comments: values.replies ?? 0,
        } });
        expect(result.data?.platformMetrics?.storyMetrics).toEqual(values);
    });

    it('omits metrics with missing or invalid values from raw availability', async () => {
        vi.mocked(metaJson).mockResolvedValue({ data: [
            { name: 'reach', values: [{ value: 7 }] },
            { name: 'views', values: [] },
            { name: 'replies', values: [{ value: null }] },
            { name: 'navigation', values: [{}] },
        ] });
        const result = await getInstagramStoryAnalytics('token', 'story-1');
        expect(result.success).toBe(true);
        expect(result.data?.platformMetrics?.storyMetrics).toEqual({ reach: 7 });
    });

    it('does not report empty insights as a zero-count snapshot', async () => {
        vi.mocked(metaJson).mockResolvedValue({ data: [] });
        expect(await getInstagramStoryAnalytics('token', 'story-1')).toEqual({
            success: false, error: 'Instagram story insights unavailable',
        });
    });

    it('rejects a response without any usable metrics', async () => {
        vi.mocked(metaJson).mockResolvedValue(metrics({ reach: -1 }));
        expect(await getInstagramStoryAnalytics('token', 'story-1')).toEqual({
            success: false, error: 'Instagram story insights unavailable',
        });
    });

    it.each([
        [100, 'Object does not exist'],
        [10, 'Insufficient permissions'],
        [190, 'Invalid OAuth access token'],
    ])('preserves API failure %s', async (code, message) => {
        vi.mocked(metaJson).mockResolvedValue({ error: { code, message } });
        expect(await getInstagramStoryAnalytics('token', 'story-1')).toEqual({
            success: false, error: message, errorCode: String(code),
        });
    });
});

describe('Instagram content insights service', () => {
    it.each([
        ['story', 'views,reach,replies,navigation'],
        ['reel', 'comments,likes,views,reach,saved,shares,total_interactions'],
    ] as const)('requests current %s metrics and preserves views with an impressions alias', async (type, requested) => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => metrics({ views: 42, reach: 30 }) });
        expect(await getContentInsights('media-1', 'token', type)).toEqual({ views: 42, impressions: 42, reach: 30 });
        expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('metric')).toBe(requested);
        expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer token' } });
    });

    it('retains a zero views count', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => metrics({ views: 0 }) });
        expect(await getContentInsights('media-1', 'token', 'story')).toEqual({ views: 0, impressions: 0 });
    });

    it('rejects empty unavailable insights', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
        await expect(getContentInsights('media-1', 'token', 'story')).rejects.toThrow('insights unavailable');
    });

    it.each([true, false])('preserves Graph errors (HTTP ok=%s)', async (ok) => {
        fetchMock.mockResolvedValue({ ok, json: async () => ({ error: { message: 'Insufficient permissions' } }) });
        await expect(getContentInsights('media-1', 'token', 'story')).rejects.toThrow('Insufficient permissions');
    });
});
