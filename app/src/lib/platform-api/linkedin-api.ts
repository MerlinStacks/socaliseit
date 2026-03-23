/**
 * LinkedIn API Integration
 * Handles publishing to LinkedIn profiles and company pages via the Posts API.
 *
 * Why: LinkedIn deprecated the UGC Posts API (`/v2/ugcPosts`). This module uses
 * the versioned Posts API (`/rest/posts`) with the Images/Videos APIs for media
 * upload. The exported function signatures (`publishLinkedInPost`,
 * `publishLinkedInArticle`) are intentionally preserved so that
 * `publishing/linkedin.ts` continues to work without changes.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */

import { ApiResponse } from './types';
import { logger } from '@/lib/logger';
import { existsSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { LINKEDIN_API_URL as LINKEDIN_API } from './constants';
import { resolveLocalFilePath } from './local-file';

/** Why: All versioned LinkedIn API calls require this header (format YYYYMM). */
const LINKEDIN_VERSION = '202603';

/**
 * LinkedIn post payload — public interface unchanged from UGC era.
 */
export interface LinkedInPostPayload {
    text: string;
    mediaUrls?: string[];
    mediaType?: 'image' | 'video' | 'article';
    visibility?: 'PUBLIC' | 'CONNECTIONS';
    /** For article posts */
    articleUrl?: string;
    articleTitle?: string;
    articleDescription?: string;
}

// ============================================================================
// Shared Headers
// ============================================================================

/** Why: Every LinkedIn REST call needs auth + version + protocol headers. */
function linkedInHeaders(accessToken: string): Record<string, string> {
    return {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
    };
}

// ============================================================================
// Images API — Initialize + Upload
// ============================================================================

/**
 * Initialize an image upload with LinkedIn Images API.
 * Returns an upload URL and the image URN to reference in the post.
 *
 * Why: Replaces the old `/v2/assets?action=registerUpload` +
 * `urn:li:digitalmediaRecipe:feedshare-image` flow.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
 */
async function initializeImageUpload(
    accessToken: string,
    ownerUrn: string
): Promise<ApiResponse<{ uploadUrl: string; imageUrn: string }>> {
    try {
        const response = await fetch(
            `${LINKEDIN_API}/rest/images?action=initializeUpload`,
            {
                method: 'POST',
                headers: linkedInHeaders(accessToken),
                body: JSON.stringify({
                    initializeUploadRequest: { owner: ownerUrn },
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Failed to initialize image upload',
            };
        }

        const uploadUrl = data.value?.uploadUrl;
        const imageUrn = data.value?.image;

        if (!uploadUrl || !imageUrn) {
            return {
                success: false,
                error: 'Invalid response from LinkedIn image initialization',
            };
        }

        return { success: true, data: { uploadUrl, imageUrn } };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

// ============================================================================
// Videos API — Initialize + Upload
// ============================================================================

/**
 * Initialize a video upload with LinkedIn Videos API.
 * Returns an upload URL and the video URN to reference in the post.
 *
 * Why: Replaces the old `/v2/assets?action=registerUpload` +
 * `urn:li:digitalmediaRecipe:feedshare-video` flow.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
 */
async function initializeVideoUpload(
    accessToken: string,
    ownerUrn: string,
    fileSizeBytes: number
): Promise<ApiResponse<{ uploadUrl: string; videoUrn: string }>> {
    try {
        const response = await fetch(
            `${LINKEDIN_API}/rest/videos?action=initializeUpload`,
            {
                method: 'POST',
                headers: linkedInHeaders(accessToken),
                body: JSON.stringify({
                    initializeUploadRequest: {
                        owner: ownerUrn,
                        fileSizeBytes,
                        uploadCaptions: false,
                        uploadThumbnail: false,
                    },
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Failed to initialize video upload',
            };
        }

        const uploadUrl = data.value?.uploadInstructions?.[0]?.uploadUrl;
        const videoUrn = data.value?.video;

        if (!uploadUrl || !videoUrn) {
            return {
                success: false,
                error: 'Invalid response from LinkedIn video initialization',
            };
        }

        return { success: true, data: { uploadUrl, videoUrn } };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

// ============================================================================
// Media Binary Upload (shared for images and videos)
// ============================================================================

/**
 * Upload media binary to LinkedIn.
 * Handles both local files (read from disk) and remote URLs (fetch + relay).
 *
 * Why: Upload logic is shared between images and videos — the target URL
 * differs but the upload mechanics (PUT binary) are identical.
 */
async function uploadMediaBinary(
    accessToken: string,
    uploadUrl: string,
    mediaUrl: string
): Promise<ApiResponse<{ sizeBytes: number }>> {
    try {
        const localPath = resolveLocalFilePath(mediaUrl);
        const isLocalFile = existsSync(localPath);

        logger.debug({ mediaUrl, localPath, isLocalFile }, '[LinkedIn API] Checking media source');

        let mediaBuffer: ArrayBuffer;
        let contentType = 'application/octet-stream';

        if (isLocalFile) {
            const fileBuffer = await readFile(localPath);
            mediaBuffer = fileBuffer.buffer.slice(
                fileBuffer.byteOffset,
                fileBuffer.byteOffset + fileBuffer.byteLength
            );

            if (mediaUrl.includes('.mp4')) contentType = 'video/mp4';
            else if (mediaUrl.includes('.jpg') || mediaUrl.includes('.jpeg')) contentType = 'image/jpeg';
            else if (mediaUrl.includes('.png')) contentType = 'image/png';
            else if (mediaUrl.includes('.webp')) contentType = 'image/webp';

            logger.debug({ path: localPath, size: fileBuffer.length }, '[LinkedIn API] Read local file');
        } else {
            // Why: LinkedIn cannot fetch from localhost — fail fast with a clear message.
            if (mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1')) {
                const errorMsg = `Local media file not found at '${localPath}'. LinkedIn cannot fetch from localhost ('${mediaUrl}'). Please ensure the file exists on the server's disk (check Docker volume mounts) or use a public URL.`;
                logger.error({ mediaUrl, localPath }, '[LinkedIn API] Failed to resolve local file for localhost URL');
                return { success: false, error: errorMsg };
            }

            const mediaResponse = await fetch(mediaUrl);
            if (!mediaResponse.ok) {
                return { success: false, error: `Failed to fetch media: ${mediaUrl}` };
            }

            mediaBuffer = await mediaResponse.arrayBuffer();
            contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';
        }

        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': contentType,
            },
            body: mediaBuffer,
        });

        if (!uploadResponse.ok) {
            return {
                success: false,
                error: `Media upload failed with status ${uploadResponse.status}`,
            };
        }

        return { success: true, data: { sizeBytes: mediaBuffer.byteLength } };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

// ============================================================================
// Posts API — Create Post
// ============================================================================

/**
 * Publish a post to LinkedIn via the versioned Posts API.
 *
 * Why: Replaces the deprecated `/v2/ugcPosts` endpoint. The function
 * signature is intentionally identical to the old version so that
 * `publishing/linkedin.ts` (which dynamically imports this) continues
 * to work unchanged.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */
export async function publishLinkedInPost(
    accessToken: string,
    authorUrn: string,
    payload: LinkedInPostPayload
): Promise<ApiResponse<{ id: string; url?: string }>> {
    try {
        const mediaIds: string[] = [];

        if (payload.mediaUrls && payload.mediaUrls.length > 0) {
            if (payload.mediaType === 'video') {
                // Why: Video uploads need sequential processing because each
                // requires a file size calculation before init. Can't parallelize.
                for (const mediaUrl of payload.mediaUrls) {
                    let fileSizeBytes = 0;
                    const localPath = resolveLocalFilePath(mediaUrl);
                    const isLocalFile = existsSync(localPath);

                    if (isLocalFile) {
                        fileSizeBytes = statSync(localPath).size;
                    } else {
                        const headRes = await fetch(mediaUrl, { method: 'HEAD' });
                        fileSizeBytes = parseInt(headRes.headers.get('content-length') || '0', 10);
                    }

                    const initResult = await initializeVideoUpload(accessToken, authorUrn, fileSizeBytes);
                    if (!initResult.success || !initResult.data) {
                        logger.error({ error: initResult.error }, 'LinkedIn video init failed');
                        return { success: false, error: initResult.error };
                    }

                    const uploadResult = await uploadMediaBinary(accessToken, initResult.data.uploadUrl, mediaUrl);
                    if (!uploadResult.success) {
                        logger.error({ error: uploadResult.error }, 'LinkedIn video upload failed');
                        return { success: false, error: uploadResult.error };
                    }

                    mediaIds.push(initResult.data.videoUrn);
                }
            } else {
                // Why: Image uploads are independent init+upload operations.
                // Parallelize them for faster multi-image publishing.
                const uploadResults = await Promise.all(
                    payload.mediaUrls.map(async (mediaUrl) => {
                        const initResult = await initializeImageUpload(accessToken, authorUrn);
                        if (!initResult.success || !initResult.data) {
                            return { success: false as const, error: initResult.error };
                        }

                        const uploadResult = await uploadMediaBinary(accessToken, initResult.data.uploadUrl, mediaUrl);
                        if (!uploadResult.success) {
                            return { success: false as const, error: uploadResult.error };
                        }

                        return { success: true as const, imageUrn: initResult.data.imageUrn };
                    })
                );

                for (const result of uploadResults) {
                    if (!result.success) {
                        logger.error({ error: result.error }, 'LinkedIn image upload failed');
                        return { success: false, error: result.error };
                    }
                    mediaIds.push(result.imageUrn);
                }
            }
        }

        // Why: Build the Posts API body. Key differences from UGC:
        // - `commentary` replaces `specificContent.shareCommentary.text`
        // - `content.media` replaces nested `com.linkedin.ugc.ShareContent`
        // - `distribution` is a new required field
        // - `visibility` is a simple string, not a nested object
        const postBody: Record<string, unknown> = {
            author: authorUrn,
            commentary: payload.text,
            visibility: payload.visibility || 'PUBLIC',
            distribution: {
                feedDistribution: 'MAIN_FEED',
                targetEntities: [],
                thirdPartyDistributionChannels: [],
            },
            lifecycleState: 'PUBLISHED',
            isReshareDisabledByAuthor: false,
        };

        // Why: Article posts use `content.article`, media posts use `content.media`.
        if (payload.articleUrl) {
            postBody.content = {
                article: {
                    source: payload.articleUrl,
                    title: payload.articleTitle || '',
                    description: payload.articleDescription || '',
                },
            };
        } else if (mediaIds.length > 0) {
            // Why: For multi-image posts, LinkedIn Posts API supports multiple images
            // under content.multiImage.images[]. Single media uses content.media.
            if (mediaIds.length === 1) {
                postBody.content = {
                    media: {
                        id: mediaIds[0],
                    },
                };
            } else {
                postBody.content = {
                    multiImage: {
                        images: mediaIds.map(id => ({ id })),
                    },
                };
            }
        }

        const response = await fetch(`${LINKEDIN_API}/rest/posts`, {
            method: 'POST',
            headers: linkedInHeaders(accessToken),
            body: JSON.stringify(postBody),
        });

        // Why: Posts API returns 201 with x-restli-id header, not a JSON body
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            logger.error({ platform: 'linkedin', error: data, status: response.status }, 'LinkedIn post creation failed');
            return {
                success: false,
                error: (data as Record<string, string>).message || 'LinkedIn post creation failed',
            };
        }

        const postId = response.headers.get('x-restli-id') || '';

        return {
            success: true,
            data: {
                id: postId,
                url: postId ? `https://linkedin.com/feed/update/${postId}` : undefined,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'linkedin', error: message }, 'LinkedIn publish error');
        return { success: false, error: message };
    }
}

/**
 * Publish an Article to LinkedIn.
 * Why: Delegates to `publishLinkedInPost` with `mediaType: 'article'`. The
 * Posts API handles articles via `content.article` — no special endpoint needed.
 */
export async function publishLinkedInArticle(
    accessToken: string,
    authorUrn: string,
    payload: {
        title: string;
        text: string;
        url?: string;
    }
): Promise<ApiResponse<{ id: string }>> {
    return publishLinkedInPost(accessToken, authorUrn, {
        text: payload.text,
        articleUrl: payload.url,
        articleTitle: payload.title,
        mediaType: 'article',
    });
}
