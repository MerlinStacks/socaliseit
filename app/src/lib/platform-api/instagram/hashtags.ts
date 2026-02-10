/**
 * Instagram Hashtag & UGC Discovery Functions
 * Why: Discover and curate user content via hashtag and mention searches.
 */

import { ApiResponse, HashtagMedia, HashtagSearchResult, PlatformMention } from '../types';
import { GRAPH_API_URL } from './constants';

/**
 * Fetch Instagram Mentions and Tags
 */
export async function getInstagramMentions(
    accessToken: string,
    instagramBusinessId: string
): Promise<ApiResponse<PlatformMention[]>> {
    try {
        const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username,like_count,comments_count,owner{profile_picture_url}';

        // 1. Fetch @Mentions (mentioned_media)
        const mentionsUrl = `${GRAPH_API_URL}/${instagramBusinessId}/mentioned_media?fields=${fields}&access_token=${accessToken}`;
        const mentionsResp = await fetch(mentionsUrl);
        const mentionsData = await mentionsResp.json();

        // 2. Fetch Tags (tags)
        const tagsUrl = `${GRAPH_API_URL}/${instagramBusinessId}/tags?fields=${fields}&access_token=${accessToken}`;
        const tagsResp = await fetch(tagsUrl);
        const tagsData = await tagsResp.json();

        const results: PlatformMention[] = [];

        const processItem = (item: any, type: 'mention' | 'tag') => {
            results.push({
                platformPostId: item.id,
                type: type,
                authorId: item.username || 'unknown',
                authorUsername: item.username || 'unknown',
                authorAvatar: item.owner?.profile_picture_url,
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

/**
 * Search for a hashtag ID by name
 * 
 * Why: Instagram requires hashtag ID for media queries.
 * Rate Limit: Max 30 unique hashtags per account per 7-day rolling period.
 */
export async function searchInstagramHashtag(
    accessToken: string,
    instagramBusinessId: string,
    hashtagName: string
): Promise<ApiResponse<{ hashtagId: string; name: string }>> {
    try {
        // Remove # if present
        const cleanHashtag = hashtagName.replace(/^#/, '').toLowerCase();

        const url = `${GRAPH_API_URL}/ig_hashtag_search?user_id=${instagramBusinessId}&q=${encodeURIComponent(cleanHashtag)}&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        if (!data.data || data.data.length === 0) {
            return { success: false, error: `Hashtag "${cleanHashtag}" not found` };
        }

        return {
            success: true,
            data: {
                hashtagId: data.data[0].id,
                name: cleanHashtag,
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Get top media for a hashtag (most popular posts)
 */
export async function getHashtagTopMedia(
    accessToken: string,
    instagramBusinessId: string,
    hashtagId: string,
    limit: number = 25
): Promise<ApiResponse<HashtagMedia[]>> {
    try {
        const fields = 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,comments_count,children{media_url,media_type}';

        const url = `${GRAPH_API_URL}/${hashtagId}/top_media?user_id=${instagramBusinessId}&fields=${fields}&limit=${limit}&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const media: HashtagMedia[] = (data.data || []).map((item: any) => ({
            id: item.id,
            mediaType: item.media_type,
            mediaUrl: item.media_url,
            thumbnailUrl: item.thumbnail_url,
            permalink: item.permalink,
            caption: item.caption,
            timestamp: new Date(item.timestamp),
            likeCount: item.like_count || 0,
            commentsCount: item.comments_count || 0,
            ownerUsername: '',
            ownerId: '',
        }));

        return { success: true, data: media };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Get recent media for a hashtag (chronologically ordered)
 */
export async function getHashtagRecentMedia(
    accessToken: string,
    instagramBusinessId: string,
    hashtagId: string,
    limit: number = 25
): Promise<ApiResponse<HashtagMedia[]>> {
    try {
        const fields = 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,comments_count';

        const url = `${GRAPH_API_URL}/${hashtagId}/recent_media?user_id=${instagramBusinessId}&fields=${fields}&limit=${limit}&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const media: HashtagMedia[] = (data.data || []).map((item: any) => ({
            id: item.id,
            mediaType: item.media_type,
            mediaUrl: item.media_url,
            thumbnailUrl: item.thumbnail_url,
            permalink: item.permalink,
            caption: item.caption,
            timestamp: new Date(item.timestamp),
            likeCount: item.like_count || 0,
            commentsCount: item.comments_count || 0,
            ownerUsername: '',
            ownerId: '',
        }));

        return { success: true, data: media };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Search hashtag and get both top and recent media
 * 
 * Why: Convenience function for UGC discovery page.
 */
export async function searchInstagramHashtagWithMedia(
    accessToken: string,
    instagramBusinessId: string,
    hashtagName: string,
    limit: number = 25
): Promise<ApiResponse<HashtagSearchResult>> {
    try {
        // Step 1: Get hashtag ID
        const hashtagResult = await searchInstagramHashtag(accessToken, instagramBusinessId, hashtagName);
        if (!hashtagResult.success || !hashtagResult.data) {
            return { success: false, error: hashtagResult.error };
        }

        const { hashtagId, name } = hashtagResult.data;

        // Step 2: Fetch top and recent media in parallel
        const [topResult, recentResult] = await Promise.all([
            getHashtagTopMedia(accessToken, instagramBusinessId, hashtagId, limit),
            getHashtagRecentMedia(accessToken, instagramBusinessId, hashtagId, limit),
        ]);

        return {
            success: true,
            data: {
                hashtagId,
                hashtagName: name,
                topMedia: topResult.success ? topResult.data! : [],
                recentMedia: recentResult.success ? recentResult.data! : [],
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
