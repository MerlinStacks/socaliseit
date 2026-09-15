import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PerformanceMetrics } from '../performance-metrics';
import { getStoryMetrics } from '../story-performance';

afterEach(cleanup);

const analytics = {
    impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0,
    saves: 0, clicks: 0, videoViews: 0, videoWatchTime: 0,
    avgWatchPercentage: null, syncedAt: '2026-09-15T12:00:00Z',
};

describe('Story performance', () => {
    it.each(['facebook', 'instagram'])('does not present legacy zeros as verified %s insights', platform => {
        render(<PerformanceMetrics platform={platform} postType="STORY" analytics={analytics} />);
        expect(screen.getByText('Story insights unavailable')).toBeTruthy();
        expect(screen.queryByText('0')).toBeNull();
        expect(screen.queryByText(/Last captured/)).toBeNull();
    });

    it('explains missing snapshots', () => {
        render(<PerformanceMetrics platform="instagram" postType="story" />);
        expect(screen.getByText(/does not mean nobody saw it/)).toBeTruthy();
    });

    it('shows a reported Facebook zero once as reach', () => {
        render(<PerformanceMetrics platform="facebook" postType="story"
            analytics={{ ...analytics, platformMetrics: { storyMetrics: { reach: 0 } } }} />);
        expect(screen.getAllByText('0')).toHaveLength(1);
        expect(screen.getByText('Reach')).toBeTruthy();
        expect(screen.queryByText('Views')).toBeNull();
        expect(screen.queryByText('Impressions')).toBeNull();
    });

    it('labels Instagram replies and distinguishes absent metrics from zero', () => {
        render(<PerformanceMetrics platform="instagram" postType="story"
            analytics={{ ...analytics, platformMetrics: { storyMetrics: { views: 25, replies: 0 } } }} />);
        expect(screen.getByText('25')).toBeTruthy();
        expect(screen.getByText('0')).toBeTruthy();
        expect(screen.getByText('Replies')).toBeTruthy();
        expect(screen.getByText('Unavailable')).toBeTruthy();
        expect(screen.queryByText('Comments')).toBeNull();
        expect(screen.queryByText('Impressions')).toBeNull();
    });

    it('keeps positive legacy snapshots without trusting placeholder zeros', () => {
        expect(getStoryMetrics('instagram', { ...analytics, impressions: 42 }).map(m => m.value))
            .toEqual([42, null, null]);
    });

    it('does not substitute legacy values for explicitly missing or invalid metrics', () => {
        expect(getStoryMetrics('instagram', {
            ...analytics, reach: 42,
            platformMetrics: { storyMetrics: { views: -1, replies: '0' } },
        }).map(m => m.value)).toEqual([null, null, null]);
    });
});
