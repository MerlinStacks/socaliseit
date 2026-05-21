/**
 * Instagram Hashtag & UGC Discovery Functions
 * Why: Discover and curate user content via hashtag and mention searches.
 */

import { ApiResponse, HashtagMedia, HashtagSearchResult, PlatformMention } from '../types';
import { GRAPH_API_URL } from './constants';
import { metaJson } from '../meta-fetch';

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
        const mentionsUrl = `${GRAPH_API_URL}/${instagramBusinessId}/mentioned_media?fields=${fields}`;
        const mentionsData = await metaJson(accessToken, mentionsUrl);

        // 2. Fetch Tags (tags)
        const tagsUrl = `${GRAPH_API_URL}/${instagramBusinessId}/tags?fields=${fields}`;
        const tagsData = await metaJson(accessToken, tagsUrl);

        const results: PlatformMention[] = [];

        const processItem = (item: Record<string, unknown>, type: 'mention' | 'tag') => {
            results.push({
                platformPostId: String(item.id),
                type: type,
                authorId: String(item.username || 'unknown'),
                authorUsername: String(item.username || 'unknown'),
                authorAvatar: ((item.owner as Record<string, unknown>)?.profile_picture_url as string | undefined) || undefined,
                text: item.caption as string | undefined,
                mediaUrl: (item.thumbnail_url as string | undefined) || (item.media_url as string | undefined) || undefined,
                createdAt: new Date(String(item.timestamp)),
            });
        };

        if (mentionsData.data) (mentionsData.data as Array<Record<string, unknown>>).forEach((i: Record<string, unknown>) => processItem(i, 'mention'));
        if (tagsData.data) (tagsData.data as Array<Record<string, unknown>>).forEach((i: Record<string, unknown>) => processItem(i, 'tag'));

        return {
            success: true,
            data: results
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Instagram API request failed';
        return { success: false, error: message };
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

        const url = `${GRAPH_API_URL}/ig_hashtag_search?user_id=${instagramBusinessId}&q=${encodeURIComponent(cleanHashtag)}`;

        const data = await metaJson(accessToken, url);

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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to search Instagram hashtag';
        return { success: false, error: message };
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

        const url = `${GRAPH_API_URL}/${hashtagId}/top_media?user_id=${instagramBusinessId}&fields=${fields}&limit=${limit}`;

        const data = await metaJson(accessToken, url);

        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const media: HashtagMedia[] = (data.data || []).map((item: Record<string, unknown>) => ({
            id: String(item.id),
            mediaType: String(item.media_type),
            mediaUrl: String(item.media_url),
            thumbnailUrl: item.thumbnail_url ? String(item.thumbnail_url) : null,
            permalink: String(item.permalink),
            caption: String(item.caption),
            timestamp: new Date(String(item.timestamp)),
            likeCount: Number(item.like_count) || 0,
            commentsCount: Number(item.comments_count) || 0,
            ownerUsername: '',
            ownerId: '',
        }));

        return { success: true, data: media };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to fetch hashtag top media';
        return { success: false, error: message };
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

        const url = `${GRAPH_API_URL}/${hashtagId}/recent_media?user_id=${instagramBusinessId}&fields=${fields}&limit=${limit}`;

        const data = await metaJson(accessToken, url);

        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const media: HashtagMedia[] = (data.data || []).map((item: Record<string, unknown>) => ({
            id: String(item.id),
            mediaType: String(item.media_type),
            mediaUrl: String(item.media_url),
            thumbnailUrl: item.thumbnail_url ? String(item.thumbnail_url) : null,
            permalink: String(item.permalink),
            caption: String(item.caption),
            timestamp: new Date(String(item.timestamp)),
            likeCount: Number(item.like_count) || 0,
            commentsCount: Number(item.comments_count) || 0,
            ownerUsername: '',
            ownerId: '',
        }));

        return { success: true, data: media };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Instagram API request failed';
        return { success: false, error: message };
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Instagram API request failed';
        return { success: false, error: message };
    }
}
