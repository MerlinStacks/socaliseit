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
    // TikTok Photo Mode (carousel) requires special API access
    if (payload.postType === 'carousel') {
        logger.warn({ platform: 'tiktok', postType: 'carousel' }, 'TikTok carousel not yet supported');
        return {
            success: false,
            error: 'TikTok Photo Mode (carousel) requires special API access. Please use video posts instead.',
            errorCode: 'UNSUPPORTED_POST_TYPE',
        };
    }

    if (payload.mediaType !== 'video' || payload.mediaUrls.length === 0) {
        return {
            success: false,
            error: 'TikTok only supports video content',
        };
    }

    // Why: TikTok Point 2b — "there should be no default value". Reject publish
    // if the user never selected a privacy level instead of silently defaulting.
    if (!payload.tiktokPrivacyLevel) {
        return {
            success: false,
            error: 'A privacy level must be selected before publishing to TikTok.',
            errorCode: 'MISSING_PRIVACY_LEVEL',
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
