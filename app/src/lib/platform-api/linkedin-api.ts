/**
 * LinkedIn API Integration
 * Handles publishing to LinkedIn profiles and company pages via UGC Posts API
 * 
 * Why: LinkedIn uses the UGC (User Generated Content) Post API for publishing,
 * which requires registering media assets before creating the post.
 */

import { ApiResponse } from './types';
import { logger } from '@/lib/logger';
import path from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { LINKEDIN_API_URL as LINKEDIN_API } from './constants';
import { resolveLocalFilePath } from './local-file';

/**
 * LinkedIn post payload for UGC Posts
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

/**
 * Register a media upload with LinkedIn
 * Step 1: Initialize upload to get upload URL
 */
async function registerMediaUpload(
    accessToken: string,
    ownerUrn: string,
    mediaType: 'image' | 'video'
): Promise<ApiResponse<{ uploadUrl: string; asset: string }>> {
    try {
        const registerBody = {
            registerUploadRequest: {
                owner: ownerUrn,
                recipes: [
                    mediaType === 'video'
                        ? 'urn:li:digitalmediaRecipe:feedshare-video'
                        : 'urn:li:digitalmediaRecipe:feedshare-image'
                ],
                serviceRelationships: [
                    {
                        identifier: 'urn:li:userGeneratedContent',
                        relationshipType: 'OWNER',
                    },
                ],
            },
        };

        const response = await fetch(`${LINKEDIN_API}/assets?action=registerUpload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify(registerBody),
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Failed to register media upload',
            };
        }

        const uploadUrl = data.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
        const asset = data.value?.asset;

        if (!uploadUrl || !asset) {
            return {
                success: false,
                error: 'Invalid response from LinkedIn media registration',
            };
        }

        return { success: true, data: { uploadUrl, asset } };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Upload media binary to LinkedIn
 * Step 2: Upload file to the provided URL
 */
async function uploadMediaToLinkedIn(
    accessToken: string,
    uploadUrl: string,
    mediaUrl: string
): Promise<ApiResponse<void>> {
    try {
        // Check if local file exists on disk
        const localPath = resolveLocalFilePath(mediaUrl);
        const isLocalFile = existsSync(localPath);

        logger.debug({ mediaUrl, localPath, isLocalFile }, '[LinkedIn API] Checking media source');

        let mediaBuffer: ArrayBuffer;
        let contentType = 'application/octet-stream';

        if (isLocalFile) {
            // Local file: Read from disk
            const fileBuffer = await readFile(localPath);
            mediaBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

            // Determine content type from extension
            if (mediaUrl.includes('.mp4')) contentType = 'video/mp4';
            else if (mediaUrl.includes('.jpg') || mediaUrl.includes('.jpeg')) contentType = 'image/jpeg';
            else if (mediaUrl.includes('.png')) contentType = 'image/png';

            logger.debug({ path: localPath, size: fileBuffer.length }, '[LinkedIn API] Read local file');
        } else {
            // GUARD: Fail fast if local file is missing but URL is clearly local
            if (mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1')) {
                const errorMsg = `Local media file not found at '${localPath}'. LinkedIn cannot fetch from localhost ('${mediaUrl}'). Please ensure the file exists on the server's disk (check Docker volume mounts) or use a public URL.`;
                logger.error({ mediaUrl, localPath }, '[LinkedIn API] Failed to resolve local file for localhost URL');
                return { success: false, error: errorMsg };
            }

            // Fetch media content from remote URL
            const mediaResponse = await fetch(mediaUrl);
            if (!mediaResponse.ok) {
                return { success: false, error: `Failed to fetch media: ${mediaUrl}` };
            }

            mediaBuffer = await mediaResponse.arrayBuffer();
            contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';
        }

        // Upload to LinkedIn
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

        return { success: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Publish a UGC Post to LinkedIn
 */
export async function publishLinkedInPost(
    accessToken: string,
    authorUrn: string, // e.g., 'urn:li:person:ABC123' or 'urn:li:organization:12345'
    payload: LinkedInPostPayload
): Promise<ApiResponse<{ id: string; url?: string }>> {
    try {
        // Build media array if we have media
        const mediaAssets: string[] = [];

        if (payload.mediaUrls && payload.mediaUrls.length > 0) {
            for (const mediaUrl of payload.mediaUrls) {
                // Step 1: Register upload
                const registerResult = await registerMediaUpload(
                    accessToken,
                    authorUrn,
                    payload.mediaType === 'video' ? 'video' : 'image'
                );

                if (!registerResult.success || !registerResult.data) {
                    logger.error({ error: registerResult.error }, 'LinkedIn media registration failed');
                    return { success: false, error: registerResult.error };
                }

                // Step 2: Upload media
                const uploadResult = await uploadMediaToLinkedIn(
                    accessToken,
                    registerResult.data.uploadUrl,
                    mediaUrl
                );

                if (!uploadResult.success) {
                    logger.error({ error: uploadResult.error }, 'LinkedIn media upload failed');
                    return { success: false, error: uploadResult.error };
                }

                mediaAssets.push(registerResult.data.asset);
            }
        }

        // Build UGC Post body
        const postBody: Record<string, unknown> = {
            author: authorUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: {
                        text: payload.text,
                    },
                    shareMediaCategory: mediaAssets.length > 0
                        ? (payload.mediaType === 'video' ? 'VIDEO' : 'IMAGE')
                        : payload.articleUrl
                            ? 'ARTICLE'
                            : 'NONE',
                    media: mediaAssets.length > 0
                        ? mediaAssets.map(asset => ({
                            status: 'READY',
                            media: asset,
                        }))
                        : payload.articleUrl
                            ? [{
                                status: 'READY',
                                originalUrl: payload.articleUrl,
                                title: { text: payload.articleTitle || '' },
                                description: { text: payload.articleDescription || '' },
                            }]
                            : undefined,
                },
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': payload.visibility || 'PUBLIC',
            },
        };

        const response = await fetch(`${LINKEDIN_API}/ugcPosts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify(postBody),
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error({ platform: 'linkedin', error: data }, 'LinkedIn post creation failed');
            return {
                success: false,
                error: data.message || data.error?.message || 'LinkedIn post creation failed',
            };
        }

        // Extract post ID from the response
        const postId = data.id || response.headers.get('x-restli-id');

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
 * Publish an Article to LinkedIn
 * Note: Full article publishing requires different API access
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
    // Articles are shared as links with article preview
    return publishLinkedInPost(accessToken, authorUrn, {
        text: payload.text,
        articleUrl: payload.url,
        articleTitle: payload.title,
        mediaType: 'article',
    });
}
