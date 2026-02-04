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
                return {
                    success: false,
                    error: 'Pinterest video pins require a publicly accessible video URL',
                };
            }
            mediaSource = {
                source_type: 'video_id',
                cover_image_url: mediaUrl,
                video_url: mediaUrl,
            };
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
            title: payload.caption.slice(0, 100),
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
            title: payload.caption.slice(0, 100),
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
