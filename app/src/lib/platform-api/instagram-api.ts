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
    TrialReelPayload,
    FeedPostPayload,
    HashtagMedia,
    HashtagSearchResult,
} from './types';
import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { logger } from '@/lib/logger';

const GRAPH_API_URL = 'https://graph.facebook.com/v24.0';

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
            // Note: Video stories still use media_type: 'STORIES' (set above)
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

        // Step 2: For videos, poll container status until FINISHED
        // Why: Videos require processing time before they can be published
        if (payload.type === 'video') {
            const maxAttempts = 30; // Max 5 minutes (10s x 30)
            const pollInterval = 10000; // 10 seconds

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const statusUrl = `${GRAPH_API_URL}/${creationId}?fields=status_code&access_token=${accessToken}`;
                const statusResponse = await fetch(statusUrl);
                const statusData = await statusResponse.json();

                if (statusData.error) {
                    return { success: false, error: statusData.error.message };
                }

                if (statusData.status_code === 'FINISHED') {
                    break;
                }

                if (statusData.status_code === 'ERROR') {
                    return { success: false, error: 'Video processing failed on Instagram' };
                }

                // Wait before next poll
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }

        // Step 3: Publish Container
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

// ============================================================================
// HASHTAG SEARCH (UGC Discovery)
// ============================================================================

/**
 * Search for a hashtag ID by name
 * 
 * Why: Instagram requires hashtag ID for media queries, not the hashtag name.
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
 * 
 * Why: Returns the most engaging posts for UGC curation.
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
            // Note: Owner info not directly available from hashtag media endpoint
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
 * 
 * Why: Returns the most recent posts for real-time UGC monitoring.
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
 * Search hashtag and get both top and recent media in one call
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

/**
 * Wait for container to be ready (required for video/carousel uploads)
 * Why: Instagram processes media asynchronously, must poll until FINISHED
 */
async function waitForContainerReady(
    accessToken: string,
    containerId: string,
    maxAttempts: number = 30,
    delayMs: number = 2000
): Promise<ApiResponse<{ status: string }>> {
    for (let i = 0; i < maxAttempts; i++) {
        const url = `${GRAPH_API_URL}/${containerId}?fields=status_code,status&access_token=${accessToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const status = data.status_code || data.status;
        if (status === 'FINISHED') {
            return { success: true, data: { status: 'FINISHED' } };
        }
        if (status === 'ERROR' || status === 'EXPIRED') {
            return { success: false, error: `Container processing failed: ${status}` };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return { success: false, error: 'Container processing timeout' };
}

/**
 * Check if a URL is a local file path
 */
function isLocalUrl(url: string): boolean {
    return url.indexOf('/uploads/') !== -1;
}

/**
 * Resolve local file path from URL
 */
function resolveLocalFilePath(url: string): string {
    const uploadsIndex = url.indexOf('/uploads/');
    const relativePath = url.substring(uploadsIndex);
    const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
    return path.join(process.cwd(), 'public', 'uploads', safeUrl);
}

/**
 * Upload local video to Instagram using Resumable Upload API
 * Uses rupload.facebook.com endpoint for binary upload
 */
async function uploadLocalVideoToInstagram(
    accessToken: string,
    instagramBusinessId: string,
    localFilePath: string,
    caption?: string
): Promise<ApiResponse<{ containerId: string }>> {
    try {
        logger.debug({ path: localFilePath }, '[Instagram API] Starting resumable upload');

        if (!existsSync(localFilePath)) {
            return { success: false, error: `Local video file not found: ${localFilePath}` };
        }

        const fileBuffer = readFileSync(localFilePath);
        const fileSize = fileBuffer.length;

        // Step 1: Create resumable upload container
        const containerBody: Record<string, unknown> = {
            upload_type: 'resumable',
            media_type: 'REELS',
            access_token: accessToken,
        };
        if (caption) {
            containerBody.caption = caption;
        }
        containerBody.share_to_feed = true;

        const containerResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(containerBody)
        });
        const containerData = await containerResp.json();

        if (containerData.error) {
            logger.error({ error: containerData.error }, '[Instagram API] Container creation failed');
            return { success: false, error: containerData.error.message };
        }

        const containerId = containerData.id;
        logger.debug({ containerId }, '[Instagram API] Created container');

        // Step 2: Upload video binary to rupload.facebook.com
        const uploadUrl = `https://rupload.facebook.com/ig-api-upload/v24.0/${containerId}`;

        const uploadResp = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `OAuth ${accessToken}`,
                'offset': '0',
                'file_size': fileSize.toString(),
                'Content-Type': 'video/mp4',
            },
            body: fileBuffer
        });
        const uploadData = await uploadResp.json();

        if (uploadData.error) {
            logger.error({ error: uploadData.error }, '[Instagram API] Binary upload failed');
            return { success: false, error: uploadData.error.message };
        }

        logger.debug({ containerId }, '[Instagram API] Video uploaded successfully');
        return { success: true, data: { containerId } };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, '[Instagram API] Upload error');
        return { success: false, error: message };
    }
}

/**
 * Publish Instagram Feed Post (single image, video, or carousel)
 * 
 * Flow:
 * 1. Create container(s) for media
 * 2. For carousel: create child containers, then parent container
 * 3. Wait for container to be ready (video processing)
 * 4. Publish the container
 * 5. Optionally post first comment
 */
export async function publishInstagramFeedPost(
    accessToken: string,
    instagramBusinessId: string,
    payload: FeedPostPayload
): Promise<ApiResponse<{ id: string; permalink?: string }>> {
    try {
        let creationId: string;

        if (payload.type === 'CAROUSEL') {
            // Step 1a: Create child containers for each media item
            const childIds: string[] = [];

            for (const mediaUrl of payload.mediaUrls) {
                const isVideo = mediaUrl.match(/\.(mp4|mov|avi|webm)$/i);
                const childBody: Record<string, unknown> = {
                    is_carousel_item: true,
                    access_token: accessToken,
                };

                if (isVideo) {
                    childBody.media_type = 'VIDEO';
                    childBody.video_url = mediaUrl;
                } else {
                    childBody.image_url = mediaUrl;
                }

                const childResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(childBody)
                });
                const childData = await childResp.json();

                if (childData.error) {
                    return { success: false, error: `Failed to create carousel item: ${childData.error.message}` };
                }

                // Wait for video containers to be ready
                if (isVideo) {
                    const readyResult = await waitForContainerReady(accessToken, childData.id);
                    if (!readyResult.success) {
                        return { success: false, error: readyResult.error, errorCode: readyResult.errorCode };
                    }
                }

                childIds.push(childData.id);
            }

            // Step 1b: Create carousel parent container
            const parentBody: Record<string, unknown> = {
                media_type: 'CAROUSEL',
                caption: payload.caption,
                children: childIds.join(','),
                access_token: accessToken,
            };

            if (payload.locationId) {
                parentBody.location_id = payload.locationId;
            }

            const parentResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parentBody)
            });
            const parentData = await parentResp.json();

            if (parentData.error) {
                return { success: false, error: parentData.error.message };
            }

            creationId = parentData.id;

        } else {
            // Step 1: Create single media container
            const mediaUrl = payload.mediaUrls[0];

            if (payload.type === 'VIDEO') {
                // Check if this is a local file that needs resumable upload
                if (isLocalUrl(mediaUrl)) {
                    logger.debug('[Instagram API] Detected local video, using resumable upload');
                    const localPath = resolveLocalFilePath(mediaUrl);

                    const uploadResult = await uploadLocalVideoToInstagram(
                        accessToken,
                        instagramBusinessId,
                        localPath,
                        payload.caption
                    );

                    if (!uploadResult.success) {
                        return { success: false, error: uploadResult.error };
                    }

                    creationId = uploadResult.data!.containerId;

                    // Wait for video processing
                    const readyResult = await waitForContainerReady(accessToken, creationId);
                    if (!readyResult.success) {
                        return { success: false, error: readyResult.error, errorCode: readyResult.errorCode };
                    }
                } else {
                    // Remote URL - use standard video_url approach
                    const containerBody: Record<string, unknown> = {
                        caption: payload.caption,
                        access_token: accessToken,
                        media_type: 'REELS',
                        video_url: mediaUrl,
                        share_to_feed: true,
                    };

                    if (payload.coverImageUrl) {
                        containerBody.cover_url = payload.coverImageUrl;
                    }

                    if (payload.locationId) {
                        containerBody.location_id = payload.locationId;
                    }

                    const containerResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(containerBody)
                    });
                    const containerData = await containerResp.json();

                    if (containerData.error) {
                        return { success: false, error: containerData.error.message };
                    }

                    creationId = containerData.id;

                    // Wait for video processing
                    const readyResult = await waitForContainerReady(accessToken, creationId);
                    if (!readyResult.success) {
                        return { success: false, error: readyResult.error, errorCode: readyResult.errorCode };
                    }
                }
            } else {
                // IMAGE type
                const containerBody: Record<string, unknown> = {
                    caption: payload.caption,
                    access_token: accessToken,
                    image_url: mediaUrl,
                };

                if (payload.locationId) {
                    containerBody.location_id = payload.locationId;
                }

                if (payload.userTags && payload.userTags.length > 0) {
                    containerBody.user_tags = payload.userTags.map(t => ({
                        username: t.username,
                        x: t.x,
                        y: t.y
                    }));
                }

                const containerResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(containerBody)
                });
                const containerData = await containerResp.json();

                if (containerData.error) {
                    return { success: false, error: containerData.error.message };
                }

                creationId = containerData.id;
            }
        }

        // Step 2: Publish the container
        const publishResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: accessToken
            })
        });
        const publishData = await publishResp.json();

        if (publishData.error) {
            return { success: false, error: publishData.error.message };
        }

        const mediaId = publishData.id;

        // Step 3: Post first comment if provided
        if (payload.firstComment) {
            await fetch(`${GRAPH_API_URL}/${mediaId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: payload.firstComment,
                    access_token: accessToken
                })
            });
            // Don't fail if first comment fails
        }

        // Step 4: Get permalink
        const mediaResp = await fetch(`${GRAPH_API_URL}/${mediaId}?fields=permalink&access_token=${accessToken}`);
        const mediaData = await mediaResp.json();

        return {
            success: true,
            data: {
                id: mediaId,
                permalink: mediaData.permalink
            }
        };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
