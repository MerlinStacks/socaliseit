/**
 * Instagram Analytics Functions
 * Why: Account and post insights for the analytics dashboard.
 */

import { ApiResponse, AccountMetrics, PostMetrics } from '../types';
import { GRAPH_API_URL } from './constants';

/**
 * Fetch Instagram Account Analytics (Daily Snapshot)
 */
export async function getInstagramAnalytics(
    accessToken: string,
    instagramBusinessId: string
): Promise<ApiResponse<AccountMetrics>> {
    try {
        // Fetch audience and profile metrics
        const url = `${GRAPH_API_URL}/${instagramBusinessId}?fields=followers_count,follows_count,insights.metric(impressions,reach,profile_views,email_contacts,website_clicks)&period=day&access_token=${accessToken}`;

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
                impressions: getMetric('impressions'),
                reach: getMetric('reach'),
                profileViews: getMetric('profile_views'),
                websiteClicks: getMetric('website_clicks'),
                emailClicks: getMetric('email_contacts'),
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
 */
export async function getInstagramPostAnalytics(
    accessToken: string,
    mediaId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        // Fields: like_count, comments_count, insights.metric(...)
        const url = `${GRAPH_API_URL}/${mediaId}?fields=media_product_type,media_type,like_count,comments_count,insights.metric(impressions,reach,saved,video_views,engagement,shares)&access_token=${accessToken}`;

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

        return {
            success: true,
            data: {
                likes: data.like_count || 0,
                comments: data.comments_count || 0,
                impressions: getMetric('impressions'),
                reach: getMetric('reach'),
                saves: getMetric('saved'),
                shares: getMetric('shares'),
                clicks: 0,
                videoViews: data.media_type === 'VIDEO' || data.media_product_type === 'REELS' ? getMetric('video_views') : undefined,
                engagementRate: 0,
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
