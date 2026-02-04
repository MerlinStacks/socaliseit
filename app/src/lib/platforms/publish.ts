/**
 * Platform Publishing Module
 * Handles content publishing to all supported social platforms.
 * 
 * Why: Isolates publishing logic from OAuth and configuration,
 * allowing each publishing function to be tested independently.
 */

import { logger } from '../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from './types';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

/**
 * Publish content to a platform.
 * Routes to platform-specific implementation based on account type.
 */
export async function publishToPlatform(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // Check if token is expired
    if (new Date() > account.tokenExpiresAt) {
        return {
            success: false,
            error: 'Access token expired',
            errorCode: 'TOKEN_EXPIRED',
        };
    }

    // Platform-specific publishing logic
    switch (account.platform) {
        case 'instagram':
            return publishToInstagram(account, payload);
        case 'tiktok':
            return publishToTikTok(account, payload);
        case 'youtube':
            return publishToYouTube(account, payload);
        case 'facebook':
            return publishToFacebook(account, payload);
        case 'pinterest':
            return publishToPinterest(account, payload);
        case 'linkedin':
            return publishToLinkedIn(account, payload);
        case 'bluesky':
            return publishToBluesky(account, payload);
        case 'google_business':
            return publishToGoogleBusiness(account, payload);
        default:
            return { success: false, error: 'Unsupported platform' };
    }
}

// =============================================================================
// Platform-specific publish implementations
// =============================================================================

async function publishToInstagram(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
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

async function publishToTikTok(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaType !== 'video' || payload.mediaUrls.length === 0) {
        return {
            success: false,
            error: 'TikTok only supports video content',
        };
    }

    const { publishTikTokVideo } = await import('@/lib/platform-api/tiktok-api');

    const result = await publishTikTokVideo(
        account.accessToken,
        {
            title: payload.caption,
            videoUrl: payload.mediaUrls[0],
            privacyLevel: 'PUBLIC_TO_EVERYONE',
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

async function publishToYouTube(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaType !== 'video' || payload.mediaUrls.length === 0) {
        return {
            success: false,
            error: 'YouTube only supports video content',
        };
    }

    const { uploadYouTubeVideo } = await import('@/lib/platform-api/youtube-api');

    const result = await uploadYouTubeVideo(
        account.accessToken,
        {
            title: payload.caption.slice(0, 100),
            description: payload.caption,
            videoUrl: payload.mediaUrls[0],
            privacyStatus: 'public',
        }
    );

    if (!result.success) {
        logger.error({ platform: 'youtube', error: result.error }, 'YouTube upload failed');
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
        };
    }

    return {
        success: true,
        postId: result.data?.videoId,
        postUrl: result.data?.url,
    };
}

async function publishToFacebook(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const { publishFacebookPagePost } = await import('@/lib/platform-api/facebook-api');

    let mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL' = 'IMAGE';
    if (payload.mediaType === 'video') {
        mediaType = 'VIDEO';
    } else if (payload.mediaType === 'carousel' || payload.mediaUrls.length > 1) {
        mediaType = 'CAROUSEL';
    }

    const result = await publishFacebookPagePost(
        account.accessToken,
        account.accountId,
        {
            type: mediaType,
            caption: payload.caption,
            mediaUrls: payload.mediaUrls,
        }
    );

    if (!result.success) {
        logger.error({ platform: 'facebook', error: result.error }, 'Facebook publish failed');
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
        };
    }

    return {
        success: true,
        postId: result.data?.id,
        postUrl: result.data?.permalink || `https://facebook.com/${account.accountId}/posts/${result.data?.id}`,
    };
}

async function publishToPinterest(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaUrls.length === 0) {
        return {
            success: false,
            error: 'Pinterest requires an image or video',
        };
    }

    const PINTEREST_API = 'https://api.pinterest.com/v5';

    try {
        const isVideo = payload.mediaType === 'video';

        if (isVideo) {
            return {
                success: false,
                error: 'Pinterest video upload requires additional setup',
            };
        }

        const mediaUrl = payload.mediaUrls[0];
        const isLocal = mediaUrl.indexOf('/uploads/') !== -1;

        logger.debug({ platform: 'pinterest', mediaUrl, isLocal }, 'Publishing pin');

        // Build media_source based on local vs remote
        let mediaSource: Record<string, unknown>;

        if (isLocal) {
            // Local file: Read and send as base64
            const uploadsIndex = mediaUrl.indexOf('/uploads/');
            const relativePath = mediaUrl.substring(uploadsIndex);
            const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
            const localPath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

            if (!existsSync(localPath)) {
                return { success: false, error: `Local image not found: ${localPath}` };
            }

            const fileBuffer = readFileSync(localPath);
            const base64Data = fileBuffer.toString('base64');

            // Determine content type from extension
            const ext = path.extname(localPath).toLowerCase();
            const contentType = ext === '.png' ? 'image/png' :
                ext === '.gif' ? 'image/gif' :
                    ext === '.webp' ? 'image/webp' : 'image/jpeg';

            mediaSource = {
                source_type: 'image_base64',
                content_type: contentType,
                data: base64Data,
            };

            logger.debug({ platform: 'pinterest', localPath, size: fileBuffer.length }, 'Using base64 upload');
        } else {
            // Remote URL: Use image_url source type
            mediaSource = {
                source_type: 'image_url',
                url: mediaUrl,
            };
        }

        const pinBody = {
            title: payload.caption.slice(0, 100),
            description: payload.caption,
            link: payload.link || undefined,
            board_id: payload.boardId || account.metadata?.defaultBoardId,
            media_source: mediaSource,
        };

        const response = await fetch(`${PINTEREST_API}/pins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pinBody)
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error({ platform: 'pinterest', error: data }, 'Pinterest publish failed');
            return {
                success: false,
                error: data.message || 'Pinterest publish failed',
            };
        }

        return {
            success: true,
            postId: data.id,
            postUrl: `https://pinterest.com/pin/${data.id}`,
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'pinterest', error: errorMessage }, 'Pinterest publish error');
        return {
            success: false,
            error: errorMessage,
        };
    }
}

async function publishToLinkedIn(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement LinkedIn API publishing
    logger.debug({ platform: 'linkedin', caption: payload.caption.slice(0, 50) }, 'Publishing to LinkedIn');

    return {
        success: true,
        postId: `li_${Date.now()}`,
        postUrl: `https://linkedin.com/feed/update/urn:li:share:${Date.now()}`,
    };
}

async function publishToBluesky(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement Bluesky AT Protocol publishing
    logger.debug({ platform: 'bluesky', caption: payload.caption.slice(0, 50) }, 'Publishing to Bluesky');

    return {
        success: true,
        postId: `bsky_${Date.now()}`,
        postUrl: `https://bsky.app/profile/${account.accountName}/post/${Date.now().toString(36)}`,
    };
}

async function publishToGoogleBusiness(
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
    let media: Array<{ mediaFormat: 'PHOTO' | 'VIDEO'; sourceUrl: string }> | undefined;
    if (payload.mediaUrls && payload.mediaUrls.length > 0) {
        media = payload.mediaUrls.map((url) => ({
            mediaFormat: getMediaFormat(payload.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
            sourceUrl: url,
        }));
    }

    // Map CTA if provided - default to LEARN_MORE for Google Business
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
