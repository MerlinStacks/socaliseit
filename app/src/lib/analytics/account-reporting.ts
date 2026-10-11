/** Legacy rolling snapshots must never be added together as daily activity. */
export function dailyAccountMetrics<T extends {
    impressions: number; reach: number; profileViews: number; websiteClicks: number;
    engagementRate: number; platformMetrics?: unknown;
    socialAccount: { platform: string };
}>(row: T): T {
    const platform = row.socialAccount.platform.toUpperCase();
    const metadata = row.platformMetrics as Record<string, unknown> | null;
    if ((platform === 'PINTEREST' && metadata?.reporting_period !== 'day')
        || platform === 'GOOGLE_BUSINESS') {
        return { ...row, impressions: 0, reach: 0, profileViews: 0, websiteClicks: 0, engagementRate: 0 };
    }
    if (platform === 'YOUTUBE') {
        return { ...row, impressions: 0, reach: 0, profileViews: 0 };
    }
    if (platform === 'FACEBOOK') return { ...row, impressions: 0 };
    return row;
}

export const ACCOUNT_REPORT_NOTE = 'Activity totals include daily API metrics only. Legacy Pinterest 30-day snapshots and Google Business rolling snapshots are excluded; they cannot be converted into daily activity. YouTube views and Facebook page visits are not impressions. Reach is summed daily reach, not unique people across the report period.';
