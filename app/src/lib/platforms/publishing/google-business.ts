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
        const baseUrl = process.env.NEXTAUTH_URL || '';

        media = payload.mediaUrls.map((url) => {
            let resolvedUrl = url;

            // Convert local /uploads/ paths to publicly accessible URLs
            // Google Business API fetches media server-side, so it needs full public URLs
            if (url.indexOf('/uploads/') !== -1 || url.startsWith('/api/')) {
                if (!baseUrl) {
                    logger.warn(
                        { platform: 'google_business', url },
                        'NEXTAUTH_URL not set — cannot resolve local media to public URL'
                    );
                } else {
                    // Extract relative path (e.g., /api/uploads/image.jpg)
                    const relativePath = url.startsWith('http')
                        ? new URL(url).pathname
                        : url;
                    resolvedUrl = `${baseUrl}${relativePath}`;
                    logger.debug(
                        { original: url, resolved: resolvedUrl },
                        'Resolved local media URL for Google Business'
                    );
                }
            }

            return {
                mediaFormat: getMediaFormat(payload.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
                sourceUrl: resolvedUrl,
            };
        });
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
