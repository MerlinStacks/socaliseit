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
import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { logger } from '@/lib/logger';

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

/**
 * TikTok video post payload
 */
export interface TikTokPostPayload {
    title: string;
    videoUrl: string;
    /** Privacy level: PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, SELF_ONLY */
    privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
    /** Disable duet */
    disableDuet?: boolean;
    /** Disable comments */
    disableComment?: boolean;
    /** Disable stitch */
    disableStitch?: boolean;
    /** Cover timestamp in milliseconds */
    coverTimestampMs?: number;
    /** Promotional content (own business) */
    brandOrganicToggle?: boolean;
    /** Paid partnership */
    brandContentToggle?: boolean;
    /** AI generated content */
    isAigc?: boolean;
}

/**
 * Check publish status for a TikTok video
 * Why: TikTok processes videos asynchronously after init
 */
async function checkPublishStatus(
    accessToken: string,
    publishId: string
): Promise<ApiResponse<{ status: string; publiclyAvailablePostId?: string[] }>> {
    try {
        const url = `${TIKTOK_API_URL}/post/publish/status/fetch/`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ publish_id: publishId })
        });
        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        return {
            success: true,
            data: {
                status: data.data?.status || 'PROCESSING',
                publiclyAvailablePostId: data.data?.publiclyAvailablePostId
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Wait for TikTok publish to complete
 */
async function waitForPublishComplete(
    accessToken: string,
    publishId: string,
    maxAttempts: number = 30,
    delayMs: number = 3000
): Promise<ApiResponse<{ publicPostId?: string }>> {
    for (let i = 0; i < maxAttempts; i++) {
        const result = await checkPublishStatus(accessToken, publishId);

        if (!result.success) {
            return { success: false, error: result.error, errorCode: result.errorCode };
        }

        const status = result.data?.status;

        if (status === 'PUBLISH_COMPLETE') {
            return {
                success: true,
                data: {
                    publicPostId: result.data?.publiclyAvailablePostId?.[0]
                }
            };
        }

        if (status === 'FAILED') {
            return { success: false, error: 'Video publish failed' };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return { success: false, error: 'Publish timeout - video may still be processing' };
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
 * Publish TikTok Video
 * 
 * Supports two modes:
 * - Remote URL: Uses PULL_FROM_URL method (TikTok pulls video)
 * - Local file: Uses FILE_UPLOAD method (we upload binary)
 */
export async function publishTikTokVideo(
    accessToken: string,
    payload: TikTokPostPayload
): Promise<ApiResponse<{ publishId: string; postId?: string }>> {
    try {
        // Check if local file exists on disk (file existence check, not URL pattern)
        const localPath = resolveLocalFilePath(payload.videoUrl);
        const isLocal = existsSync(localPath);
        logger.debug({ url: payload.videoUrl, localPath, isLocal }, '[TikTok API] Publishing video - file existence check');

        if (isLocal) {
            // Local file: Use FILE_UPLOAD method
            if (!existsSync(localPath)) {
                return { success: false, error: `Local video file not found: ${localPath}` };
            }

            const fileBuffer = readFileSync(localPath);
            const fileSize = fileBuffer.length;

            logger.debug({ fileSize, path: localPath }, '[TikTok API] File size');

            // TikTok max chunk size is 10MB (10485760 bytes)
            // For files larger than 10MB, we must use chunked upload
            const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
            const chunkSize = Math.min(fileSize, MAX_CHUNK_SIZE);
            const totalChunkCount = Math.ceil(fileSize / chunkSize);

            logger.debug({ totalChunkCount, chunkSize }, '[TikTok API] Using chunks');

            // Step 1: Initialize upload with FILE_UPLOAD source
            const initUrl = `${TIKTOK_API_URL}/post/publish/video/init/`;

            const initBody = {
                post_info: {
                    title: payload.title,
                    privacy_level: payload.privacyLevel || 'PUBLIC_TO_EVERYONE',
                    disable_duet: payload.disableDuet ?? false,
                    disable_comment: payload.disableComment ?? false,
                    disable_stitch: payload.disableStitch ?? false,
                    video_cover_timestamp_ms: payload.coverTimestampMs || 1000,
                    brand_organic_toggle: payload.brandOrganicToggle ?? false,
                    brand_content_toggle: payload.brandContentToggle ?? false,
                    is_aigc: payload.isAigc ?? false,
                },
                source_info: {
                    source: 'FILE_UPLOAD',
                    video_size: fileSize,
                    chunk_size: chunkSize,
                    total_chunk_count: totalChunkCount,
                }
            };

            const initResponse = await fetch(initUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify(initBody)
            });
            const initData = await initResponse.json();

            if (initData.error && initData.error.code !== 'ok') {
                logger.error({ error: initData.error }, '[TikTok API] Init failed');
                return {
                    success: false,
                    error: initData.error.message || 'Failed to initialize video upload',
                    errorCode: initData.error.code
                };
            }

            const publishId = initData.data?.publish_id;
            const uploadUrl = initData.data?.upload_url;

            if (!publishId || !uploadUrl) {
                return { success: false, error: 'No publish_id or upload_url returned from TikTok' };
            }

            logger.debug({ uploadUrl }, '[TikTok API] Upload URL');

            // Step 2: Upload video binary in chunks
            for (let chunkIndex = 0; chunkIndex < totalChunkCount; chunkIndex++) {
                const start = chunkIndex * chunkSize;
                const end = Math.min(start + chunkSize, fileSize);
                const chunkBuffer = fileBuffer.subarray(start, end);
                const currentChunkSize = chunkBuffer.length;

                logger.debug({ chunk: chunkIndex + 1, total: totalChunkCount, start, end: end - 1, fileSize }, '[TikTok API] Uploading chunk');

                const uploadResponse = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'video/mp4',
                        'Content-Length': currentChunkSize.toString(),
                        'Content-Range': `bytes ${start}-${end - 1}/${fileSize}`,
                    },
                    body: chunkBuffer
                });

                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    logger.error({ chunk: chunkIndex + 1, error: errorText }, '[TikTok API] Chunk upload failed');
                    return { success: false, error: `Video chunk upload failed: ${uploadResponse.status}` };
                }
            }

            logger.debug('[TikTok API] Video uploaded, waiting for processing...');

            // Step 3: Wait for publish to complete
            const completeResult = await waitForPublishComplete(accessToken, publishId);

            if (!completeResult.success) {
                return {
                    success: false,
                    error: completeResult.error,
                    data: { publishId }
                } as ApiResponse<{ publishId: string; postId?: string }>;
            }

            return {
                success: true,
                data: {
                    publishId,
                    postId: completeResult.data?.publicPostId
                }
            };

        } else {
            // GUARD: Fail fast if local file is missing but URL is clearly local
            if (payload.videoUrl.includes('localhost') || payload.videoUrl.includes('127.0.0.1')) {
                const errorMsg = `Local video file not found at '${localPath}'. TikTok cannot download from localhost ('${payload.videoUrl}'). Please ensure the file exists on the server's disk (check Docker volume mounts) or use a public URL.`;
                logger.error({ url: payload.videoUrl, localPath }, '[TikTok API] Failed to resolve local file for localhost URL');
                return { success: false, error: errorMsg };
            }

            // Remote URL: Use PULL_FROM_URL method
            const initUrl = `${TIKTOK_API_URL}/post/publish/video/init/`;

            const initBody = {
                post_info: {
                    title: payload.title,
                    privacy_level: payload.privacyLevel || 'PUBLIC_TO_EVERYONE',
                    disable_duet: payload.disableDuet ?? false,
                    disable_comment: payload.disableComment ?? false,
                    disable_stitch: payload.disableStitch ?? false,
                    video_cover_timestamp_ms: payload.coverTimestampMs || 1000,
                    brand_organic_toggle: payload.brandOrganicToggle ?? false,
                    brand_content_toggle: payload.brandContentToggle ?? false,
                    is_aigc: payload.isAigc ?? false,
                },
                source_info: {
                    source: 'PULL_FROM_URL',
                    video_url: payload.videoUrl,
                }
            };

            const initResponse = await fetch(initUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify(initBody)
            });
            const initData = await initResponse.json();

            if (initData.error && initData.error.code !== 'ok') {
                return {
                    success: false,
                    error: initData.error.message || 'Failed to initialize video upload',
                    errorCode: initData.error.code
                };
            }

            const publishId = initData.data?.publish_id;
            if (!publishId) {
                return { success: false, error: 'No publish_id returned from TikTok' };
            }

            // Wait for publish to complete
            const completeResult = await waitForPublishComplete(accessToken, publishId);

            if (!completeResult.success) {
                return {
                    success: false,
                    error: completeResult.error,
                    data: { publishId }
                } as ApiResponse<{ publishId: string; postId?: string }>;
            }

            return {
                success: true,
                data: {
                    publishId,
                    postId: completeResult.data?.publicPostId
                }
            };
        }

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, '[TikTok API] Publish error');
        return { success: false, error: message };
    }
}

