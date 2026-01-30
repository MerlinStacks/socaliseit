/**
 * Facebook Graph API Integration (Pages)
 * Handles Page Insights and Post Engagement
 */

import {
    ApiResponse,
    AccountMetrics,
    PostMetrics,
    PlatformComment
} from './types';

const GRAPH_API_URL = 'https://graph.facebook.com/v19.0';

/**
 * Fetch Facebook Page Analytics
 */
export async function getFacebookPageAnalytics(
    accessToken: string,
    pageId: string
): Promise<ApiResponse<AccountMetrics>> {
    try {
        // Fetch page details and insights
        // page_impressions, page_post_engagements, page_fans
        const metrics = 'page_impressions,page_post_engagements,page_fans,page_views_total';
        const url = `${GRAPH_API_URL}/${pageId}/insights?metric=${metrics}&period=day&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const getMetric = (name: string) => {
            const item = data.data?.find((i: any) => i.name === name);
            // Insights values are usually arrays [{value: 123, end_time: ...}]
            // We take the most recent one
            return item?.values?.[0]?.value || 0;
        };

        // Also fetch followers count directly from page object if needed, but page_fans in insights covers it.
        // Let's check page object for 'followers_count' (new page experience) vs 'fan_count' (classic)
        const pageResponse = await fetch(`${GRAPH_API_URL}/${pageId}?fields=fan_count,followers_count&access_token=${accessToken}`);
        const pageData = await pageResponse.json();

        return {
            success: true,
            data: {
                followers: pageData.followers_count || pageData.fan_count || 0,
                followersChange: 0,
                following: 0,
                impressions: getMetric('page_impressions'),
                reach: 0, // 'page_impressions_unique' could be used for reach
                engagementRate: 0,
                profileViews: getMetric('page_views_total'),
                websiteClicks: 0, // 'page_website_clicks_logged_in_unique' is one option
                emailClicks: 0,
                platformMetrics: {
                    post_engagements: getMetric('page_post_engagements')
                }
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Analytics for a Specific Facebook Post
 */
export async function getFacebookPostAnalytics(
    accessToken: string,
    postId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        // Post insights
        // post_impressions, post_impressions_unique, post_clicks, post_reactions_like_total
        const metrics = 'post_impressions,post_impressions_unique,post_clicks,post_reactions_like_total_summary,post_reactions_love_total,post_reactions_wow_total'; // etc
        // Or get object fields: shares, comments

        // 1. Get public fields
        const postUrl = `${GRAPH_API_URL}/${postId}?fields=shares,comments.summary(true),likes.summary(true)&access_token=${accessToken}`;
        const postData = await (await fetch(postUrl)).json();

        // 2. Get insights
        const insightsUrl = `${GRAPH_API_URL}/${postId}/insights?metric=post_impressions,post_impressions_unique,post_clicks&access_token=${accessToken}`;
        const insightsData = await (await fetch(insightsUrl)).json();

        if (postData.error) return { success: false, error: postData.error.message };

        const getMetric = (name: string) => {
            const item = insightsData.data?.find((i: any) => i.name === name);
            return item?.values?.[0]?.value || 0;
        };

        return {
            success: true,
            data: {
                likes: postData.likes?.summary?.total_count || 0,
                comments: postData.comments?.summary?.total_count || 0,
                shares: postData.shares?.count || 0,
                impressions: getMetric('post_impressions'),
                reach: getMetric('post_impressions_unique'),
                clicks: getMetric('post_clicks'),
                saves: 0,
                engagementRate: 0,
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Comments for a Facebook Post
 */
export async function getFacebookComments(
    accessToken: string,
    postId: string
): Promise<ApiResponse<PlatformComment[]>> {
    try {
        const url = `${GRAPH_API_URL}/${postId}/comments?fields=id,message,from{name,id,picture},created_time,like_count,comment_count,is_hidden,comments{id,message,from,created_time,like_count}&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const comments: PlatformComment[] = [];

        const processComment = (c: any, parentId?: string) => {
            const author = c.from || {};
            comments.push({
                platformCommentId: c.id,
                platformPostId: postId,
                authorId: author.id || 'unknown',
                authorUsername: author.name || 'Unknown User',
                authorAvatar: author.picture?.data?.url,
                text: c.message,
                likeCount: c.like_count || 0,
                replyCount: c.comment_count || 0,
                createdAt: new Date(c.created_time),
                parentId: parentId,
                isHidden: c.is_hidden
            });

            // Process threaded replies
            if (c.comments?.data) {
                c.comments.data.forEach((r: any) => processComment(r, c.id));
            }
        };

        data.data?.forEach((c: any) => processComment(c));

        return {
            success: true,
            data: comments
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Reply to Facebook Comment
 */
export async function replyToFacebookComment(
    accessToken: string,
    commentId: string,
    text: string
): Promise<ApiResponse<{ id: string }>> {
    try {
        const url = `${GRAPH_API_URL}/${commentId}/comments?access_token=${accessToken}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        return {
            success: true,
            data: { id: data.id }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Hide/Unhide Facebook Comment
 */
export async function toggleHideFacebookComment(
    accessToken: string,
    commentId: string,
    isHidden: boolean
): Promise<ApiResponse<boolean>> {
    try {
        const url = `${GRAPH_API_URL}/${commentId}?access_token=${accessToken}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_hidden: isHidden })
        });
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        return {
            success: true,
            data: true // API returns true on success
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Facebook Page Mentions (Tagged Posts)
 */
export async function getFacebookMentions(
    accessToken: string,
    pageId: string
): Promise<ApiResponse<import('./types').PlatformMention[]>> {
    try {
        // tagged posts
        const url = `${GRAPH_API_URL}/${pageId}/tagged?fields=id,message,created_time,from{name,id,picture},full_picture&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const mentions: import('./types').PlatformMention[] = [];

        data.data?.forEach((item: any) => {
            const author = item.from || {};
            mentions.push({
                platformPostId: item.id,
                type: 'tag', // Facebook 'tagged'
                authorId: author.id || 'unknown',
                authorUsername: author.name || 'unknown',
                authorAvatar: author.picture?.data?.url,
                text: item.message,
                mediaUrl: item.full_picture,
                createdAt: new Date(item.created_time),
            });
        });

        return {
            success: true,
            data: mentions
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
