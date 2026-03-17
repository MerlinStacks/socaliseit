/**
 * Bluesky Publisher
 * Why: Bluesky-specific publishing logic (Posts, Threads).
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

/**
 * Publish to Bluesky
 */
export async function publishToBluesky(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const { createBlueskyPost, createBlueskyThread } = await import('@/lib/platform-api/bluesky-api');

    logger.debug({ platform: 'bluesky', postType: payload.postType, caption: payload.caption.slice(0, 50) }, 'Publishing to Bluesky');

    // Build session from account
    const session = {
        accessJwt: account.accessToken,
        refreshJwt: account.refreshToken,
        did: account.accountId,
        handle: account.accountName || '',
    };

    // Route thread posts
    if (payload.postType === 'thread') {
        const threadParts = payload.caption.split(/\n\n+/).filter(p => p.trim());

        if (threadParts.length < 2) {
            // Fall back to single post
            const result = await createBlueskyPost(session, {
                text: payload.caption,
                images: payload.mediaUrls.length > 0
                    ? payload.mediaUrls.map(url => ({ url }))
                    : undefined,
            });

            if (!result.success || !result.data) {
                logger.error({ platform: 'bluesky', error: result.error }, 'Bluesky publish failed');
                return { success: false, error: result.error };
            }

            const postId = result.data.uri.split('/').pop();
            return {
                success: true,
                postId: postId,
                postUrl: `https://bsky.app/profile/${account.accountName}/post/${postId}`,
            };
        }

        // Create thread with multiple posts
        const threadPayload = threadParts.map((text, index) => ({
            text,
            images: index === 0 && payload.mediaUrls.length > 0
                ? payload.mediaUrls.map(url => ({ url }))
                : undefined,
        }));

        const result = await createBlueskyThread(session, threadPayload);

        if (!result.success || !result.data) {
            logger.error({ platform: 'bluesky', postType: 'thread', error: result.error }, 'Bluesky thread publish failed');
            return { success: false, error: result.error };
        }

        const firstPostId = result.data.posts[0]?.uri.split('/').pop();
        return {
            success: true,
            postId: firstPostId,
            postUrl: `https://bsky.app/profile/${account.accountName}/post/${firstPostId}`,
        };
    }

    // Why: Route video posts to the dedicated video upload pipeline.
    // Videos use a separate AT Protocol service (video.bsky.app) with its own
    // auth flow, upload endpoint, and processing queue.
    if (payload.mediaType === 'video' && payload.mediaUrls.length > 0) {
        const { createBlueskyVideoPost } = await import('@/lib/platform-api/bluesky-api');

        const result = await createBlueskyVideoPost(session, payload.caption, payload.mediaUrls[0]);

        if (!result.success || !result.data) {
            logger.error({ platform: 'bluesky', error: result.error }, 'Bluesky video publish failed');
            return { success: false, error: result.error };
        }

        const postId = result.data.uri.split('/').pop();
        return {
            success: true,
            postId: postId,
            postUrl: `https://bsky.app/profile/${account.accountName}/post/${postId}`,
        };
    }

    // Default: Single post (text or images)
    const result = await createBlueskyPost(session, {
        text: payload.caption,
        images: payload.mediaUrls.length > 0 && payload.mediaType !== 'video'
            ? payload.mediaUrls.map(url => ({ url }))
            : undefined,
    });

    if (!result.success || !result.data) {
        logger.error({ platform: 'bluesky', error: result.error }, 'Bluesky publish failed');
        return { success: false, error: result.error };
    }

    const postId = result.data.uri.split('/').pop();
    return {
        success: true,
        postId: postId,
        postUrl: `https://bsky.app/profile/${account.accountName}/post/${postId}`,
    };
}
