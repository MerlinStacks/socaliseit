/**
 * Pinterest API V5 Integration
 * Handles User and Pin Analytics
 */

import {
    ApiResponse,
    AccountMetrics,
    PostMetrics
} from './types';
import { PINTEREST_API_URL } from './constants';

/**
 * Fetch Pinterest User Analytics
 */
export async function getPinterestUserAnalytics(
    accessToken: string
): Promise<ApiResponse<AccountMetrics>> {
    try {
        // Prepare dates: yesterday (analytics usually has 24-48h delay, but we'll try last available)
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30); // 30 day window for broad metrics

        const startDate = start.toISOString().split('T')[0];
        const endDate = end.toISOString().split('T')[0];

        // 1. Get User Account Info (followers)
        const userUrl = `${PINTEREST_API_URL}/user_account`;
        const userResp = await fetch(userUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const userData = await userResp.json();

        // 2. Get Analytics
        // metrics: IMPRESSION, SAVE, PIN_CLICK, OUTBOUND_CLICK, ENGAGEMENT
        const metrics = 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,ENGAGEMENT';
        const analyticsUrl = `${PINTEREST_API_URL}/user_account/analytics?start_date=${startDate}&end_date=${endDate}&metric_types=${metrics}`;

        const analyticsResp = await fetch(analyticsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const analyticsData = await analyticsResp.json();

        if (analyticsData.code) { // Pinterest errors usually have a code
            return { success: false, error: analyticsData.message };
        }

        // Daily average or total? Pinterest returns daily or summary. 
        // /analytics endpoint returns { all: { summary_metrics: ... }, daily_metrics: ... }
        // We will take summary_metrics (total for period) and average or just used as "last 30d performance"
        // But the type PlatformAnalytics expects "daily snapshot".
        // Let's assume we store the "total reach for last 30d" as "reach" for today.

        const summary = analyticsData.all?.summary_metrics || {};

        return {
            success: true,
            data: {
                followers: userData.follower_count || 0,
                followersChange: 0,
                following: userData.following_count || 0,
                impressions: summary.IMPRESSION || 0,
                reach: 0, // Not explicitly provided in this endpoint
                engagementRate: summary.ENGAGEMENT ? (summary.ENGAGEMENT / (summary.IMPRESSION || 1)) : 0,
                profileViews: 0,
                websiteClicks: summary.OUTBOUND_CLICK || 0,
                emailClicks: 0,
                platformMetrics: {
                    saves: summary.SAVE || 0,
                    pin_clicks: summary.PIN_CLICK || 0
                }
            }
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown Pinterest analytics error';
        return { success: false, error: message };
    }
}

/**
 * Fetch Pin Analytics
 *
 * Why: Pinterest V5 `/pins/{pin_id}/analytics` may nest summary metrics
 * under `all.summary_metrics` or `summary_metrics` depending on API version.
 * We also fall back to the `pin_metrics=true` approach which embeds 90-day
 * and lifetime metrics directly in the pin metadata — more reliable for
 * external/synced pins.
 */
export async function getPinterestPinAnalytics(
    accessToken: string,
    pinId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);

        const startDate = start.toISOString().split('T')[0];
        const endDate = end.toISOString().split('T')[0];

        const metrics = 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK';
        const url = `${PINTEREST_API_URL}/pins/${pinId}/analytics?start_date=${startDate}&end_date=${endDate}&metric_types=${metrics}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        if (data.code) {
            // Why: Analytics endpoint failed — fall back to pin_metrics approach
            return fetchPinMetricsFallback(accessToken, pinId);
        }

        // Why: Pinterest V5 nests summary under `all.summary_metrics` for user
        // analytics but may use `summary_metrics` at the top level for pins.
        // Try both paths to handle API version differences.
        const summary = data.all?.summary_metrics || data.summary_metrics || {};

        // Why: If the summary is empty (no data for the period), the pin may be
        // too old or have daily-only metrics. Aggregate daily values as fallback.
        const hasData = Object.keys(summary).length > 0;
        let impressions = summary.IMPRESSION || 0;
        let saves = summary.SAVE || 0;
        let pinClicks = summary.PIN_CLICK || 0;
        let outboundClicks = summary.OUTBOUND_CLICK || 0;

        if (!hasData) {
            // Why: Some responses return daily_metrics as an array of date-keyed entries.
            // Aggregate all daily values when summary is missing.
            const daily = data.all?.daily_metrics || data.daily_metrics || [];
            if (Array.isArray(daily)) {
                for (const day of daily) {
                    const m = day.data_status === 'READY' ? day : day;
                    impressions += m.IMPRESSION || 0;
                    saves += m.SAVE || 0;
                    pinClicks += m.PIN_CLICK || 0;
                    outboundClicks += m.OUTBOUND_CLICK || 0;
                }
            }

            // Why: If still no data, try the pin_metrics fallback
            if (impressions === 0 && saves === 0 && pinClicks === 0) {
                return fetchPinMetricsFallback(accessToken, pinId);
            }
        }

        return {
            success: true,
            data: {
                impressions,
                reach: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                saves,
                clicks: pinClicks,
                engagementRate: 0,
                platformMetrics: {
                    outbound_clicks: outboundClicks
                }
            }
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown Pinterest pin analytics error';
        return { success: false, error: message };
    }
}

/**
 * Fallback: fetch pin metrics via the pin_metrics=true parameter.
 * Why: The `/pins/{pin_id}?pin_metrics=true` endpoint embeds 90-day and
 * lifetime metrics directly in the pin metadata. More reliable for external
 * or synced pins that may not have analytics endpoint access.
 */
async function fetchPinMetricsFallback(
    accessToken: string,
    pinId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        const url = `${PINTEREST_API_URL}/pins/${pinId}?pin_metrics=true`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        if (data.code || !data.pin_metrics) {
            return {
                success: false,
                error: data.message || 'Pin metrics not available'
            };
        }

        // Why: pin_metrics contains `lifetime_metrics` and `90d_metrics` objects
        const lifetime = data.pin_metrics.lifetime_metrics || {};
        const ninetyDay = data.pin_metrics['90d_metrics'] || {};

        // Prefer 90-day metrics for consistency with user analytics window
        const metrics = Object.keys(ninetyDay).length > 0 ? ninetyDay : lifetime;

        return {
            success: true,
            data: {
                impressions: metrics.impression || metrics.IMPRESSION || 0,
                reach: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                saves: metrics.save || metrics.SAVE || 0,
                clicks: metrics.pin_click || metrics.PIN_CLICK || 0,
                engagementRate: 0,
                platformMetrics: {
                    outbound_clicks: metrics.outbound_click || metrics.OUTBOUND_CLICK || 0
                }
            }
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Pin metrics fallback failed';
        return { success: false, error: message };
    }
}

// ============================================================================
// Trends API (Phase 6 — 2026)
// ============================================================================

/** A single trending topic from Pinterest */
export interface PinterestTrendingTopic {
    id: string;
    keyword: string;
    impressions: number;
    timeSeriesData?: Array<{ date: string; value: number }>;
}

/** A trending product category from Pinterest */
export interface PinterestTrendingCategory {
    id: string;
    name: string;
    rank: number;
    impressions: number;
}

/**
 * Fetch featured trending topics from Pinterest.
 *
 * Why: Gives users insight into what's trending on Pinterest so they
 * can create content aligned with current popular searches.
 *
 * @see https://developers.pinterest.com/docs/api/v5/#operation/trending_topics/list
 */
export async function getPinterestTrendingTopics(
    accessToken: string,
    region = 'US',
    limit = 20
): Promise<ApiResponse<PinterestTrendingTopic[]>> {
    try {
        const url = `${PINTEREST_API_URL}/trends/topics/featured?region=${region}&limit=${limit}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Failed to fetch trending topics',
                errorCode: String(data.code),
            };
        }

        const topics: PinterestTrendingTopic[] = (data.trends || []).map(
            (t: Record<string, unknown>) => ({
                id: t.id as string,
                keyword: t.keyword as string,
                impressions: (t.impressions as number) || 0,
                timeSeriesData: t.time_series_data as Array<{ date: string; value: number }> | undefined,
            })
        );

        return { success: true, data: topics };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Fetch trending product categories from Pinterest.
 *
 * Why: Helps e-commerce users discover which product categories
 * are gaining traction on the platform.
 *
 * @see https://developers.pinterest.com/docs/api/v5/#operation/trending_product_categories/list
 */
export async function getPinterestTrendingCategories(
    accessToken: string,
    region = 'US'
): Promise<ApiResponse<PinterestTrendingCategory[]>> {
    try {
        const url = `${PINTEREST_API_URL}/trends/product_categories/trending?region=${region}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Failed to fetch trending categories',
            };
        }

        const categories: PinterestTrendingCategory[] = (data.categories || []).map(
            (c: Record<string, unknown>, idx: number) => ({
                id: c.id as string,
                name: c.name as string,
                rank: idx + 1,
                impressions: (c.impressions as number) || 0,
            })
        );

        return { success: true, data: categories };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Fetch details for a specific Pinterest product category.
 *
 * Why: After discovering trending categories, users can drill into
 * a specific category to see detailed metrics and keyword data.
 */
export async function getPinterestCategoryDetails(
    accessToken: string,
    categoryId: string,
    region = 'US'
): Promise<ApiResponse<Record<string, unknown>>> {
    try {
        const url = `${PINTEREST_API_URL}/trends/product_categories/details?category_id=${categoryId}&region=${region}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Failed to fetch category details',
            };
        }

        return { success: true, data: data };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}
