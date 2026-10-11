import { describe, expect, it } from 'vitest';
import { dailyAccountMetrics } from '../account-reporting';

const row = {
    impressions: 100, reach: 50, profileViews: 20, websiteClicks: 10,
    engagementRate: 5, followers: 200, followersChange: 3,
    socialAccount: { platform: 'PINTEREST' },
};

describe('daily account reporting', () => {
    it('does not multiply rolling snapshots by the number of sync days', () => {
        const rows = Array.from({ length: 30 }, () => dailyAccountMetrics(row));
        expect(rows.reduce((sum, item) => sum + item.impressions, 0)).toBe(0);
        expect(rows.reduce((sum, item) => sum + item.websiteClicks, 0)).toBe(0);
        expect(rows[0].followers).toBe(200);
    });
    it('includes real daily Pinterest activity', () => {
        expect(dailyAccountMetrics({ ...row, platformMetrics: { reporting_period: 'day' } }).impressions).toBe(100);
    });
    it('removes legacy YouTube proxies', () => {
        expect(dailyAccountMetrics({ ...row, socialAccount: { platform: 'YOUTUBE' } })).toMatchObject({
            impressions: 0, reach: 0, profileViews: 0, followersChange: 3,
        });
    });
    it('retains Facebook page visits only as profile views', () => {
        expect(dailyAccountMetrics({ ...row, socialAccount: { platform: 'FACEBOOK' } })).toMatchObject({
            impressions: 0, profileViews: 20,
        });
    });
    it('preserves Instagram daily metrics', () => {
        const instagram = { ...row, socialAccount: { platform: 'INSTAGRAM' } };
        expect(dailyAccountMetrics(instagram)).toEqual(instagram);
    });
});
