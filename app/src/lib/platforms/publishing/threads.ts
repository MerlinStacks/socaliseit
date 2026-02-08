/**
 * Threads Publishing Handler
 * Routes publish payloads to the correct Threads API function.
 *
 * Why: Threads supports text-only, image, video, and carousel posts.
 * This handler inspects the payload to determine which API call to use.
 */

import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';
import {
    createThreadsTextPost,
    createThreadsImagePost,
    createThreadsVideoPost,
    createThreadsCarouselPost,
} from '../../platform-api/threads-api';
import { logger } from '../../logger';

/**
 * Publish content to Threads.
 * Dispatches to text/image/video/carousel based on payload media.
 */
export async function publishToThreads(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const userId = account.accountId;
    const accessToken = account.accessToken;
    const caption = payload.caption || '';

    try {
        // Carousel: multiple media items
        if (payload.mediaUrls && payload.mediaUrls.length > 1) {
            const items = payload.mediaUrls.map((url) => ({
                type: (isVideoUrl(url) ? 'VIDEO' : 'IMAGE') as 'IMAGE' | 'VIDEO',
                url,
            }));

            const result = await createThreadsCarouselPost(userId, accessToken, caption, items);
            if (!result.success) {
                return { success: false, error: result.error || 'Carousel publish failed' };
            }
            return { success: true, postId: result.data?.id };
        }

        // Single media
        if (payload.mediaUrls && payload.mediaUrls.length === 1) {
            const mediaUrl = payload.mediaUrls[0];

            if (isVideoUrl(mediaUrl)) {
                const result = await createThreadsVideoPost(userId, accessToken, caption, mediaUrl);
                if (!result.success) {
                    return { success: false, error: result.error || 'Video publish failed' };
                }
                return { success: true, postId: result.data?.id };
            }

            const result = await createThreadsImagePost(userId, accessToken, caption, mediaUrl);
            if (!result.success) {
                return { success: false, error: result.error || 'Image publish failed' };
            }
            return { success: true, postId: result.data?.id };
        }

        // Text-only post
        if (!caption) {
            return { success: false, error: 'Threads posts require text or media' };
        }

        const result = await createThreadsTextPost(userId, accessToken, caption);
        if (!result.success) {
            return { success: false, error: result.error || 'Text publish failed' };
        }
        return { success: true, postId: result.data?.id };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error, userId }, 'Threads publish exception');
        return { success: false, error: message };
    }
}

/**
 * Basic video URL detection by file extension.
 * Why: Threads requires different media_type for images vs videos.
 */
function isVideoUrl(url: string): boolean {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    const lower = url.toLowerCase().split('?')[0];
    return videoExtensions.some((ext) => lower.endsWith(ext));
}
