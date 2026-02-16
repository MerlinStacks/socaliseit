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
        // Why: `profile_views` was fully deprecated Jan 2025 (v21+) — removed.
        const url = `${GRAPH_API_URL}/${instagramBusinessId}?fields=followers_count,follows_count,insights.metric(views,reach,profile_links_taps)&period=day&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const insights = data.insights?.data || [];
        const getMetric = (name: string) => {
            const item = insights.find((i: any) => i.name === name);
            return item?.values?.[0]?.value || 0;
        };

        return {
            success: true,
            data: {
                followers: data.followers_count || 0,
                followersChange: 0, // Calculated by comparing with DB previous day
                following: data.follows_count || 0,
                // Why: `views` replaces the deprecated `impressions` metric
                impressions: getMetric('views'),
                reach: getMetric('reach'),
                // Why: `profile_views` fully deprecated Jan 2025 — no replacement exists
                profileViews: 0,
                // Why: `profile_links_taps` replaces the deprecated `website_clicks`
                websiteClicks: getMetric('profile_links_taps'),
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
