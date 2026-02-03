/**
 * Posts Sync API Functions
 * Fetches published posts from social media platforms for calendar display
 * 
 * Why: Users want to see their entire content calendar including posts
 * published directly on platforms (not through SocialiseIT)
 */

import { ApiResponse } from './types';
import { logger } from '@/lib/logger';

const GRAPH_API_URL = 'https://graph.facebook.com/v24.0';

// ============================================================================
// Types
// ============================================================================

export interface ExternalPost {
    externalId: string;
    platform: 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST';
    caption: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'REEL' | 'STORY';
    mediaUrl?: string;
    thumbnailUrl?: string;
    permalink: string;
    publishedAt: Date;
}

// ============================================================================
// Instagram
// ============================================================================

/**
 * Fetch recent media from an Instagram Business account
 * 
 * Why: Instagram Graph API provides media endpoint to list all posts
 * from a business/creator account within a date range
 * 
 * @param accessToken - Valid Instagram access token
 * @param instagramUserId - Instagram Business Account ID
 * @param since - Fetch posts published after this date
 * @param limit - Maximum number of posts to fetch (default 50)
 */
export async function getInstagramMedia(
    accessToken: string,
    instagramUserId: string,
    since?: Date,
    limit: number = 50
): Promise<ApiResponse<ExternalPost[]>> {
    try {
        const fields = [
            'id',
            'caption',
            'media_type',
            'media_url',
            'thumbnail_url',
            'permalink',
            'timestamp',
        ].join(',');

        let url = `${GRAPH_API_URL}/${instagramUserId}/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`;

        // Instagram doesn't support 'since' directly, so we filter client-side
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            logger.error({ errorData, instagramUserId }, 'Instagram media fetch failed');
            return {
                success: false,
                error: errorData.error?.message || 'Failed to fetch Instagram media',
                errorCode: errorData.error?.code?.toString(),
            };
        }

        const data = await response.json();
        const posts: ExternalPost[] = [];

        for (const item of data.data || []) {
            const publishedAt = new Date(item.timestamp);

            // Filter by 'since' date if provided
            if (since && publishedAt < since) {
                continue;
            }

            posts.push({
                externalId: item.id,
                platform: 'INSTAGRAM',
                caption: item.caption || '',
                mediaType: mapInstagramMediaType(item.media_type),
                mediaUrl: item.media_url,
                thumbnailUrl: item.thumbnail_url || item.media_url,
                permalink: item.permalink,
                publishedAt,
            });
        }

        logger.info({ instagramUserId, postCount: posts.length }, 'Instagram media fetched');

        return { success: true, data: posts };
    } catch (error) {
        logger.error({ error, instagramUserId }, 'Instagram media fetch exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Map Instagram media type to our internal type
 */
function mapInstagramMediaType(igType: string): ExternalPost['mediaType'] {
    switch (igType) {
        case 'IMAGE':
            return 'IMAGE';
        case 'VIDEO':
            return 'VIDEO';
        case 'CAROUSEL_ALBUM':
            return 'CAROUSEL';
        case 'REELS':
            return 'REEL';
        default:
            return 'IMAGE';
    }
}

/**
 * Fetch active Stories from an Instagram Business account
 * 
 * Why: Stories are ephemeral content (24h lifespan) not included in the /media endpoint.
 * The /{ig-user-id}/stories endpoint returns only currently-active stories.
 * 
 * Required permissions: instagram_basic, pages_read_engagement
 * 
 * @param accessToken - Valid Instagram access token
 * @param instagramUserId - Instagram Business Account ID
 */
export async function getInstagramStories(
    accessToken: string,
    instagramUserId: string
): Promise<ApiResponse<ExternalPost[]>> {
    try {
        const fields = [
            'id',
            'media_type',
            'media_url',
            'thumbnail_url',
            'permalink',
            'timestamp',
        ].join(',');

        const url = `${GRAPH_API_URL}/${instagramUserId}/stories?fields=${fields}&access_token=${accessToken}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            logger.error({ errorData, instagramUserId }, 'Instagram stories fetch failed');
            return {
                success: false,
                error: errorData.error?.message || 'Failed to fetch Instagram stories',
                errorCode: errorData.error?.code?.toString(),
            };
        }

        const data = await response.json();
        const posts: ExternalPost[] = [];

        for (const item of data.data || []) {
            posts.push({
                externalId: item.id,
                platform: 'INSTAGRAM',
                caption: '', // Stories don't have captions in API response
                mediaType: 'STORY',
                mediaUrl: item.media_url,
                thumbnailUrl: item.thumbnail_url || item.media_url,
                permalink: item.permalink,
                publishedAt: new Date(item.timestamp),
            });
        }

        logger.info({ instagramUserId, storyCount: posts.length }, 'Instagram stories fetched');

        return { success: true, data: posts };
    } catch (error) {
        logger.error({ error, instagramUserId }, 'Instagram stories fetch exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================================================
// Facebook
// ============================================================================

/**
 * Fetch recent posts from a Facebook Page
 */
export async function getFacebookPagePosts(
    accessToken: string,
    pageId: string,
    since?: Date,
    limit: number = 50
): Promise<ApiResponse<ExternalPost[]>> {
    try {
        const fields = [
            'id',
            'message',
            'full_picture',
            'permalink_url',
            'created_time',
            'attachments{type,media_type}',
        ].join(',');

        let url = `${GRAPH_API_URL}/${pageId}/published_posts?fields=${fields}&limit=${limit}&access_token=${accessToken}`;

        if (since) {
            url += `&since=${Math.floor(since.getTime() / 1000)}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            logger.error({ errorData, pageId }, 'Facebook posts fetch failed');
            return {
                success: false,
                error: errorData.error?.message || 'Failed to fetch Facebook posts',
                errorCode: errorData.error?.code?.toString(),
            };
        }

        const data = await response.json();
        const posts: ExternalPost[] = [];

        for (const item of data.data || []) {
            posts.push({
                externalId: item.id,
                platform: 'FACEBOOK',
                caption: item.message || '',
                mediaType: 'IMAGE', // Simplified; could parse attachments
                thumbnailUrl: item.full_picture,
                permalink: item.permalink_url,
                publishedAt: new Date(item.created_time),
            });
        }

        logger.info({ pageId, postCount: posts.length }, 'Facebook posts fetched');

        return { success: true, data: posts };
    } catch (error) {
        logger.error({ error, pageId }, 'Facebook posts fetch exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Fetch active Stories from a Facebook Page
 * 
 * Why: Stories are ephemeral content (24h lifespan) not included in published_posts.
 * The /{page-id}/stories endpoint returns only currently-active stories.
 * 
 * Required permissions: pages_read_engagement
 * 
 * @param accessToken - Valid Facebook Page access token  
 * @param pageId - Facebook Page ID
 */
export async function getFacebookPageStories(
    accessToken: string,
    pageId: string
): Promise<ApiResponse<ExternalPost[]>> {
    try {
        const fields = [
            'id',
            'media_type',
            'url', // Story URL
            'permalink_url',
            'created_time',
        ].join(',');

        const url = `${GRAPH_API_URL}/${pageId}/stories?fields=${fields}&access_token=${accessToken}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            // Don't log as error if it's just "no stories" (common case)
            if (errorData.error?.code !== 100) {
                logger.error({ errorData, pageId }, 'Facebook stories fetch failed');
            }
            return {
                success: false,
                error: errorData.error?.message || 'Failed to fetch Facebook stories',
                errorCode: errorData.error?.code?.toString(),
            };
        }

        const data = await response.json();
        const posts: ExternalPost[] = [];

        for (const item of data.data || []) {
            posts.push({
                externalId: item.id,
                platform: 'FACEBOOK',
                caption: '', // Stories don't have captions
                mediaType: 'STORY',
                thumbnailUrl: item.url, // Story URL can serve as thumbnail
                permalink: item.permalink_url || `https://facebook.com/stories/${item.id}`,
                publishedAt: new Date(item.created_time),
            });
        }

        logger.info({ pageId, storyCount: posts.length }, 'Facebook stories fetched');

        return { success: true, data: posts };
    } catch (error) {
        logger.error({ error, pageId }, 'Facebook stories fetch exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================================================
// TikTok
// ============================================================================

/**
 * Fetch recent videos from a TikTok account
 * 
 * Why: TikTok API requires explicit `fields` query parameter to return video data.
 * Without it, the API returns minimal or empty responses.
 */
export async function getTikTokVideos(
    accessToken: string,
    since?: Date,
    limit: number = 20
): Promise<ApiResponse<ExternalPost[]>> {
    try {
        // TikTok requires explicit field selection via query parameter
        const fields = 'id,title,create_time,cover_image_url,share_url,video_description';
        const response = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                max_count: limit,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            logger.error({ errorData }, 'TikTok videos fetch failed');
            return {
                success: false,
                error: errorData.error?.message || 'Failed to fetch TikTok videos',
            };
        }

        const data = await response.json();
        const posts: ExternalPost[] = [];

        for (const item of data.data?.videos || []) {
            const publishedAt = new Date(item.create_time * 1000);

            if (since && publishedAt < since) {
                continue;
            }

            posts.push({
                externalId: item.id,
                platform: 'TIKTOK',
                caption: item.title || '',
                mediaType: 'VIDEO',
                thumbnailUrl: item.cover_image_url,
                permalink: item.share_url,
                publishedAt,
            });
        }

        logger.info({ postCount: posts.length }, 'TikTok videos fetched');

        return { success: true, data: posts };
    } catch (error) {
        logger.error({ error }, 'TikTok videos fetch exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================================================
// YouTube
// ============================================================================

/**
 * Fetch recent videos from a YouTube channel
 */
export async function getYouTubeVideos(
    accessToken: string,
    channelId: string,
    since?: Date,
    limit: number = 50
): Promise<ApiResponse<ExternalPost[]>> {
    try {
        // First, get the uploads playlist ID
        const channelResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}`,
            {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            }
        );

        if (!channelResponse.ok) {
            const errorData = await channelResponse.json();
            return {
                success: false,
                error: errorData.error?.message || 'Failed to fetch channel',
            };
        }

        const channelData = await channelResponse.json();
        const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

        if (!uploadsPlaylistId) {
            return { success: false, error: 'Could not find uploads playlist' };
        }

        // Fetch videos from uploads playlist
        let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${limit}`;

        if (since) {
            url += `&publishedAfter=${since.toISOString()}`;
        }

        const videosResponse = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!videosResponse.ok) {
            const errorData = await videosResponse.json();
            return {
                success: false,
                error: errorData.error?.message || 'Failed to fetch videos',
            };
        }

        const videosData = await videosResponse.json();
        const posts: ExternalPost[] = [];

        for (const item of videosData.items || []) {
            const snippet = item.snippet;
            posts.push({
                externalId: item.contentDetails?.videoId || item.id,
                platform: 'YOUTUBE',
                caption: snippet?.title || '',
                mediaType: 'VIDEO',
                thumbnailUrl: snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url,
                permalink: `https://www.youtube.com/watch?v=${item.contentDetails?.videoId}`,
                publishedAt: new Date(snippet?.publishedAt),
            });
        }

        logger.info({ channelId, postCount: posts.length }, 'YouTube videos fetched');

        return { success: true, data: posts };
    } catch (error) {
        logger.error({ error, channelId }, 'YouTube videos fetch exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================================================
// Pinterest
// ============================================================================

/**
 * Fetch recent pins from Pinterest user
 */
export async function getPinterestPins(
    accessToken: string,
    since?: Date,
    limit: number = 50
): Promise<ApiResponse<ExternalPost[]>> {
    try {
        const response = await fetch(
            `https://api.pinterest.com/v5/pins?page_size=${limit}`,
            {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            return {
                success: false,
                error: errorData.message || 'Failed to fetch Pinterest pins',
            };
        }

        const data = await response.json();
        const posts: ExternalPost[] = [];

        for (const item of data.items || []) {
            const publishedAt = new Date(item.created_at);

            if (since && publishedAt < since) {
                continue;
            }

            posts.push({
                externalId: item.id,
                platform: 'PINTEREST',
                caption: item.title || item.description || '',
                mediaType: 'IMAGE',
                thumbnailUrl: item.media?.images?.['600x']?.url,
                permalink: `https://pinterest.com/pin/${item.id}`,
                publishedAt,
            });
        }

        logger.info({ postCount: posts.length }, 'Pinterest pins fetched');

        return { success: true, data: posts };
    } catch (error) {
        logger.error({ error }, 'Pinterest pins fetch exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
