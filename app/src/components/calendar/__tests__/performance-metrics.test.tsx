import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PerformanceMetrics } from '../performance-metrics';

afterEach(cleanup);

const analytics = {
    impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0,
    saves: 0, clicks: 0, videoViews: 0, videoWatchTime: 0,
    avgWatchPercentage: null, syncedAt: '2026-09-15T12:00:00Z',
};

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
