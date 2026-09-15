import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceMetrics } from '../performance-metrics';
import { PostPreviewModal } from '../post-preview-modal';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const analytics = {
    impressions: 987, reach: 654, likes: 23, comments: 12, shares: 7,
    saves: 0, clicks: 0, videoViews: 321, videoWatchTime: 963,
    avgWatchPercentage: 50, syncedAt: null,
};
const post = {
    id: 'tiktok-post', time: '2026-09-15T12:00:00Z', caption: 'Test post',
    platform: 'tiktok', status: 'published', thumbnail: null, pillarColor: null,
    isExternal: false, externalUrl: null,
};

describe('TikTok performance', () => {
    it.each([undefined, 'feed', 'video', 'photo', 'carousel', 'STORY', 'unknown'])(
        'shows only supported counts for postType %s regardless of video detection', (postType) => {
            render(<PerformanceMetrics platform="TIKTOK" postType={postType} analytics={analytics} />);
            for (const [label, value] of [['Views', '321'], ['Likes', '23'], ['Comments', '12'], ['Shares', '7']]) {
                const card = screen.getByText(label).closest('.rounded-xl');
                expect(card?.textContent).toContain(value);
            }
            for (const label of ['Impressions', 'Reach', 'Avg. Watch Time']) {
                expect(screen.queryByText(label)).toBeNull();
            }
            expect(screen.queryByText('987')).toBeNull();
            expect(screen.queryByText('654')).toBeNull();
        },
    );

    it('hides legacy watch time even for detected videos', () => {
        render(<PerformanceMetrics platform="tiktok" isVideo analytics={analytics} />);
        expect(screen.queryByText('Avg. Watch Time')).toBeNull();
    });

    it.each([null, undefined])('explains missing analytics in the published modal (%s)', (missing) => {
        render(<PostPreviewModal post={{ ...post, status: 'PUBLISHED', analytics: missing,
            latestError: { message: 'raw API error', suggestion: null } }}
            isOpen onClose={vi.fn()} onRefresh={vi.fn()} />);
        expect(screen.getByText('Performance')).toBeTruthy();
        expect(screen.getByText('Performance unavailable')).toBeTruthy();
        expect(screen.getByText(/TikTok has not returned analytics for this post/).textContent)
            .toContain('Only eligible public videos are supported; photo or private posts may not be available. If this persists, verify your TikTok connection permissions.');
        expect(screen.queryByText('raw API error')).toBeNull();
        expect(screen.queryByText('0')).toBeNull();
        expect(screen.queryByText('Views')).toBeNull();
    });

    it('renders actual analytics instead of the unavailable message', () => {
        render(<PostPreviewModal post={{ ...post, analytics }} isOpen onClose={vi.fn()} onRefresh={vi.fn()} />);
        expect(screen.getByText('Views')).toBeTruthy();
        expect(screen.getByText('Shares')).toBeTruthy();
        expect(screen.queryByText('Performance unavailable')).toBeNull();
    });

    it.each(['draft', 'scheduled', 'publishing', 'failed'])('does not show Performance for %s posts', (status) => {
        render(<PostPreviewModal post={{ ...post, status }} isOpen onClose={vi.fn()} onRefresh={vi.fn()} />);
        expect(screen.queryByText('Performance')).toBeNull();
        expect(screen.queryByText('Performance unavailable')).toBeNull();
    });

    it.each(['instagram', 'facebook', 'youtube', 'pinterest', 'threads'])('keeps missing analytics hidden for %s', (platform) => {
        render(<PostPreviewModal post={{ ...post, platform }} isOpen onClose={vi.fn()} onRefresh={vi.fn()} />);
        expect(screen.queryByText('Performance')).toBeNull();
    });

    it('preserves Instagram video metrics', () => {
        render(<PerformanceMetrics platform="instagram" isVideo analytics={analytics} />);
        for (const label of ['Impressions', 'Reach', 'Shares', 'Likes', 'Comments', 'Views', 'Avg. Watch Time']) {
            expect(screen.getByText(label)).toBeTruthy();
        }
    });
});
