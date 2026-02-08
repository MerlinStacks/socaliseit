/**
 * Facebook Graph API Integration (Pages)
 * Handles Page Insights, Post Engagement, and Publishing
 */

import {
    ApiResponse,
    AccountMetrics,
    PostMetrics,
    PlatformComment,
    FeedPostPayload
} from './types';
import path from 'path';
import { existsSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { logger } from '@/lib/logger';

const GRAPH_API_URL = 'https://graph.facebook.com/v24.0';

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

/**
 * Publish Facebook Page Post (text, photo, or video)
 * 
 * Post types:
 * - Text only: POST /{page-id}/feed with message
 * - Photo: POST /{page-id}/photos with url or source
 * - Video: POST /{page-id}/videos with file_url
 */
export async function publishFacebookPagePost(
    accessToken: string,
    pageId: string,
    payload: FeedPostPayload
): Promise<ApiResponse<{ id: string; permalink?: string }>> {
    try {
        let endpoint: string;
        let body: Record<string, unknown> | FormData;
        let headers: Record<string, string> = {};

        if (payload.type === 'VIDEO') {
            const mediaUrl = payload.mediaUrls[0];

            // Check for local file by looking for /uploads/ path structure
            // This handles '/uploads/file.mp4', 'http://localhost:3000/uploads/file.mp4', etc.
            const uploadsIndex = mediaUrl.indexOf('/uploads/');
            const isLocal = uploadsIndex !== -1;

            logger.debug({ url: mediaUrl, isLocal }, '[Facebook API] Processing video');

            if (isLocal) {
                // Local video upload: Use Multipart/Form-Data
                // graph-video.facebook.com is deprecated, use standard Graph URL
                endpoint = `${GRAPH_API_URL}/${pageId}/videos`;

                // Extract relative path from /uploads/ onwards
                const relativePath = mediaUrl.substring(uploadsIndex); // e.g. /uploads/file.mp4
                const safeUrl = relativePath.replace(/^\/uploads\/+/, ''); // e.g. file.mp4
                const filePath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

                logger.debug({ filePath }, '[Facebook API] Resolving local file path');

                if (!existsSync(filePath)) {
                    logger.error({ filePath }, '[Facebook API] File not found');
                    return { success: false, error: `Local video file not found: ${filePath}` };
                }

                // Use openAsBlob for memory-efficient upload (doesn't load entire file into RAM)
                const fileSize = statSync(filePath).size;
                logger.info({ filePath, sizeMB: Math.round(fileSize / 1024 / 1024) }, '[Facebook API] Uploading local video');
                const fileBlob = new Blob([await readFile(filePath)], { type: 'video/mp4' });

                const formData = new FormData();
                formData.append('access_token', accessToken);
                if (payload.caption) {
                    formData.append('description', payload.caption);
                }
                formData.append('source', fileBlob, path.basename(filePath));

                body = formData;
                // Headers should be empty for FormData to let fetch set boundaries
            } else {
                // Remote URL upload
                logger.debug({ mediaUrl }, '[Facebook API] Using remote URL upload');
                endpoint = `${GRAPH_API_URL}/${pageId}/videos`;
                const jsonBody: Record<string, unknown> = {
                    access_token: accessToken,
                    file_url: mediaUrl,
                    description: payload.caption
                };
                body = jsonBody;
                headers['Content-Type'] = 'application/json';
            }
        } else {
            // Image/text posts
            const jsonBody: Record<string, unknown> = {
                access_token: accessToken,
            };

            if (payload.caption) {
                jsonBody.message = payload.caption;
            }

            // Add location if provided (Facebook uses 'place' parameter)
            if (payload.locationId) {
                jsonBody.place = payload.locationId;
            }

            if (payload.mediaUrls.length > 0) {
                if (payload.type === 'CAROUSEL' || payload.mediaUrls.length > 1) {
                    // Multi-photo post
                    const photoIds: string[] = [];

                    for (const url of payload.mediaUrls) {
                        const uploadsIdx = url.indexOf('/uploads/');
                        const isLocalPhoto = uploadsIdx !== -1;

                        if (isLocalPhoto) {
                            // Local file: read from disk and upload as 'source'
                            const relativePath = url.substring(uploadsIdx);
                            const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
                            const filePath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

                            logger.debug({ filePath }, '[Facebook API] Uploading local carousel photo');

                            if (!existsSync(filePath)) {
                                logger.error({ filePath }, '[Facebook API] Carousel photo not found');
                                return { success: false, error: `Local photo not found: ${filePath}` };
                            }

                            const fileBlob = new Blob([await readFile(filePath)], { type: 'image/jpeg' });

                            const formData = new FormData();
                            formData.append('access_token', accessToken);
                            formData.append('published', 'false');
                            formData.append('source', fileBlob, path.basename(filePath));

                            const photoResp = await fetch(`${GRAPH_API_URL}/${pageId}/photos`, {
                                method: 'POST',
                                body: formData,
                            });
                            const photoData = await photoResp.json();
                            if (photoData.error) {
                                return { success: false, error: photoData.error.message };
                            }
                            photoIds.push(photoData.id);
                        } else {
                            // Remote URL
                            const photoResp = await fetch(`${GRAPH_API_URL}/${pageId}/photos`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    url,
                                    published: false,
                                    access_token: accessToken
                                })
                            });
                            const photoData = await photoResp.json();
                            if (photoData.error) {
                                return { success: false, error: photoData.error.message };
                            }
                            photoIds.push(photoData.id);
                        }
                    }

                    endpoint = `${GRAPH_API_URL}/${pageId}/feed`;
                    jsonBody.attached_media = photoIds.map(id => ({ media_fbid: id }));
                } else {
                    // Single photo post
                    const singleUrl = payload.mediaUrls[0];
                    const uploadsIdx = singleUrl.indexOf('/uploads/');
                    const isLocalPhoto = uploadsIdx !== -1;

                    if (isLocalPhoto) {
                        // Local file: read from disk and upload as FormData
                        const relativePath = singleUrl.substring(uploadsIdx);
                        const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
                        const filePath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

                        logger.debug({ filePath }, '[Facebook API] Uploading local single photo');

                        if (!existsSync(filePath)) {
                            logger.error({ filePath }, '[Facebook API] Photo not found');
                            return { success: false, error: `Local photo not found: ${filePath}` };
                        }

                        const fileBlob = new Blob([await readFile(filePath)], { type: 'image/jpeg' });

                        endpoint = `${GRAPH_API_URL}/${pageId}/photos`;

                        const formData = new FormData();
                        formData.append('access_token', accessToken);
                        if (payload.caption) {
                            formData.append('message', payload.caption);
                        }
                        formData.append('source', fileBlob, path.basename(filePath));

                        // For FormData uploads, use the formData directly
                        const localResponse = await fetch(endpoint, {
                            method: 'POST',
                            body: formData,
                        });
                        const localData = await localResponse.json();

                        if (localData.error) {
                            return { success: false, error: localData.error.message };
                        }

                        const localPostId = localData.id || localData.post_id;

                        // Get permalink
                        let localPermalink: string | undefined;
                        try {
                            const postResp = await fetch(`${GRAPH_API_URL}/${localPostId}?fields=permalink_url&access_token=${accessToken}`);
                            const postData = await postResp.json();
                            localPermalink = postData.permalink_url;
                        } catch {
                            // Ignore permalink fetch errors
                        }

                        return {
                            success: true,
                            data: {
                                id: localPostId,
                                permalink: localPermalink
                            }
                        };
                    } else {
                        // Remote URL
                        endpoint = `${GRAPH_API_URL}/${pageId}/photos`;
                        jsonBody.url = singleUrl;
                    }
                }
            } else {
                // Text-only post
                endpoint = `${GRAPH_API_URL}/${pageId}/feed`;
            }
            body = jsonBody;
            headers['Content-Type'] = 'application/json';
        }

        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: headers,
            body: body instanceof FormData ? body : JSON.stringify(body)
        };

        const response = await fetch(endpoint, fetchOptions);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const postId = data.id || data.post_id;

        // Get permalink
        let permalink: string | undefined;
        try {
            const postResp = await fetch(`${GRAPH_API_URL}/${postId}?fields=permalink_url&access_token=${accessToken}`);
            const postData = await postResp.json();
            permalink = postData.permalink_url;
        } catch {
            // Ignore permalink fetch errors
        }

        return {
            success: true,
            data: {
                id: postId,
                permalink
            }
        };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

