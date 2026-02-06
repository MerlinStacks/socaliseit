/**
 * Pinterest Publisher
 * Why: Pinterest-specific publishing logic (Pins, Carousels).
 */

import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

const PINTEREST_API = 'https://api.pinterest.com/v5';

/**
 * Main Pinterest publisher - routes to appropriate sub-publisher
 */
export async function publishToPinterest(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // Pinterest REQUIRES a board_id
    const boardId = payload.boardId || (account.metadata?.defaultBoardId as string | undefined);
    if (!boardId) {
        logger.warn({ platform: 'pinterest' }, 'No board selected for Pinterest pin');
        return {
            success: false,
            error: 'Pinterest requires a board selection. Please choose a board before publishing.',
            errorCode: 'MISSING_BOARD',
        };
    }

    // Route for carousel posts
    if (payload.postType === 'carousel' && payload.mediaUrls.length > 1) {
        return publishToPinterestCarousel(account, payload);
    }

    if (payload.mediaUrls.length === 0) {
        return {
            success: false,
            error: 'Pinterest requires an image or video',
        };
    }

    try {
        const isVideo = payload.mediaType === 'video';
        const mediaUrl = payload.mediaUrls[0];
        const isLocal = mediaUrl.indexOf('/uploads/') !== -1;

        logger.debug({ platform: 'pinterest', mediaUrl, isLocal, isVideo }, 'Publishing pin');

        // Build media_source based on media type and location
        let mediaSource: Record<string, unknown>;

        if (isVideo) {
            if (isLocal) {
                // Local video: Use Pinterest's multi-step upload API
                const uploadResult = await uploadLocalVideoToPinterest(account.accessToken, mediaUrl);
                if (!uploadResult.success) {
                    return { success: false, error: uploadResult.error };
                }

                mediaSource = {
                    source_type: 'video_id',
                    media_id: uploadResult.mediaId,
                };
            } else {
                // Remote video URL - use direct URL approach
                mediaSource = {
                    source_type: 'video_id',
                    cover_image_url: payload.thumbnailUrl || mediaUrl,
                    video_url: mediaUrl,
                };
            }
        } else if (isLocal) {
            // Local file: Read and send as base64
            const uploadsIndex = mediaUrl.indexOf('/uploads/');
            const relativePath = mediaUrl.substring(uploadsIndex);
            const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
            const localPath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

            if (!existsSync(localPath)) {
                return { success: false, error: `Local image not found: ${localPath}` };
            }

            const fileBuffer = readFileSync(localPath);
            const base64Data = fileBuffer.toString('base64');

            const ext = path.extname(localPath).toLowerCase();
            const contentType = ext === '.png' ? 'image/png' :
                ext === '.gif' ? 'image/gif' :
                    ext === '.webp' ? 'image/webp' : 'image/jpeg';

            mediaSource = {
                source_type: 'image_base64',
                content_type: contentType,
                data: base64Data,
            };

            logger.debug({ platform: 'pinterest', localPath, size: fileBuffer.length }, 'Using base64 upload');
        } else {
            mediaSource = {
                source_type: 'image_url',
                url: mediaUrl,
            };
        }

        const pinBody = {
            title: payload.pinTitle || payload.caption.slice(0, 100),
            description: payload.caption,
            link: payload.link || undefined,
            board_id: payload.boardId || account.metadata?.defaultBoardId,
            media_source: mediaSource,
        };

        const response = await fetch(`${PINTEREST_API}/pins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pinBody)
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error({ platform: 'pinterest', error: data }, 'Pinterest publish failed');
            return {
                success: false,
                error: data.message || 'Pinterest publish failed',
            };
        }

        return {
            success: true,
            postId: data.id,
            postUrl: `https://pinterest.com/pin/${data.id}`,
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'pinterest', error: errorMessage }, 'Pinterest publish error');
        return {
            success: false,
            error: errorMessage,
        };
    }
}

/**
 * Upload local video to Pinterest using their media upload API
 * Flow: 1) Register upload -> 2) Upload file to upload_url -> 3) Poll for completion
 */
async function uploadLocalVideoToPinterest(
    accessToken: string,
    mediaUrl: string
): Promise<{ success: true; mediaId: string } | { success: false; error: string }> {
    try {
        // Resolve local file path
        const uploadsIndex = mediaUrl.indexOf('/uploads/');
        const relativePath = mediaUrl.substring(uploadsIndex);
        const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
        const localPath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

        if (!existsSync(localPath)) {
            return { success: false, error: `Local video not found: ${localPath}` };
        }

        const fileBuffer = readFileSync(localPath);
        logger.debug({ platform: 'pinterest', localPath, size: fileBuffer.length }, 'Starting Pinterest video upload');

        // Step 1: Register media upload
        const registerResponse = await fetch(`${PINTEREST_API}/media`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ media_type: 'video' })
        });

        const registerData = await registerResponse.json();

        if (!registerResponse.ok || !registerData.upload_url) {
            logger.error({ platform: 'pinterest', error: registerData }, 'Pinterest media register failed');
            return { success: false, error: registerData.message || 'Failed to register video upload' };
        }

        const { media_id, upload_url, upload_parameters } = registerData;
        logger.debug({ platform: 'pinterest', media_id }, 'Pinterest upload registered');

        // Step 2: Upload video file to upload_url with multipart form
        const formData = new FormData();

        // Add all upload_parameters first (Pinterest requires these)
        if (upload_parameters) {
            for (const [key, value] of Object.entries(upload_parameters)) {
                formData.append(key, value as string);
            }
        }

        // Add the video file
        const blob = new Blob([fileBuffer], { type: 'video/mp4' });
        formData.append('file', blob, path.basename(localPath));

        const uploadResponse = await fetch(upload_url, {
            method: 'POST',
            body: formData
        });

        // Pinterest returns 204 on success
        if (!uploadResponse.ok && uploadResponse.status !== 204) {
            const uploadError = await uploadResponse.text();
            logger.error({ platform: 'pinterest', status: uploadResponse.status, error: uploadError }, 'Pinterest file upload failed');
            return { success: false, error: `Video upload failed: ${uploadResponse.status}` };
        }

        logger.debug({ platform: 'pinterest', media_id }, 'Pinterest video file uploaded, waiting for processing');

        // Step 3: Poll for media processing completion
        const maxAttempts = 60; // 5 minutes max (5 second intervals)
        const pollInterval = 5000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const statusResponse = await fetch(`${PINTEREST_API}/media/${media_id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const statusData = await statusResponse.json();

            if (!statusResponse.ok) {
                logger.error({ platform: 'pinterest', error: statusData }, 'Pinterest media status check failed');
                return { success: false, error: statusData.message || 'Failed to check media status' };
            }

            const status = statusData.status;
            logger.debug({ platform: 'pinterest', media_id, status, attempt }, 'Pinterest media processing status');

            if (status === 'succeeded') {
                logger.debug({ platform: 'pinterest', media_id }, 'Pinterest video processing complete');
                return { success: true, mediaId: media_id };
            }

            if (status === 'failed') {
                return { success: false, error: 'Pinterest video processing failed' };
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return { success: false, error: 'Pinterest video processing timeout' };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'pinterest', error: errorMessage }, 'Pinterest video upload error');
        return { success: false, error: errorMessage };
    }
}

/**
 * Publish Pinterest Carousel (Multi-image pin)
 */
async function publishToPinterestCarousel(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaUrls.length < 2 || payload.mediaUrls.length > 5) {
        return {
            success: false,
            error: 'Pinterest carousels require 2-5 images',
        };
    }

    try {
        const items = payload.mediaUrls.map((url) => ({
            title: payload.pinTitle || payload.caption.slice(0, 100),
            description: payload.caption,
            link: payload.link || undefined,
            media_source: {
                source_type: 'image_url',
                url,
            },
        }));

        const carouselBody = {
            board_id: payload.boardId || account.metadata?.defaultBoardId,
            carousel_slots: items,
        };

        const response = await fetch(`${PINTEREST_API}/pins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(carouselBody)
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error({ platform: 'pinterest', postType: 'carousel', error: data }, 'Pinterest carousel publish failed');
            return {
                success: false,
                error: data.message || 'Pinterest carousel publish failed',
            };
        }

        return {
            success: true,
            postId: data.id,
            postUrl: `https://pinterest.com/pin/${data.id}`,
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'pinterest', postType: 'carousel', error: errorMessage }, 'Pinterest carousel publish error');
        return {
            success: false,
            error: errorMessage,
        };
    }
}
