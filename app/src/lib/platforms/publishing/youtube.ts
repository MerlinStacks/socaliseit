/**
 * YouTube Publisher
 * Why: YouTube-specific publishing logic (Videos, Shorts).
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

/**
 * Publish to YouTube
 */
export async function publishToYouTube(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaType !== 'video' || payload.mediaUrls.length === 0) {
        return {
            success: false,
            error: 'YouTube only supports video content',
        };
    }

    const { uploadYouTubeVideo } = await import('@/lib/platform-api/youtube-api');

    // YouTube Shorts: postType 'reel' maps to Shorts
    const isShorts = payload.postType === 'reel';
    const title = isShorts
        ? `${payload.caption.slice(0, 90)} #Shorts`
        : payload.caption.slice(0, 100);

    const result = await uploadYouTubeVideo(
        account.accessToken,
        {
            title,
            description: payload.caption,
            videoUrl: payload.mediaUrls[0],
            privacyStatus: 'public',
        }
    );

    if (!result.success) {
        logger.error({ platform: 'youtube', postType: isShorts ? 'shorts' : 'video', error: result.error }, 'YouTube upload failed');
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
        };
    }

    return {
        success: true,
        postId: result.data?.videoId,
        postUrl: result.data?.url,
    };
}
