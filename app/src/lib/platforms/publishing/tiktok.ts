/**
 * TikTok Publisher
 * Why: TikTok-specific publishing logic.
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

/**
 * Publish to TikTok
 */
export async function publishToTikTok(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // Why: TikTok Point 2b — "there should be no default value". Reject publish
    // if the user never selected a privacy level instead of silently defaulting.
    if (!payload.tiktokPrivacyLevel) {
        return {
            success: false,
            error: 'A privacy level must be selected before publishing to TikTok.',
            errorCode: 'MISSING_PRIVACY_LEVEL',
        };
    }

    // Why: Route photo/carousel posts to TikTok Photo Mode, video posts to video API
    if (payload.postType === 'carousel' || payload.mediaType === 'image') {
        if (payload.mediaUrls.length === 0) {
            return { success: false, error: 'At least one image URL is required for photo posts' };
        }

        const { publishTikTokPhotoPost } = await import('@/lib/platform-api/tiktok-api');

        const result = await publishTikTokPhotoPost(account.accessToken, {
            title: payload.caption,
            imageUrls: payload.mediaUrls,
            privacyLevel: payload.tiktokPrivacyLevel,
            disableComment: payload.tiktokComments !== true,
            brandOrganicToggle: payload.tiktokBrandOrganic,
            brandContentToggle: payload.tiktokBrandContent,
            isAigc: payload.tiktokIsAigc,
        });

        if (!result.success) {
            logger.error({ platform: 'tiktok', error: result.error }, 'TikTok photo publish failed');
            return { success: false, error: result.error, errorCode: result.errorCode };
        }

        return {
            success: true,
            postId: result.data?.postId || result.data?.publishId,
            postUrl: result.data?.postId
                ? `https://tiktok.com/@${account.accountName}/video/${result.data.postId}`
                : undefined,
        };
    }

    // Video posts
    if (payload.mediaType !== 'video' || payload.mediaUrls.length === 0) {
        return {
            success: false,
            error: 'TikTok requires video or image content',
        };
    }

    const { publishTikTokVideo } = await import('@/lib/platform-api/tiktok-api');

    const result = await publishTikTokVideo(
        account.accessToken,
        {
            title: payload.caption,
            videoUrl: payload.mediaUrls[0],
            privacyLevel: payload.tiktokPrivacyLevel,
            brandOrganicToggle: payload.tiktokBrandOrganic,
            brandContentToggle: payload.tiktokBrandContent,
            isAigc: payload.tiktokIsAigc,
            // Why: TikTok requires interactions off by default. When toggle is OFF
            // (undefined or false), we must send disable=true to the API.
            disableComment: payload.tiktokComments !== true,
            disableDuet: payload.tiktokDuets !== true,
            disableStitch: payload.tiktokStitches !== true,
        }
    );

    if (!result.success) {
        logger.error({ platform: 'tiktok', error: result.error }, 'TikTok publish failed');
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
        };
    }

    return {
        success: true,
        postId: result.data?.postId || result.data?.publishId,
        postUrl: result.data?.postId
            ? `https://tiktok.com/@${account.accountName}/video/${result.data.postId}`
            : undefined,
    };
}
