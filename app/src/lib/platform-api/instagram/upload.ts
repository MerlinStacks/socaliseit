/**
 * Instagram Upload Utilities
 * Why: Shared helpers for media uploads (local file resolution, resumable upload).
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { logger } from '@/lib/logger';
import { ApiResponse } from '../types';
import { GRAPH_API_URL } from './constants';

// Why: Re-export from shared module for backward compatibility with
// existing imports via instagram/index.ts
export { isLocalUrl, resolveLocalFilePath } from '../local-file';

/**
 * Wait for container to be ready (required for video/carousel uploads)
 * Why: Instagram processes media asynchronously, must poll until FINISHED.
 *
 * Defaults: 60 attempts × 5s = 5 min. Large videos (~90MB MOV) need
 * significant server-side transcoding time.
 */
export async function waitForContainerReady(
    accessToken: string,
    containerId: string,
    maxAttempts: number = 60,
    delayMs: number = 5000
): Promise<ApiResponse<{ status: string }>> {
    for (let i = 0; i < maxAttempts; i++) {
        const url = `${GRAPH_API_URL}/${containerId}?fields=status_code,status&access_token=${accessToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const statusCode = data.status_code;
        const statusMessage = data.status;

        if (statusCode === 'FINISHED') {
            return { success: true, data: { status: 'FINISHED' } };
        }
        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
            const detail = statusMessage !== statusCode ? statusMessage : 'Unknown error';
            return { success: false, error: `Container processing failed: ${statusCode} - ${detail}` };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return { success: false, error: 'Container processing timeout' };
}

/**
 * Upload local video to Instagram using Resumable Upload API
 * Uses rupload.facebook.com endpoint for binary upload
 */
export async function uploadLocalVideoToInstagram(
    accessToken: string,
    instagramBusinessId: string,
    localFilePath: string,
    caption?: string,
    mediaType: 'VIDEO' | 'REELS' | 'STORIES' = 'REELS',
    coverImageUrl?: string,
    shareToFeed?: boolean
): Promise<ApiResponse<{ containerId: string }>> {
    try {
        logger.debug({ path: localFilePath, mediaType, coverImageUrl, shareToFeed }, '[Instagram API] Starting resumable upload');

        if (!existsSync(localFilePath)) {
            return { success: false, error: `Local video file not found: ${localFilePath}` };
        }

        const fileBuffer = await readFile(localFilePath);
        const fileSize = fileBuffer.length;

        // Step 1: Create resumable upload container
        const containerBody: Record<string, unknown> = {
            upload_type: 'resumable',
            media_type: mediaType,
            access_token: accessToken,
        };
        if (caption) {
            containerBody.caption = caption;
        }
        if (mediaType === 'REELS') {
            containerBody.share_to_feed = shareToFeed ?? true;
        }
        if (coverImageUrl) {
            containerBody.cover_url = coverImageUrl;
        }

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
