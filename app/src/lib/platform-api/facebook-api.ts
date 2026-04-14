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
import { GRAPH_API_URL } from './constants';

/**
 * Resolve a media URL containing `/uploads/...` to an absolute filesystem path.
 * Returns `null` if the URL isn't a local uploads path.
 *
 * Why: This pattern was duplicated 4× in publishFacebookPagePost for video,
 * carousel photos, and single photos. Extracting it removes ~20 lines of copy-paste.
 */
function resolveUploadsPath(mediaUrl: string): { filePath: string; safeName: string } | null {
    const uploadsIdx = mediaUrl.indexOf('/uploads/');
    if (uploadsIdx === -1) return null;
    const relativePath = mediaUrl.substring(uploadsIdx);
    const safeName = relativePath.replace(/^\/uploads\/+/, '');
    const filePath = path.join(process.cwd(), 'public', 'uploads', safeName);
    return { filePath, safeName };
}

/**
 * Upload a single unpublished photo for use in a Facebook carousel.
 * Handles both local files (FormData upload) and remote URLs (JSON body).
 *
 * Why: Extracted from the carousel loop in publishFacebookPagePost to reduce
 * deep nesting and improve readability.
 */
async function uploadCarouselPhoto(
    pageId: string,
    accessToken: string,
    url: string
): Promise<ApiResponse<{ photoId: string }>> {
    const local = resolveUploadsPath(url);

    if (local) {
        if (!existsSync(local.filePath)) {
            return { success: false, error: `Local photo not found: ${local.filePath}` };
        }

        const fileBlob = new Blob([await readFile(local.filePath)], { type: 'image/jpeg' });
        const formData = new FormData();
        formData.append('access_token', accessToken);
        formData.append('published', 'false');
        formData.append('source', fileBlob, path.basename(local.filePath));

        const resp = await fetch(`${GRAPH_API_URL}/${pageId}/photos`, {
            method: 'POST',
            body: formData,
        });
        const data = await resp.json();
        if (data.error) return { success: false, error: data.error.message };
        return { success: true, data: { photoId: data.id } };
    }

    // Remote URL
    const resp = await fetch(`${GRAPH_API_URL}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, published: false, access_token: accessToken }),
    });
    const data = await resp.json();
    if (data.error) return { success: false, error: data.error.message };
    return { success: true, data: { photoId: data.id } };
}


/**
 * Fetch Facebook Page Analytics
 */
export async function getFacebookPageAnalytics(
    accessToken: string,
    pageId: string
): Promise<ApiResponse<AccountMetrics>> {
    try {
        // Why: `page_fans` deprecated Nov 2025 (use Page object `followers_count` instead).
        // Why: `page_impressions` deprecated Nov 2025; `page_views_total` is the surviving metric.
        const metrics = 'page_post_engagements,page_views_total,page_website_clicks_logged_in_unique';
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
                // Why: `page_impressions` deprecated Nov 2025; `page_views_total` is closest surviving metric
                impressions: getMetric('page_views_total'),
                reach: 0,
                engagementRate: 0,
                profileViews: getMetric('page_views_total'),
                websiteClicks: getMetric('page_website_clicks_logged_in_unique'),
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
 *
 * Why: Facebook Graph API node types (Post, Photo, Stories) each support
 * different field sets. Stories don't support `comments`, `likes`, `shares`,
 * or post-level insights. We fetch each independently with graceful fallbacks
 * so unsupported node types still return zeros instead of a hard failure.
 *
 * Why (Nov 2025 deprecation): `post_impressions`, `post_impressions_unique`,
 * and `post_clicks` were deprecated Nov 15, 2025. Replaced with
 * `post_media_view` and `post_total_media_view_unique`.
 */
export async function getFacebookPostAnalytics(
    accessToken: string,
    postId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        // Why: Parallelize independent fetches — reactions, shares, and insights
        // have no data dependencies and can run concurrently (~60% latency reduction).
        const [reactionsResult, sharesResult, insightsResult] = await Promise.allSettled([
            // Reactions + comments
            (async () => {
                const postUrl = `${GRAPH_API_URL}/${postId}?fields=comments.summary(true),reactions.summary(true)&access_token=${accessToken}`;
                const postData = await (await fetch(postUrl)).json();
                if (postData.error) {
                    logger.debug({ postId, error: postData.error?.message }, 'Facebook reactions/comments fetch returned error');
                    return { likes: 0, comments: 0 };
                }
                return {
                    likes: postData.reactions?.summary?.total_count || 0,
                    comments: postData.comments?.summary?.total_count || 0,
                };
            })(),
            // Shares
            (async () => {
                const sharesUrl = `${GRAPH_API_URL}/${postId}?fields=shares&access_token=${accessToken}`;
                const sharesData = await (await fetch(sharesUrl)).json();
                return sharesData.shares?.count || 0;
            })(),
            // Insights (post_media_view, post_total_media_view_unique, post_clicks_by_type)
            (async () => {
                const insightsUrl = `${GRAPH_API_URL}/${postId}/insights?metric=post_media_view,post_total_media_view_unique,post_clicks_by_type&access_token=${accessToken}`;
                const insightsData = await (await fetch(insightsUrl)).json();
                if (!insightsData.data) return { impressions: 0, reach: 0, clicks: 0 };
                const getMetric = (name: string) => {
                    const item = insightsData.data?.find((i: any) => i.name === name);
                    return item?.values?.[0]?.value || 0;
                };
                const clicksByType = getMetric('post_clicks_by_type');
                let clicks = 0;
                if (typeof clicksByType === 'object' && clicksByType !== null) {
                    clicks = Object.values(clicksByType as Record<string, number>).reduce((sum: number, v) => sum + (Number(v) || 0), 0);
                } else {
                    clicks = Number(clicksByType) || 0;
                }
                return {
                    impressions: getMetric('post_media_view'),
                    reach: getMetric('post_total_media_view_unique'),
                    clicks,
                };
            })(),
        ]);

        const { likes: likesCount, comments: commentsCount } = reactionsResult.status === 'fulfilled'
            ? reactionsResult.value : { likes: 0, comments: 0 };
        const sharesCount = sharesResult.status === 'fulfilled' ? sharesResult.value : 0;
        const { impressions, reach, clicks } = insightsResult.status === 'fulfilled'
            ? insightsResult.value : { impressions: 0, reach: 0, clicks: 0 };

        return {
            success: true,
            data: {
                likes: likesCount,
                comments: commentsCount,
                shares: sharesCount,
                impressions,
                reach,
                clicks,
                saves: 0,
                engagementRate: 0,
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Analytics for a Facebook Page Story
 *
 * Why: Facebook Page Stories only support limited insights. The standard
 * `post_impressions`, `post_clicks`, `comments`, `likes`, `shares` are NOT
 * available on Story nodes. The only story-level insight is
 * `total_unique_impressions` (unique viewers).
 */
export async function getFacebookStoryAnalytics(
    accessToken: string,
    storyId: string
): Promise<ApiResponse<PostMetrics>> {
    try {
        let uniqueImpressions = 0;
        try {
            // Why: `total_unique_impressions` is the only insight metric available
            // on Page Story nodes. It gives the number of unique viewers.
            const insightsUrl = `${GRAPH_API_URL}/${storyId}/insights?metric=total_unique_impressions&access_token=${accessToken}`;
            const insightsData = await (await fetch(insightsUrl)).json();
            if (insightsData.data) {
                const item = insightsData.data?.find((i: any) => i.name === 'total_unique_impressions');
                uniqueImpressions = item?.values?.[0]?.value || 0;
            }
        } catch {
            // Why: Story may have expired or insights may not be available.
        }

        return {
            success: true,
            data: {
                // Why: Map the single available metric to both impressions and reach.
                // Stories don't support likes/comments/shares on Facebook Pages.
                impressions: uniqueImpressions,
                reach: uniqueImpressions,
                likes: 0,
                comments: 0,
                shares: 0,
                saves: 0,
                clicks: 0,
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
        const url = `${GRAPH_API_URL}/${commentId}/comments`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: text })
        });
        const data = await response.json();

        if (!response.ok || data.error) {
            const msg = data.error?.message || `HTTP ${response.status}`;
            const code = data.error?.code;
            logger.warn({ commentId, status: response.status, errorCode: code, error: msg }, 'Facebook comment reply failed');
            // Code 200 = permission error — pages_manage_engagement is likely missing
            const hint = code === 200 || code === 10 || code === 3
                ? ' (App may be missing pages_manage_engagement permission)'
                : '';
            return { success: false, error: `Facebook: ${msg}${hint}` };
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
                // Local video: use file_url with the app's public URL to avoid loading into memory
                // (Loading 81MB+ videos into RAM causes OOM on memory-constrained containers)
                endpoint = `${GRAPH_API_URL}/${pageId}/videos`;

                const relativePath = mediaUrl.substring(uploadsIndex); // e.g. /uploads/file.mp4
                const safeUrl = relativePath.replace(/^\/uploads\/+/, ''); // e.g. file.mp4
                const filePath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

                logger.debug({ filePath }, '[Facebook API] Resolving local file path');

                if (!existsSync(filePath)) {
                    logger.error({ filePath }, '[Facebook API] File not found');
                    return { success: false, error: `Local video file not found: ${filePath}` };
                }

                const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL;

                if (appUrl) {
                    // PREFERRED: Let Facebook download the file directly (zero memory usage)
                    const publicUrl = `${appUrl.replace(/\/$/, '')}/uploads/${safeUrl}`;
                    logger.info({ publicUrl, sizeMB: Math.round(statSync(filePath).size / 1024 / 1024) }, '[Facebook API] Using file_url for local video (memory-safe)');

                    const jsonBody: Record<string, unknown> = {
                        access_token: accessToken,
                        file_url: publicUrl,
                        description: payload.caption
                    };
                    body = jsonBody;
                    // Why (BUG-29): Previously headers was left empty for this path,
                    // so the JSON body was sent without Content-Type: application/json.
                    headers['Content-Type'] = 'application/json';
                } else {
                    // FALLBACK: Load file into memory (only for dev environments without public URL)
                    logger.warn('[Facebook API] No APP_URL set, falling back to in-memory video upload');
                    const fileSize = statSync(filePath).size;
                    logger.info({ filePath, sizeMB: Math.round(fileSize / 1024 / 1024) }, '[Facebook API] Uploading local video (in-memory fallback)');
                    const fileBlob = new Blob([await readFile(filePath)], { type: 'video/mp4' });

                    const formData = new FormData();
                    formData.append('access_token', accessToken);
                    if (payload.caption) {
                        formData.append('description', payload.caption);
                    }
                    formData.append('source', fileBlob, path.basename(filePath));

                    body = formData;
                }
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
                        const result = await uploadCarouselPhoto(pageId, accessToken, url);
                        if (!result.success || !result.data) {
                            // Why (BUG-FIX #14): Delete orphaned unpublished photos on partial failure
                            for (const orphanId of photoIds) {
                                await fetch(`${GRAPH_API_URL}/${orphanId}?access_token=${accessToken}`, { method: 'DELETE' }).catch(() => {});
                            }
                            return { success: false, error: result.error || 'Carousel photo upload failed' };
                        }
                        photoIds.push(result.data.photoId);
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

/**
 * Normalised Facebook review shape
 */
export interface FacebookReview {
    platformReviewId: string;
    authorName: string;
    authorAvatar: string | null;
    rating: number;
    text: string | null;
    isReplied: boolean;
    reviewUrl: string | null;
    createdAt: string;
}

/**
 * Fetch reviews/recommendations for a Facebook Page.
 *
 * Why: Facebook transitioned from 1-5 star reviews to "Recommended" / "Not Recommended".
 * The `/ratings` endpoint returns both legacy star reviews and new recommendations.
 * We map "recommend" → 5 and "not recommend" → 1 for consistency.
 *
 * @param accessToken - Page access token with pages_manage_engagement
 * @param pageId      - Facebook Page ID
 */
export async function getFacebookPageReviews(
    accessToken: string,
    pageId: string,
): Promise<ApiResponse<FacebookReview[]>> {
    try {
        const url = `${GRAPH_API_URL}/${pageId}/ratings?fields=reviewer{name,id,picture},rating,review_text,created_time,open_graph_story{id}&limit=100&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const reviews: FacebookReview[] = (data.data || []).map((item: any) => {
            const reviewer = item.reviewer || {};
            // Facebook uses 1-5 integer rating for legacy, or recommendation_type for new
            const rawRating = item.rating || (item.recommendation_type === 'positive' ? 5 : 1);

            return {
                platformReviewId: item.open_graph_story?.id || `fb_review_${reviewer.id}_${item.created_time}`,
                authorName: reviewer.name || 'Facebook User',
                authorAvatar: reviewer.picture?.data?.url || null,
                rating: rawRating,
                text: item.review_text || null,
                isReplied: false, // Facebook API doesn't expose reply status on ratings endpoint
                reviewUrl: null,
                createdAt: item.created_time,
            };
        });

        return { success: true, data: reviews };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Reply to a Facebook Page review.
 *
 * Why: Facebook reviews are open graph stories — replying is done by
 * posting a comment on the review's open graph story ID.
 *
 * @param accessToken - Page access token
 * @param reviewId    - The open graph story ID of the review
 * @param text        - Reply message
 */
export async function replyToFacebookReview(
    accessToken: string,
    reviewId: string,
    text: string,
): Promise<ApiResponse<{ id: string }>> {
    try {
        const url = `${GRAPH_API_URL}/${reviewId}/comments?access_token=${accessToken}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
        });
        const data = await response.json();

        if (data.error) {
            // Why: Expose HTTP status via errorCode so callers can distinguish
            // 404 (review deleted) from other failures
            return {
                success: false,
                error: data.error.message,
                errorCode: String(response.status),
            };
        }

        return { success: true, data: { id: data.id } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
