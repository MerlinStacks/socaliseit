import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { YouTubeInsights } from '../youtube-insights';

// Inspect chart inputs without depending on jsdom layout measurements.
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    LineChart: ({ data }: { data: unknown }) => <div data-testid="chart">{JSON.stringify(data)}</div>,
    CartesianGrid: () => null, Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

function payload() {
    return {
        accounts: [{ id: 'one', name: 'Channel One' }, { id: 'two', name: 'Channel Two' }], accountId: 'one',
        videos: [{ id: 'abcdefghijk', title: 'Test video' }],
        analytics: {
            startDate: '2026-09-01', endDate: '2026-09-07', dataThrough: null,
            summary: null, daily: [], trafficSources: [], retention: [],
            availability: { summary: 'reconnect_required', daily: 'empty', trafficSources: 'unavailable', retention: 'not_requested' },
        },
    };
}
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('YouTube insights', () => {
    it('labels conversion as gained/views and leaves zero-view conversion unavailable', async () => {
        const body = payload();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...body, analytics: {
            ...body.analytics,
            summary: { views: 0, watchMinutes: 0, averageViewDuration: 0, averageViewPercentage: 0, subscribersGained: 2, subscribersLost: 3, netSubscribers: -1, subscriberConversionRate: null },
            availability: { ...body.analytics.availability, summary: 'available' },
        } })));
        render(<YouTubeInsights range="30d" />);
        expect(await screen.findByText('Not available (no views)')).toBeDefined();
        expect(screen.getByText('Gained / views')).toBeDefined();
        expect(screen.getByText('-1')).toBeDefined();
        expect(screen.getByText(/not a unique-viewer funnel/)).toBeDefined();
        expect(screen.getByText(/unlike lifetime public video counters/)).toBeDefined();
    });

    it('shows per-report availability and explicitly labels the year fallback', async () => {
        const fetcher = vi.fn().mockResolvedValue(response(payload()));
        vi.stubGlobal('fetch', fetcher);
        render(<YouTubeInsights range="year" />);
        await screen.findByText(/Reconnect this YouTube account/);
        expect(fetcher.mock.calls[0][0]).toContain('range=90d');
        expect(screen.getByText(/instead of “This year”/)).toBeDefined();
        expect(screen.getByText(/No report rows/)).toBeDefined();
        expect(screen.getByText(/currently unavailable/)).toBeDefined();
        expect(screen.getByText(/Select a video to view/)).toBeDefined();
        expect(screen.queryByText('0')).toBeNull();
    });

    it('filters by video, preserves rewatch ratios above 100%, and clears video on account change', async () => {
        const body = payload();
        const fetcher = vi.fn().mockResolvedValue(response(body));
        vi.stubGlobal('fetch', fetcher);
        render(<YouTubeInsights range="7d" />);
        await screen.findByText(/Reconnect this YouTube account/);
        fetcher.mockResolvedValue(response({ ...body, analytics: {
            ...body.analytics, retention: [{ elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 1.4, relativeRetentionPerformance: null }],
            availability: { ...body.analytics.availability, retention: 'available' },
        } }));
        fireEvent.change(screen.getByLabelText(/Video ·/), { target: { value: 'abcdefghijk' } });
        expect((await screen.findByTestId('chart')).textContent).toContain('"audience":140');
        expect(fetcher.mock.calls[1][0]).toContain('videoId=abcdefghijk');
        fireEvent.change(screen.getByLabelText('YouTube account'), { target: { value: 'two' } });
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
        expect(fetcher.mock.calls[2][0]).toContain('accountId=two');
        expect(fetcher.mock.calls[2][0]).not.toContain('videoId');
    });

    it('aborts and ignores an obsolete range response even if fetch resolves after abort', async () => {
        let resolveOld!: (value: Response) => void;
        const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
            .mockResolvedValue(response({ analytics: null, accounts: [], accountId: null, videos: [] }));
        vi.stubGlobal('fetch', fetcher);
        const { rerender } = render(<YouTubeInsights range="7d" />);
        const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
        rerender(<YouTubeInsights range="30d" />);
        expect(signal.aborted).toBe(true);
        await screen.findByText(/Connect a YouTube account/);
        await act(async () => resolveOld(response(payload())));
        expect(screen.queryByText(/Reconnect this YouTube account/)).toBeNull();
        expect(screen.getByText(/Connect a YouTube account/)).toBeDefined();
    });
});
