import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PerformanceMetrics } from '../performance-metrics';

afterEach(cleanup);

const analytics = {
    impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0,
    saves: 0, clicks: 0, videoViews: 0, videoWatchTime: 0,
    avgWatchPercentage: null, syncedAt: '2026-09-15T12:00:00Z',
};

describe('Pinterest performance', () => {
    it.each([
        ['last_30_days', 'Last 30 days'],
        ['last_90_days', 'Last 90 days (fallback)'],
        ['lifetime', 'Lifetime (fallback)'],
        [undefined, 'Reporting period unavailable'],
    ])('identifies the reporting period %s', (period, label) => {
        render(<PerformanceMetrics platform="pinterest" analytics={{ ...analytics,
            platformMetrics: { reporting_period: period },
        }} />);
        expect(screen.getByText(content => content.startsWith(`${label}. Synced Pinterest`))).toBeTruthy();
    });
    it.each(['pin', 'feed', 'carousel', 'video'])('shows only sourced metrics for %s', postType => {
        render(<PerformanceMetrics platform="PINTEREST" postType={postType} isVideo
            analytics={{ ...analytics, impressions: 45, saves: 7, clicks: 3, avgWatchPercentage: 50 }} />);
        for (const label of ['Reach', 'Likes', 'Shares', 'Comments', 'Views', 'Avg. Watch Time']) {
            expect(screen.queryByText(label)).toBeNull();
        }
        for (const [label, value] of [['Impressions', '45'], ['Saves', '7'], ['Pin clicks', '3']]) {
            expect(screen.getByText(label).closest('.rounded-xl')?.textContent).toContain(value);
        }
    });
});

describe('Threads performance', () => {
    it.each(['thread', 'feed', 'video', 'carousel'])('shows sourced metrics for %s', postType => {
        render(<PerformanceMetrics platform="THREADS" postType={postType} isVideo
            analytics={{ ...analytics, impressions: 25, videoViews: 0, shares: 3, comments: 2 }} />);
        for (const label of ['Impressions', 'Reach', 'Shares', 'Comments']) expect(screen.queryByText(label)).toBeNull();
        for (const [label, value] of [['Views', '25'], ['Reposts', '3'], ['Replies', '2']]) {
            expect(screen.getByText(label).closest('.rounded-xl')?.textContent).toContain(value);
        }
    });
});

describe('Google Business post performance', () => {
    it.each(['google_business', 'GOOGLE_BUSINESS'])(
        'explains unavailable metrics instead of legacy zeros for %s', (platform) => {
            render(<PerformanceMetrics platform={platform} analytics={analytics} />);
            expect(screen.getByText('Post analytics unavailable')).toBeTruthy();
            expect(screen.getByText(/business-level metrics, not results for this post/)).toBeTruthy();
            for (const label of ['Impressions', 'Reach', 'Shares', 'Likes', 'Comments', 'Views']) {
                expect(screen.queryByText(label)).toBeNull();
            }
            expect(screen.queryByText(/Last updated/)).toBeNull();
        },
    );

    it('explains availability without an analytics row', () => {
        render(<PerformanceMetrics platform="google_business" analytics={null} />);
        expect(screen.getByText('Post analytics unavailable')).toBeTruthy();
    });

    it('does not show stale video metrics for Google posts', () => {
        render(<PerformanceMetrics platform="google_business" isVideo postType="video"
            analytics={{ ...analytics, impressions: 125, avgWatchPercentage: 50 }} />);
        expect(screen.queryByText('125')).toBeNull();
        expect(screen.queryByText('Avg. Watch Time')).toBeNull();
    });

    it('preserves real zero metrics for supported platforms', () => {
        render(<PerformanceMetrics platform="instagram" analytics={analytics} />);
        expect(screen.getByText('Impressions')).toBeTruthy();
        expect(screen.getByText(/Last updated/)).toBeTruthy();
        expect(screen.queryByText('Post analytics unavailable')).toBeNull();
    });

    it('preserves the empty panel behavior for other platforms without data', () => {
        const { container } = render(<PerformanceMetrics platform="instagram" />);
        expect(container.innerHTML).toBe('');
    });
});
