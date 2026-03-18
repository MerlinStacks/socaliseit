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
    // Why: Instagram's CAROUSEL media_type requires ≥2 children. A post saved
    // as postType=CAROUSEL with only 1 media item must be downgraded to a
    // standard image/video post, otherwise the API returns:
    // "Only photo or video can be accepted as media type."
    if (payload.mediaUrls.length === 1 && payload.mediaType === 'carousel') {
        const videoExtensions = /\.(mp4|mov|avi|webm)(\?|#|$)/i;
        payload.mediaType = videoExtensions.test(payload.mediaUrls[0]) ? 'video' : 'image';
        logger.info(
            { originalPostType: 'carousel', newMediaType: payload.mediaType },
            'Downgraded single-item carousel to single media post',
        );
    }

    // Validate carousel media types - Instagram requires all same type
    if (payload.mediaType === 'carousel' || payload.mediaUrls.length > 1) {
        // Why (R2-05): The `$` anchor fails to match after BUG-05's WebP
        // rewrite appends `?format=jpeg`. Now matches before query string.
        const videoExtensions = /\.(mp4|mov|webm)(\?|$)/i;
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i;

        const hasVideos = payload.mediaUrls.some(url => videoExtensions.test(url));
        const hasImages = payload.mediaUrls.some(url => imageExtensions.test(url));

        if (hasVideos && hasImages) {
            logger.warn({
                platform: 'instagram',
                mediaCount: payload.mediaUrls.length
            }, 'Instagram carousel contains mixed media types');

            return {
                success: false,
                error: 'Instagram carousels must contain either all images or all videos, not a mix of both.',
                errorCode: 'INVALID_CAROUSEL_MEDIA',
            };
        }
    }

    if (payload.postType === 'story') {
        return publishToInstagramStory(account, payload);
    }
    if (payload.postType === 'reel') {
        return publishToInstagramReel(account, payload);
    }

    // Default: Feed post
    const { publishInstagramFeedPost } = await import('@/lib/platform-api/instagram-api');

    let mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL' = 'IMAGE';
    let isReel = false;
    if (payload.mediaType === 'video') {
        // Instagram has deprecated VIDEO media_type - must use REELS for feed videos
        // See: https://developers.facebook.com/docs/instagram-api/reference/ig-user/media#creating
        mediaType = 'VIDEO';
        isReel = true;
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
            isReel: isReel,
            instagramShareToFeed: isReel ? true : undefined, // Show reels in feed
            instagramComments: payload.instagramComments,
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
            coverImageUrl: payload.thumbnailUrl,
            instagramShareToFeed: payload.instagramShareToFeed,
            instagramComments: payload.instagramComments,
        }
    );

    if (!result.success) {
        logger.error({ platform: 'instagram', postType: 'reel', error: result.error }, 'Instagram Reel publish failed');
        return { success: false, error: result.error, errorCode: result.errorCode };
    }

    return { success: true, postId: result.data?.id, postUrl: result.data?.permalink };
}
