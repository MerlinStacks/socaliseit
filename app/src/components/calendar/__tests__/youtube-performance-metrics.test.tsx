import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PerformanceMetrics } from '../performance-metrics';

afterEach(cleanup);
const analytics = {
    impressions: 1591, reach: 1591, videoViews: 1591,
    likes: 11, comments: 0, shares: 0, saves: 0, clicks: 0,
    videoWatchTime: 0, avgWatchPercentage: null, syncedAt: null,
};

describe('YouTube post performance', () => {
    it.each([undefined, 'feed', 'video', 'short', 'reel'])('hides unsupported counters for post type %s', postType => {
        render(<PerformanceMetrics analytics={analytics} platform="YOUTUBE" postType={postType} />);
        for (const label of ['Impressions', 'Reach', 'Shares']) expect(screen.queryByText(label)).toBeNull();
        for (const label of ['Views', 'Likes', 'Comments']) expect(screen.getByText(label)).toBeDefined();
        expect(screen.getAllByText((1591).toLocaleString())).toHaveLength(1);
        expect(screen.getAllByText('0')).toHaveLength(1);
        expect(screen.getByRole('link', { name: 'YouTube insights in Analytics' }).getAttribute('href')).toBe('/analytics');
    });

    it.each([0, 23])('uses actual video views (%s) without video metadata or an impressions fallback', videoViews => {
        render(<PerformanceMetrics analytics={{ ...analytics, videoViews, comments: 4 }} platform="youtube" isVideo={false} />);
        expect(screen.getByText(String(videoViews))).toBeDefined();
        expect(screen.queryByText((1591).toLocaleString())).toBeNull();
    });

    it('does not calculate YouTube watch averages from lifetime public views', () => {
        render(<PerformanceMetrics analytics={{ ...analytics, avgWatchPercentage: 50, videoWatchTime: 100 }} platform="youtube" isVideo />);
        expect(screen.queryByText('Avg. Watch Time')).toBeNull();
    });

    it('preserves supported metrics for other platforms', () => {
        render(<PerformanceMetrics analytics={analytics} platform="instagram" postType="feed" />);
        for (const label of ['Impressions', 'Reach', 'Shares', 'Likes', 'Comments', 'Views']) expect(screen.getByText(label)).toBeDefined();
        expect(screen.queryByRole('link')).toBeNull();
    });
});
