/**
 * Pinterest API V5 Integration
 * Handles User and Pin Analytics
 */

import {
    ApiResponse,
    AccountMetrics,
    PostMetrics
} from './types';

const PINTEREST_API_URL = 'https://api.pinterest.com/v5';

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
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Pin Analytics
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
            return { success: false, error: data.message };
        }

        const summary = data.summary_metrics || {};

        return {
            success: true,
            data: {
                impressions: summary.IMPRESSION || 0,
                reach: 0,
                likes: 0, // "Saves" are the primary metric
                comments: 0, // Requires checking Pin object
                shares: 0,
                saves: summary.SAVE || 0,
                clicks: summary.PIN_CLICK || 0,
                engagementRate: 0,
                platformMetrics: {
                    outbound_clicks: summary.OUTBOUND_CLICK || 0
                }
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
