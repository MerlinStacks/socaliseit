/**
 * TikTok API Integration
 * Handles Analytics and Comments
 */

import {
    ApiResponse,
    AccountMetrics,
    PostMetrics,
    PlatformComment
} from './types';

const TIKTOK_API_URL = 'https://open.tiktokapis.com/v2';

/**
 * Fetch TikTok Account Analytics
 */
export async function getTikTokAnalytics(
    accessToken: string
): Promise<ApiResponse<AccountMetrics>> {
    try {
        // Fetch user info and stats
        const url = `${TIKTOK_API_URL}/user/info/?fields=follower_count,following_count,likes_count,video_count`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        });
        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            return { success: false, error: data.error.message, errorCode: String(data.error.code) };
        }

        const user = data.data?.user || {};

        return {
            success: true,
            data: {
                followers: user.follower_count || 0,
                followersChange: 0,
                following: user.following_count || 0,
                impressions: 0, // Not available on user level directly via basic display
                reach: 0,
                engagementRate: 0,
                profileViews: 0, // Requires Business API rights
                websiteClicks: 0,
                emailClicks: 0,
                platformMetrics: {
                    likes_count: user.likes_count,
                    video_count: user.video_count
                }
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Video Analytics
 */
export async function getTikTokVideoAnalytics(
    accessToken: string,
    videoIds: string[]
): Promise<ApiResponse<PostMetrics[]>> {
    try {
        const url = `${TIKTOK_API_URL}/video/query/?fields=id,like_count,comment_count,share_count,view_count`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filters: { video_ids: videoIds }
            })
        });
        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            return { success: false, error: data.error.message };
        }

        const videos = data.data?.videos || [];
        const metrics: PostMetrics[] = videos.map((v: any) => ({
            impressions: v.view_count || 0, // View count is closest proxy to impressions
            reach: v.view_count || 0,
            likes: v.like_count || 0,
            comments: v.comment_count || 0,
            shares: v.share_count || 0,
            saves: 0,
            clicks: 0,
            videoViews: v.view_count || 0,
            engagementRate: 0 // to be calculated
        }));

        return {
            success: true,
            data: metrics
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Comments
 */
export async function getTikTokComments(
    accessToken: string,
    videoId: string
): Promise<ApiResponse<PlatformComment[]>> {
    try {
        const url = `${TIKTOK_API_URL}/video/comment/list/?fields=id,text,create_time,user_id,like_count,reply_count`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_id: videoId,
                cursor: 0,
                max_count: 20
            })
        });
        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            return { success: false, error: data.error.message };
        }

        const comments: PlatformComment[] = (data.data?.comments || []).map((c: any) => ({
            platformCommentId: c.id,
            platformPostId: videoId,
            authorId: c.user_id,
            authorUsername: "unknown", // User info requires separate fetch if not expanded
            text: c.text,
            likeCount: c.like_count,
            replyCount: c.reply_count,
            createdAt: new Date(c.create_time * 1000),
        }));

        return {
            success: true,
            data: comments
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Reply to TikTok Comment
 */
export async function replyToTikTokComment(
    accessToken: string,
    videoId: string,
    commentId: string, // Not always used for direct replies if just "post comment on video", but needed for threading
    text: string
): Promise<ApiResponse<{ id: string }>> {
    try {
        const url = `${TIKTOK_API_URL}/video/comment/publish/`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_id: videoId,
                text: text // For reply, API might need parent_comment_id or similar, assuming flat comments for MVP
            })
        });
        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            return { success: false, error: data.error.message };
        }

        return {
            success: true,
            data: { id: data.data?.comment_id }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
