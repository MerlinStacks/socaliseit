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

    // Why: If a previous attempt timed out waiting for TikTok to process the
    // video, the publish_id was stored. Poll its status first instead of
    // re-uploading, which would create duplicate posts.
    if (payload.tiktokPendingPublishId) {
        logger.info({ pendingPublishId: payload.tiktokPendingPublishId }, 'TikTok retry: checking pending publish status before re-uploading');
        const { checkPublishStatus } = await import('@/lib/platform-api/tiktok-api');
        const statusResult = await checkPublishStatus(account.accessToken, payload.tiktokPendingPublishId);

        if (statusResult.success) {
            const status = statusResult.data?.status;
            if (status === 'PUBLISH_COMPLETE') {
                const publicPostId = statusResult.data?.publiclyAvailablePostId?.[0];
                if (publicPostId) {
                    logger.info({ publicPostId, pendingPublishId: payload.tiktokPendingPublishId }, 'TikTok retry: previous upload already published successfully');
                    return {
                        success: true,
                        postId: publicPostId,
                        postUrl: `https://tiktok.com/@${account.accountName}/video/${publicPostId}`,
                    };
                }
            }
            // If status is FAILED, fall through to re-upload below
            if (status !== 'FAILED') {
                // Still processing — return timeout error again, don't re-upload
                logger.info({ status, pendingPublishId: payload.tiktokPendingPublishId }, 'TikTok retry: previous upload still processing');
                return {
                    success: false,
                    error: `TikTok video is still processing (status: ${status}). Please retry again in a few minutes.`,
                    postId: `tiktok_pending:${payload.tiktokPendingPublishId}`,
                };
            }
            logger.info({ pendingPublishId: payload.tiktokPendingPublishId }, 'TikTok retry: previous upload failed, will re-upload');
        }
        // If status check itself failed (e.g. expired publish_id), fall through to re-upload
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
            postId: result.data?.postId,
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
        logger.error({ platform: 'tiktok', error: result.error, publishId: result.data?.publishId }, 'TikTok publish failed');
        // Why: On timeout, the video was already uploaded and may be processing
        // on TikTok's side. Store the publishId so retries can poll status
        // instead of re-uploading (which creates duplicates).
        const pendingPublishId = result.data?.publishId;
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
            postId: pendingPublishId ? `tiktok_pending:${pendingPublishId}` : undefined,
        };
    }

    // Why: Only use postId (the real numeric video ID), never fall back to
    // publishId (v_pub_file~v2-1.xxx) — storing that breaks analytics sync
    // ("Video ID must be an integer!") and comment fetching (404s).
    // If numeric ID isn't available yet, store publishId as pending so retry
    // can poll for it later.
    const numericPostId = result.data?.postId;
    const pendingPublishId = !numericPostId ? result.data?.publishId : undefined;

    return {
        success: true,
        postId: numericPostId || (pendingPublishId ? `tiktok_pending:${pendingPublishId}` : undefined),
        postUrl: numericPostId
            ? `https://tiktok.com/@${account.accountName}/video/${numericPostId}`
            : undefined,
    };
}
