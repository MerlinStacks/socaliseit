/**
 * Instagram Publisher
 * Why: Instagram-specific publishing logic (Feed, Story, Reel).
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

/**
 * Main Instagram publisher - routes to appropriate sub-publisher
 */
export async function publishToInstagram(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.postType === 'story') {
        return publishToInstagramStory(account, payload);
    }
    if (payload.postType === 'reel') {
        return publishToInstagramReel(account, payload);
    }

    // Default: Feed post
    const { publishInstagramFeedPost } = await import('@/lib/platform-api/instagram-api');

    let mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL' = 'IMAGE';
    if (payload.mediaType === 'video') {
        mediaType = 'VIDEO';
    } else if (payload.mediaType === 'carousel' || payload.mediaUrls.length > 1) {
        mediaType = 'CAROUSEL';
    }

    const result = await publishInstagramFeedPost(
        account.accessToken,
        account.accountId,
        {
            type: mediaType,
            caption: payload.caption,
            mediaUrls: payload.mediaUrls,
            firstComment: payload.firstComment,
            locationId: payload.location,
            isReel: false,
        }
    );

    if (!result.success) {
        logger.error({ platform: 'instagram', error: result.error }, 'Instagram publish failed');
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
        };
    }

    return {
        success: true,
        postId: result.data?.id,
        postUrl: result.data?.permalink || `https://instagram.com/p/${result.data?.id}`,
    };
}

/**
 * Publish Instagram Story
 */
async function publishToInstagramStory(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const { publishInstagramStory } = await import('@/lib/platform-api/instagram-api');

    if (payload.mediaUrls.length === 0) {
        return { success: false, error: 'Stories require media' };
    }

    const result = await publishInstagramStory(
        account.accessToken,
        account.accountId,
        {
            url: payload.mediaUrls[0],
            type: payload.mediaType === 'video' ? 'video' : 'image'
        }
    );

    if (!result.success) {
        logger.error({ platform: 'instagram', postType: 'story', error: result.error }, 'Instagram Story publish failed');
        return { success: false, error: result.error, errorCode: result.errorCode };
    }

    return { success: true, postId: result.data?.id };
}

/**
 * Publish Instagram Reel
 */
async function publishToInstagramReel(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const { publishInstagramFeedPost } = await import('@/lib/platform-api/instagram-api');

    if (payload.mediaType !== 'video') {
        return { success: false, error: 'Reels require video content' };
    }

    const result = await publishInstagramFeedPost(
        account.accessToken,
        account.accountId,
        {
            type: 'VIDEO',
            caption: payload.caption,
            mediaUrls: payload.mediaUrls,
            firstComment: payload.firstComment,
            locationId: payload.location,
            isReel: true,
        }
    );

    if (!result.success) {
        logger.error({ platform: 'instagram', postType: 'reel', error: result.error }, 'Instagram Reel publish failed');
        return { success: false, error: result.error, errorCode: result.errorCode };
    }

    return { success: true, postId: result.data?.id, postUrl: result.data?.permalink };
}
