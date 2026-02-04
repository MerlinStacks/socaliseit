/**
 * Google Business Publisher
 * Why: Google Business Profile local post publishing.
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

/**
 * Publish to Google Business
 */
export async function publishToGoogleBusiness(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const {
        createLocalPost,
        parseGoogleBusinessPlatformId,
        getMediaFormat,
    } = await import('@/lib/platform-api/google-business-api');

    logger.debug(
        { platform: 'google_business', caption: payload.caption.slice(0, 50) },
        'Publishing to Google Business'
    );

    // Parse the combined platformId back to accountId and locationId
    const ids = parseGoogleBusinessPlatformId(account.accountId);
    if (!ids) {
        return {
            success: false,
            error: 'Invalid Google Business account configuration. Please reconnect.',
            errorCode: 'INVALID_ACCOUNT_CONFIG',
        };
    }

    // Build media array if we have media URLs
    // Why: Google Business API requires publicly accessible URLs (it fetches media server-side)
    let media: Array<{ mediaFormat: 'PHOTO' | 'VIDEO'; sourceUrl: string }> | undefined;
    if (payload.mediaUrls && payload.mediaUrls.length > 0) {
        // Check for local files - Google can't fetch these
        const hasLocalFiles = payload.mediaUrls.some(url => url.indexOf('/uploads/') !== -1);
        if (hasLocalFiles) {
            logger.warn({ platform: 'google_business' }, 'Google Business requires publicly accessible media URLs');
            return {
                success: false,
                error: 'Google Business Profile requires publicly accessible media URLs. Local uploads are not supported for this platform.',
                errorCode: 'LOCAL_FILE_NOT_SUPPORTED',
            };
        }

        media = payload.mediaUrls.map((url) => ({
            mediaFormat: getMediaFormat(payload.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
            sourceUrl: url,
        }));
    }

    // Map CTA if provided
    const callToAction = payload.link
        ? {
            actionType: 'LEARN_MORE' as const,
            url: payload.link,
        }
        : undefined;

    const result = await createLocalPost(
        account.accessToken,
        ids.accountId,
        ids.locationId,
        {
            summary: payload.caption,
            media,
            callToAction,
            topicType: 'STANDARD',
        }
    );

    if (!result.success) {
        logger.error(
            { platform: 'google_business', error: result.error },
            'Google Business publish failed'
        );
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
        };
    }

    return {
        success: true,
        postId: result.postId,
        postUrl: result.postUrl,
    };
}
