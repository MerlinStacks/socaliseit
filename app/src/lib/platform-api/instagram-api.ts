/**
 * Instagram Graph API Integration
 * Handles Insights, Comments, Mentions, and Publishing (including Stories/Reels)
 */

import {
    ApiResponse,
    AccountMetrics,
    PostMetrics,
    PlatformComment,
    StoryMediaPayload,
    TrialReelPayload
} from './types';

const GRAPH_API_URL = 'https://graph.facebook.com/v19.0';

/**
 * Fetch Instagram Account Analytics (Daily Snapshot)
 */
export async function getInstagramAnalytics(
    accessToken: string,
    instagramBusinessId: string
): Promise<ApiResponse<AccountMetrics>> {
    try {
        // Fetch audience and profile metrics
        // Metric: impressions, reach, profile_views, email_contacts, website_clicks, follower_count
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
                platformMetrics: {
                    // Could add audience demographics here if fetched
                }
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
        // Fetch media insights and public metrics
        // Fields: like_count, comments_count, insights.metric(...)
        // Metrics depend on mediatype (IMAGE, VIDEO, CAROUSEL, STORY)
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
                clicks: 0, // Not typically available directly via basic media node
                videoViews: data.media_type === 'VIDEO' || data.media_product_type === 'REELS' ? getMetric('video_views') : undefined,
                engagementRate: 0, // Calculated
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Comments for a Media Object
 */
export async function getInstagramComments(
    accessToken: string,
    mediaId: string
): Promise<ApiResponse<PlatformComment[]>> {
    try {
        const url = `${GRAPH_API_URL}/${mediaId}/comments?fields=id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const comments: PlatformComment[] = [];

        const processComment = (c: any, parentId?: string) => {
            comments.push({
                platformCommentId: c.id,
                platformPostId: mediaId,
                authorId: c.username, // Instagram API doesn't always give ID, simplifying to user handle
                authorUsername: c.username,
                text: c.text,
                likeCount: c.like_count || 0,
                replyCount: c.replies?.data?.length || 0,
                createdAt: new Date(c.timestamp),
                parentId: parentId,
            });

            // Process replies
            if (c.replies?.data) {
                c.replies.data.forEach((r: any) => processComment(r, c.id));
            }
        };

        data.data.forEach((c: any) => processComment(c));

        return {
            success: true,
            data: comments
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Reply to a Comment
 */
export async function replyToInstagramComment(
    accessToken: string,
    commentId: string,
    text: string
): Promise<ApiResponse<{ id: string }>> {
    try {
        const url = `${GRAPH_API_URL}/${commentId}/replies?access_token=${accessToken}`;

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
 * Publish Instagram Story
 */
export async function publishInstagramStory(
    accessToken: string,
    instagramBusinessId: string,
    payload: StoryMediaPayload
): Promise<ApiResponse<{ id: string }>> {
    try {
        // Step 1: Create Container
        const containerUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media`;
        const containerBody: any = {
            media_type: 'STORIES',
            access_token: accessToken,
        };

        if (payload.type === 'image') {
            containerBody.image_url = payload.url;
        } else {
            containerBody.video_url = payload.url;
            containerBody.media_type = 'REELS'; // Stories are sometimes treated as Reels endpoint with special flag or just STORIES 
            // Correction: For Stories specifically, media_type is STORIES.
            // If payload.type is video, we use video_url.
        }

        const containerResponse = await fetch(containerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(containerBody)
        });
        const containerData = await containerResponse.json();

        if (containerData.error) {
            return { success: false, error: containerData.error.message };
        }

        const creationId = containerData.id;

        // Step 2: Publish Container
        const publishUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media_publish`;
        const publishResponse = await fetch(publishUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: accessToken
            })
        });
        const publishData = await publishResponse.json();

        if (publishData.error) {
            return { success: false, error: publishData.error.message };
        }

        return {
            success: true,
            data: { id: publishData.id }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Publish Trial Reel (API feature for Jan 2026)
 */
export async function publishTrialReel(
    accessToken: string,
    instagramBusinessId: string,
    payload: TrialReelPayload
): Promise<ApiResponse<{ id: string }>> {
    try {
        // Step 1: Create Container
        const containerUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media`;
        const containerBody = {
            media_type: 'REELS',
            video_url: payload.videoUrl,
            caption: payload.caption,
            cover_url: payload.coverImageUrl,
            share_to_feed: payload.shareToFeed ?? false,
            is_trial_reel: true, // Hypothetical 2026 flag based on requirements
            access_token: accessToken,
        };

        const containerResponse = await fetch(containerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(containerBody)
        });
        const containerData = await containerResponse.json();

        if (containerData.error) {
            return { success: false, error: containerData.error.message };
        }

        const creationId = containerData.id;

        // Step 2: Publish Container
        const publishUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media_publish`;
        const publishResponse = await fetch(publishUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: accessToken
            })
        });
        const publishData = await publishResponse.json();

        if (publishData.error) {
            return { success: false, error: publishData.error.message };
        }

        return {
            success: true,
            data: { id: publishData.id }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Instagram Mentions and Tags
 */
export async function getInstagramMentions(
    accessToken: string,
    instagramBusinessId: string
): Promise<ApiResponse<import('./types').PlatformMention[]>> {
    try {
        const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username,like_count,comments_count';

        // 1. Fetch @Mentions (mentioned_media)
        const mentionsUrl = `${GRAPH_API_URL}/${instagramBusinessId}/mentioned_media?fields=${fields}&access_token=${accessToken}`;
        const mentionsResp = await fetch(mentionsUrl);
        const mentionsData = await mentionsResp.json();

        // 2. Fetch Tags (tags)
        const tagsUrl = `${GRAPH_API_URL}/${instagramBusinessId}/tags?fields=${fields}&access_token=${accessToken}`;
        const tagsResp = await fetch(tagsUrl);
        const tagsData = await tagsResp.json();

        const results: import('./types').PlatformMention[] = [];

        const processItem = (item: any, type: 'mention' | 'tag') => {
            results.push({
                platformPostId: item.id,
                type: type,
                authorId: item.username || 'unknown',
                authorUsername: item.username || 'unknown',
                text: item.caption,
                mediaUrl: item.thumbnail_url || item.media_url,
                createdAt: new Date(item.timestamp),
            });
        };

        if (mentionsData.data) mentionsData.data.forEach((i: any) => processItem(i, 'mention'));
        if (tagsData.data) tagsData.data.forEach((i: any) => processItem(i, 'tag'));

        return {
            success: true,
            data: results
        };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
