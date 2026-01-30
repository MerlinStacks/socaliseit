/**
 * YouTube Data & Analytics API Integration
 * Handles Channel Insights, Video Metrics, and Comments
 */

import {
    ApiResponse,
    AccountMetrics,
    PostMetrics,
    PlatformComment
} from './types';

const DATA_API_URL = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS_API_URL = 'https://youtubeanalytics.googleapis.com/v2';

/**
 * Fetch YouTube Channel Analytics
 */
export async function getYouTubeChannelAnalytics(
    accessToken: string,
    channelId?: string
): Promise<ApiResponse<AccountMetrics>> {
    try {
        // 1. Get Channel Stats (public data)
        const channelUrl = `${DATA_API_URL}/channels?part=statistics&mine=${!channelId}&id=${channelId || ''}`;

        const channelResponse = await fetch(channelUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const channelData = await channelResponse.json();

        if (channelData.error) {
            return { success: false, error: channelData.error.message };
        }

        const stats = channelData.items?.[0]?.statistics || {};

        // 2. Get Analytics Reports (private data)
        // metric: views, comments, likes, dislikes, estimatedMinutesWatched, averageViewDuration
        const today = new Date().toISOString().split('T')[0];
        const analyticsUrl = `${ANALYTICS_API_URL}/reports?ids=channel==MINE&startDate=2020-01-01&endDate=${today}&metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost&dimensions=day&sort=-day&maxResults=1`;

        // Note: Reporting API provides historical data. For "daily snapshot" we normally ask for specific day range.
        // Simplified here to just use public stats for total counters where applicable, and reporting for watch time.

        const analyticsResponse = await fetch(analyticsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const analyticsData = await analyticsResponse.json();

        // Use reporting data for recent trends if available, else 0
        const recentRow = analyticsData.rows?.[0] || [];
        // [views, estimatedMinutesWatched, averageViewDuration, gained, lost]

        return {
            success: true,
            data: {
                followers: parseInt(stats.subscriberCount) || 0,
                followersChange: (recentRow[3] || 0) - (recentRow[4] || 0),
                following: 0,
                impressions: parseInt(stats.viewCount) || 0, // Channel total views
                reach: 0,
                engagementRate: 0,
                profileViews: parseInt(stats.viewCount) || 0,
                websiteClicks: 0,
                emailClicks: 0,
                platformMetrics: {
                    video_count: parseInt(stats.videoCount),
                    total_watch_minutes: recentRow[1] || 0
                }
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch YouTube Video Analytics
 */
export async function getYouTubeVideoMetrics(
    accessToken: string,
    videoId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        const url = `${DATA_API_URL}/videos?part=statistics&id=${videoId}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const stats = data.items?.[0]?.statistics || {};

        return {
            success: true,
            data: {
                likes: parseInt(stats.likeCount) || 0,
                comments: parseInt(stats.commentCount) || 0,
                shares: 0, // Not available in public stats
                impressions: parseInt(stats.viewCount) || 0,
                reach: parseInt(stats.viewCount) || 0,
                clicks: 0,
                videoViews: parseInt(stats.viewCount) || 0,
                saves: parseInt(stats.favoriteCount) || 0,
                engagementRate: 0
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch YouTube Comments
 */
export async function getYouTubeComments(
    accessToken: string,
    videoId: string
): Promise<ApiResponse<PlatformComment[]>> {
    try {
        const url = `${DATA_API_URL}/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=20`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const comments: PlatformComment[] = [];

        data.items?.forEach((item: any) => {
            const top = item.snippet.topLevelComment.snippet;

            comments.push({
                platformCommentId: item.id,
                platformPostId: videoId,
                authorId: top.authorChannelId.value,
                authorUsername: top.authorDisplayName,
                authorAvatar: top.authorProfileImageUrl,
                text: top.textDisplay,
                likeCount: top.likeCount,
                replyCount: item.snippet.totalReplyCount,
                createdAt: new Date(top.publishedAt),
            });

            // Handle replies if included
            if (item.replies?.comments) {
                item.replies.comments.forEach((reply: any) => {
                    const rSnippet = reply.snippet;
                    comments.push({
                        platformCommentId: reply.id,
                        platformPostId: videoId,
                        authorId: rSnippet.authorChannelId.value,
                        authorUsername: rSnippet.authorDisplayName,
                        authorAvatar: rSnippet.authorProfileImageUrl,
                        text: rSnippet.textDisplay,
                        likeCount: rSnippet.likeCount,
                        replyCount: 0,
                        parentId: item.id,
                        createdAt: new Date(rSnippet.publishedAt),
                    });
                });
            }
        });

        return {
            success: true,
            data: comments
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Reply to YouTube Comment
 */
export async function replyToYouTubeComment(
    accessToken: string,
    parentId: string,
    text: string
): Promise<ApiResponse<{ id: string }>> {
    try {
        const url = `${DATA_API_URL}/comments?part=snippet`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                snippet: {
                    parentId: parentId,
                    textOriginal: text
                }
            })
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
