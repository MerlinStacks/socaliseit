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
    // Why: If a previous attempt timed out waiting for container processing,
    // the container ID was stored. Poll its status first instead of creating
    // a new container, which would create duplicate posts.
    if (payload.instagramPendingContainerId) {
        const { waitForContainerReady } = await import('@/lib/platform-api/instagram/upload');
        logger.info({ pendingContainerId: payload.instagramPendingContainerId }, 'Instagram retry: checking pending container status before re-uploading');

        const readyResult = await waitForContainerReady(account.accessToken, payload.instagramPendingContainerId, 10, 3000);

        if (readyResult.success) {
            // Container is ready — publish it
            logger.info({ pendingContainerId: payload.instagramPendingContainerId }, 'Instagram retry: pending container is ready, publishing');
            const { GRAPH_API_URL } = await import('@/lib/platform-api/instagram/constants');
            const publishResp = await fetch(`${GRAPH_API_URL}/${account.accountId}/media_publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${account.accessToken}`,
                },
                body: JSON.stringify({ creation_id: payload.instagramPendingContainerId }),
            });
            const publishData = await publishResp.json();

            if (publishData.error) {
                // Container may have expired or already been published — fall through to re-create
                logger.warn({ error: publishData.error }, 'Instagram retry: pending container publish failed, will re-create');
            } else {
                return { success: true, postId: publishData.id };
            }
        } else {
            // Why: Distinguish container ERROR/EXPIRED (should re-create) from
            // timeout (container still processing, should wait).
            const errorStr = readyResult.error || '';
            const containerDead = errorStr.includes('ERROR') || errorStr.includes('EXPIRED');

            if (!containerDead) {
                // Still processing or timed out polling — don't re-create yet
                logger.info({ pendingContainerId: payload.instagramPendingContainerId, error: errorStr }, 'Instagram retry: container not ready yet');
                return {
                    success: false,
                    error: `Instagram container still processing. Please retry again in a few minutes.`,
                    postId: `ig_pending:${payload.instagramPendingContainerId}`,
                };
            }
        }
        // Container failed/expired — clear the pending ID and fall through to re-create
        logger.info({ pendingContainerId: payload.instagramPendingContainerId }, 'Instagram retry: pending container failed/expired, will re-create');
        // Why: Clear stale pending ID so it doesn't interfere with the new attempt.
        // The new attempt will set a fresh pending ID if it also times out.
        payload.instagramPendingContainerId = undefined;
    }

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
        logger.error({ platform: 'instagram', error: result.error, pendingId: result.data?.id }, 'Instagram publish failed');
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
            // Why: Propagate pending container ID so retry can poll instead of re-creating
            postId: result.data?.id?.startsWith('ig_pending:') ? result.data.id : undefined,
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
        return {
            success: false, error: result.error, errorCode: result.errorCode,
            postId: result.data?.id?.startsWith('ig_pending:') ? result.data.id : undefined,
        };
    }

    return { success: true, postId: result.data?.id };
}

/**
 * Publish Instagram Reel (or Trial Reel)
 */
async function publishToInstagramReel(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaType !== 'video') {
        return { success: false, error: 'Reels require video content' };
    }

    // Trial Reel path: uses is_trial_reel=true on the container
    if (payload.isTrialReel) {
        const { publishTrialReel } = await import('@/lib/platform-api/instagram-api');

        const result = await publishTrialReel(
            account.accessToken,
            account.accountId,
            {
                videoUrl: payload.mediaUrls[0],
                caption: payload.caption,
                coverImageUrl: payload.thumbnailUrl,
                shareToFeed: payload.instagramShareToFeed,
                isTrialReel: true,
            }
        );

        if (!result.success) {
            logger.error({ platform: 'instagram', postType: 'trial_reel', error: result.error }, 'Instagram Trial Reel publish failed');
            return {
                success: false, error: result.error, errorCode: result.errorCode,
                postId: result.data?.id?.startsWith('ig_pending:') ? result.data.id : undefined,
            };
        }

        return { success: true, postId: result.data?.id };
    }

    // Standard Reel path
    const { publishInstagramFeedPost } = await import('@/lib/platform-api/instagram-api');

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
        return {
            success: false, error: result.error, errorCode: result.errorCode,
            postId: result.data?.id?.startsWith('ig_pending:') ? result.data.id : undefined,
        };
    }

    return { success: true, postId: result.data?.id, postUrl: result.data?.permalink };
}
