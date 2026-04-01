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

    // Why: If a previous attempt timed out waiting for container processing,
    // the container ID was stored. Try to publish it instead of creating a new one.
    if (payload.threadsPendingContainerId) {
        logger.info({ pendingContainerId: payload.threadsPendingContainerId }, 'Threads retry: checking pending container');

        // Poll container status (short poll — 5 attempts)
        const THREADS_API = 'https://graph.threads.net/v1.0';
        let containerReady = false;
        let containerFailed = false;
        for (let i = 0; i < 5; i++) {
            const statusRes = await fetch(
                `${THREADS_API}/${payload.threadsPendingContainerId}?fields=status`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            if (statusRes.ok) {
                const data = await statusRes.json();
                if (data.status === 'FINISHED') { containerReady = true; break; }
                if (data.status === 'ERROR' || data.status === 'EXPIRED') { containerFailed = true; break; }
            } else {
                containerFailed = true; break;
            }
            await new Promise(r => setTimeout(r, 3000));
        }

        if (containerReady) {
            // Try to publish the existing container
            logger.info({ pendingContainerId: payload.threadsPendingContainerId }, 'Threads retry: container ready, publishing');
            const publishRes = await fetch(`${THREADS_API}/${userId}/threads_publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ creation_id: payload.threadsPendingContainerId, access_token: accessToken }),
            });
            if (publishRes.ok) {
                const data = await publishRes.json();
                return { success: true, postId: data.id };
            }
            // Publish failed — fall through to re-create
            logger.warn({ pendingContainerId: payload.threadsPendingContainerId }, 'Threads retry: publish of pending container failed, will re-create');
        } else if (!containerFailed) {
            // Still processing — return error, don't re-create
            return {
                success: false,
                error: 'Threads container still processing. Please retry again in a few minutes.',
                postId: `threads_pending:${payload.threadsPendingContainerId}`,
            };
        }
        // If failed/expired, fall through to re-create
        // Why: Clear stale pending ID so it doesn't interfere with the new attempt.
        payload.threadsPendingContainerId = undefined;
    }

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
                    return {
                        success: false, error: result.error || 'Video publish failed',
                        postId: result.data?.id?.startsWith('threads_pending:') ? result.data.id : undefined,
                    };
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
