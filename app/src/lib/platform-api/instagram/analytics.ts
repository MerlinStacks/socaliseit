/**
 * Instagram Analytics Functions
 * Why: Account and post insights for the analytics dashboard.
 *
 * Updated Feb 2026: Migrated from deprecated Graph API metrics.
 * - `impressions` → `views` (deprecated for all versions Apr 2025)
 * - `email_contacts` → removed (deprecated Jan 2025)
 * - `website_clicks` → `profile_links_taps` (deprecated Jan 2025)
 * - `profile_views` → removed from time-series insights (deprecated Jan 2025)
 * - `video_views` → merged into `views` (deprecated Jan 2025)
 * - `engagement` → never a valid insight metric; calculated client-side
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/insights
 */

import { ApiResponse, AccountMetrics, PostMetrics } from '../types';
import { GRAPH_API_URL } from './constants';

/**
 * Fetch Instagram Account Analytics (Daily Snapshot)
 * Uses current Graph API v21+ metrics: views, reach, profile_links_taps,
 * accounts_engaged, total_interactions.
 */
export async function getInstagramAnalytics(
    accessToken: string,
    instagramBusinessId: string
): Promise<ApiResponse<AccountMetrics>> {
    try {
        // Why: `views` and `profile_links_taps` require `metric_type=total_value` (Graph API v21+).
        // `reach` is a time-series metric requiring `period=day`. These cannot be mixed in one call.
        const baseUrl = `${GRAPH_API_URL}/${instagramBusinessId}`;
        const timeSeriesUrl = `${baseUrl}/insights?metric=reach&period=day&access_token=${accessToken}`;
        const totalValueUrl = `${baseUrl}/insights?metric=views,profile_links_taps&period=day&metric_type=total_value&access_token=${accessToken}`;
        const profileUrl = `${baseUrl}?fields=followers_count,follows_count&access_token=${accessToken}`;

        const [timeSeriesRes, totalValueRes, profileRes] = await Promise.all([
            fetch(timeSeriesUrl).then(r => r.json()),
            fetch(totalValueUrl).then(r => r.json()),
            fetch(profileUrl).then(r => r.json()),
        ]);

        if (profileRes.error) {
            return { success: false, error: profileRes.error.message, errorCode: profileRes.error.code };
        }

        const makeGetter = (insightsData: any[]) => (name: string) => {
            const item = insightsData.find((i: any) => i.name === name);
            return item?.total_value?.value ?? item?.values?.[0]?.value ?? 0;
        };

        const getTimeSeries = makeGetter(timeSeriesRes.data || []);
        const getTotalValue = makeGetter(totalValueRes.data || []);

        return {
            success: true,
            data: {
                followers: profileRes.followers_count || 0,
                followersChange: 0, // Calculated by comparing with DB previous day
                following: profileRes.follows_count || 0,
                // Why: `views` replaces the deprecated `impressions` metric
                impressions: getTotalValue('views'),
                reach: getTimeSeries('reach'),
                // Why: `profile_views` fully deprecated Jan 2025 — no replacement exists
                profileViews: 0,
                // Why: `profile_links_taps` replaces the deprecated `website_clicks`
                websiteClicks: getTotalValue('profile_links_taps'),
                // Why: `email_contacts` was fully deprecated with no replacement
                emailClicks: 0,
                engagementRate: 0, // Calculated derived metric
                platformMetrics: {}
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Analytics for a Specific Post
 * Uses current Graph API v21+ media metrics: views, reach, saved, shares, likes, comments.
 */
export async function getInstagramPostAnalytics(
    accessToken: string,
    mediaId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        // Why: `views` replaces both `impressions` and `video_views`.
        // `engagement` was never a valid insight metric; we calculate it below.
        const url = `${GRAPH_API_URL}/${mediaId}?fields=media_product_type,media_type,like_count,comments_count,insights.metric(views,reach,saved,shares)&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const insights = data.insights?.data || [];
        const getMetric = (name: string) => {
            const item = insights.find((i: any) => i.name === name);
            return item?.values?.[0]?.value || 0;
        };

        const views = getMetric('views');
        const isVideo = data.media_type === 'VIDEO' || data.media_product_type === 'REELS';

        return {
            success: true,
            data: {
                likes: data.like_count || 0,
                comments: data.comments_count || 0,
                // Why: `views` is the unified replacement for `impressions`
                impressions: views,
                reach: getMetric('reach'),
                saves: getMetric('saved'),
                shares: getMetric('shares'),
                clicks: 0,
                // Why: `video_views` merged into `views` — use same value for video content
                videoViews: isVideo ? views : undefined,
                engagementRate: 0,
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Analytics for an Instagram Story
 *
 * Why: Stories use a different set of insight metrics than feed posts or reels.
 * The standard `views,reach,saved,shares` metrics are NOT supported for stories.
 * Instead, stories expose: `impressions`, `reach`, `replies`, `taps_forward`,
 * `taps_back`, and `exits`.
 *
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/insights
 */
export async function getInstagramStoryAnalytics(
    accessToken: string,
    mediaId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        // Why: Story insights use a different metric set than feed/reel content.
        // `impressions` and `reach` are available, but `views`, `saved`, `shares` are not.
        // Story-specific metrics: `taps_forward`, `taps_back`, `exits`, `replies`.
        const url = `${GRAPH_API_URL}/${mediaId}/insights?metric=impressions,reach,replies,taps_forward,taps_back,exits&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const insights = data.data || [];
        const getMetric = (name: string) => {
            const item = insights.find((i: any) => i.name === name);
            return item?.values?.[0]?.value || 0;
        };

        const impressions = getMetric('impressions');
        const reach = getMetric('reach');
        const replies = getMetric('replies');
        const tapsForward = getMetric('taps_forward');
        const tapsBack = getMetric('taps_back');
        const exits = getMetric('exits');

        return {
            success: true,
            data: {
                // Why: Map story metrics to the generic PostMetrics shape.
                // `replies` is closest to `comments`; stories don't have likes/shares.
                impressions,
                reach,
                likes: 0,
                comments: replies,
                shares: 0,
                saves: 0,
                clicks: 0,
                engagementRate: 0,
                // Why: Store story-specific metrics in platformMetrics
                // so the UI can optionally display taps/exits later.
                platformMetrics: {
                    taps_forward: tapsForward,
                    taps_back: tapsBack,
                    exits,
                    replies,
                },
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Audience activity grid: day (0–6, Sun–Sat) → hour (0–23) → follower count online.
 * Why: Used by smart-scheduling to find when this account's audience is actually online,
 * rather than relying on generic industry benchmarks.
 */
export type OnlineFollowersGrid = Record<number, Record<number, number>>;

/**
 * Fetch follower online-activity data from Instagram Graph API.
 * Uses the `online_followers` insight metric (lifetime period).
 *
 * Why: This is the only reliable, per-account signal for when followers
 * are actually on the platform. Available for Business/Creator accounts
 * with ≥100 followers. Returns null if the metric is unavailable.
 *
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/insights
 */
export async function getInstagramOnlineFollowers(
    accessToken: string,
    instagramBusinessId: string
): Promise<ApiResponse<OnlineFollowersGrid>> {
    try {
        // Why: `online_followers` requires `period=lifetime` and returns a 24h
        // array for each of the last 30 days. The API groups by UTC-07:00 periods.
        const url = `${GRAPH_API_URL}/${instagramBusinessId}/insights?metric=online_followers&period=lifetime&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            // Why: Accounts with <100 followers return an error for this metric.
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const onlineFollowers = data.data?.[0];
        if (!onlineFollowers?.values?.length) {
            return { success: false, error: 'No online_followers data available' };
        }

        // Why: Build a day×hour grid averaged across all available days.
        // Each value entry has shape: { end_time, value: { "0": N, "1": N, ... "23": N } }
        const grid: OnlineFollowersGrid = {};
        const counts: Record<number, Record<number, number[]>> = {};

        for (const entry of onlineFollowers.values) {
            if (!entry.value || typeof entry.value !== 'object') continue;

            const entryDate = new Date(entry.end_time);
            const dayOfWeek = entryDate.getUTCDay(); // 0=Sun, 6=Sat

            if (!counts[dayOfWeek]) counts[dayOfWeek] = {};

            for (const [hourStr, count] of Object.entries(entry.value)) {
                const hour = parseInt(hourStr, 10);
                if (isNaN(hour) || hour < 0 || hour > 23) continue;
                if (!counts[dayOfWeek][hour]) counts[dayOfWeek][hour] = [];
                counts[dayOfWeek][hour].push(count as number);
            }
        }

        // Why: Average across multiple weeks of data for a stable signal.
        for (const [dayStr, hours] of Object.entries(counts)) {
            const day = parseInt(dayStr, 10);
            grid[day] = {};
            for (const [hourStr, values] of Object.entries(hours)) {
                const hour = parseInt(hourStr, 10);
                grid[day][hour] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
            }
        }

        return { success: true, data: grid };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
