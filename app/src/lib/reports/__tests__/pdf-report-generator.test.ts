import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ analytics: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {
    organization: { findUnique: async () => ({ name: 'Test', logo: null }) },
    platformAnalytics: { findMany: mocks.analytics },
    post: { findMany: async () => [] },
} }));
import { fetchReportData } from '../pdf-report-generator';

describe('report activity totals', () => {
    it('excludes overlapping snapshots from totals, charts and predictions', async () => {
        mocks.analytics.mockResolvedValue([
            { date: new Date('2026-10-01'), impressions: 1000, reach: 0, profileViews: 0,
                websiteClicks: 5, engagementRate: 2, followers: 10, followersChange: 1,
                socialAccount: { platform: 'PINTEREST' }, platformMetrics: null },
            { date: new Date('2026-10-02'), impressions: 1000, reach: 0, profileViews: 0,
                websiteClicks: 5, engagementRate: 2, followers: 11, followersChange: 1,
                socialAccount: { platform: 'PINTEREST' }, platformMetrics: null },
            { date: new Date('2026-10-03'), impressions: 25, reach: 0, profileViews: 0,
                websiteClicks: 1, engagementRate: 4, followers: 12, followersChange: 1,
                socialAccount: { platform: 'PINTEREST' }, platformMetrics: { reporting_period: 'day' } },
        ]);
        const data = await fetchReportData({ organizationId: 'org',
            dateRange: { start: new Date('2026-10-01'), end: new Date('2026-10-04') },
            metrics: ['impressions'], includeCompetitors: false, includePredictions: true, groupBy: 'day',
        });
        expect(data.summary.totalImpressions).toBe(25);
        expect(data.summary.totalFollowersGained).toBe(3);
        expect(data.metrics.map(row => row.impressions)).toEqual([0, 0, 25]);
        expect(data.predictions?.nextWeekEstimate.impressions).toBeLessThan(100);
        expect(data.notes?.[0]).toContain('excluded');
    });
});
