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
 * Uses adaptive polling: 2s for the first ~60s (fast detection for small
 * pre-transcoded H.264 files), then 5s for the remainder to reduce API
 * pressure. Total budget: 30×2s + 114×5s = 630s ≈ 10.5 min, kept below
 * the 14-min PUBLISH_TIMEOUT_MS.
 */
export async function waitForContainerReady(
    accessToken: string,
    containerId: string,
    maxAttempts: number = 144,
    delayMs?: number,
): Promise<ApiResponse<{ status: string }>> {
    /** Why: Threshold for switching from fast (2s) to slow (5s) polling.
     *  Pre-transcoded H.264 videos often finish within 60-90s on Instagram. */
    const FAST_POLL_THRESHOLD = 30;
    const FAST_POLL_MS = 2000;
    const SLOW_POLL_MS = 5000;
    const startTime = Date.now();

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
            const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
            logger.info(
                { containerId, attempts: i + 1, elapsedSec },
                '[Instagram API] Container ready',
            );
            return { success: true, data: { status: 'FINISHED' } };
        }
        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
            const detail = statusMessage !== statusCode ? statusMessage : 'Unknown error';
            return { success: false, error: `Container processing failed: ${statusCode} - ${detail}` };
        }

        // Why: Adaptive polling — poll aggressively while container
        // is likely still processing quickly, then slow down.
        const currentDelay = delayMs ?? (i < FAST_POLL_THRESHOLD ? FAST_POLL_MS : SLOW_POLL_MS);

        logger.debug(
            { containerId, attempt: i + 1, maxAttempts, statusCode, statusMessage, delayMs: currentDelay },
            '[Instagram API] Container not ready, polling...'
        );
        await new Promise(resolve => setTimeout(resolve, currentDelay));
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    return { success: false, error: `Container processing timeout after ${elapsedSec}s` };
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
        // Why: INFO-level log to prove exactly what media_type is being sent.
        // Debug-level is filtered in production and we need this for diagnosis.
        const { access_token: _omit, ...logSafeBody } = containerBody as Record<string, unknown>;
        logger.info({ containerBody: logSafeBody }, '[Instagram API] Creating resumable upload container');

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
