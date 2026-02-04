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
    // Route based on postType
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
 * Why: Stories use a different API endpoint than feed posts
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
 * Why: Reels require video content and use VIDEO type with share_to_feed
 */
async function publishToInstagramReel(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const { publishInstagramFeedPost } = await import('@/lib/platform-api/instagram-api');

    if (payload.mediaType !== 'video') {
        return { success: false, error: 'Reels require video content' };
    }

    // Reels use the same feed post endpoint with VIDEO type
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

async function publishToTikTok(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TikTok Photo Mode (carousel) requires special API access
    // Currently only available to select partners
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

    // YouTube Shorts: postType 'reel' maps to Shorts
    // Shorts are detected by YouTube when video is ≤60s and vertical (9:16)
    // Adding #Shorts to title helps discovery
    const isShorts = payload.postType === 'reel';
    const title = isShorts
        ? `${payload.caption.slice(0, 90)} #Shorts`
        : payload.caption.slice(0, 100);

    const result = await uploadYouTubeVideo(
        account.accessToken,
        {
            title,
            description: payload.caption,
            videoUrl: payload.mediaUrls[0],
            privacyStatus: 'public',
        }
    );

    if (!result.success) {
        logger.error({ platform: 'youtube', postType: isShorts ? 'shorts' : 'video', error: result.error }, 'YouTube upload failed');
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
    // Route based on postType
    if (payload.postType === 'story') {
        return publishToFacebookStory(account, payload);
    }
    if (payload.postType === 'reel') {
        return publishToFacebookReel(account, payload);
    }

    // Default: Page post
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

/**
 * Publish Facebook Story
 * Why: Stories use photo_stories or video_stories endpoints
 * Video stories can use video_url for remote URLs
 */
async function publishToFacebookStory(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaUrls.length === 0) {
        return { success: false, error: 'Stories require media' };
    }

    const mediaUrl = payload.mediaUrls[0];
    const isVideo = payload.mediaType === 'video';

    try {
        if (isVideo) {
            // For video stories, use resumable upload with video_url
            const endpoint = `https://graph.facebook.com/v24.0/${account.accountId}/video_stories`;

            // Step 1: Initialize upload
            const initResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: account.accessToken,
                    upload_phase: 'start',
                })
            });
            const initData = await initResponse.json();

            if (initData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: initData.error }, 'Facebook Story init failed');
                return { success: false, error: initData.error.message, errorCode: initData.error.code?.toString() };
            }

            const videoId = initData.video_id;

            // Step 2: Finish with video_url (Facebook fetches it)
            const finishResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: account.accessToken,
                    upload_phase: 'finish',
                    video_id: videoId,
                    video_url: mediaUrl,
                })
            });
            const finishData = await finishResponse.json();

            if (finishData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: finishData.error }, 'Facebook Story finish failed');
                return { success: false, error: finishData.error.message, errorCode: finishData.error.code?.toString() };
            }

            return { success: true, postId: finishData.post_id || videoId };
        } else {
            // Photo stories use simpler endpoint
            const endpoint = `https://graph.facebook.com/v24.0/${account.accountId}/photo_stories`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: account.accessToken,
                    photo_url: mediaUrl,
                })
            });

            const data = await response.json();

            if (data.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: data.error }, 'Facebook Story publish failed');
                return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
            }

            return { success: true, postId: data.post_id || data.id };
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'facebook', postType: 'story', error: message }, 'Facebook Story publish error');
        return { success: false, error: message };
    }
}

/**
 * Publish Facebook Reel
 * Why: Reels use the video_reels endpoint
 */
async function publishToFacebookReel(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaType !== 'video') {
        return { success: false, error: 'Reels require video content' };
    }

    if (payload.mediaUrls.length === 0) {
        return { success: false, error: 'Reels require a video' };
    }

    const endpoint = `https://graph.facebook.com/v24.0/${account.accountId}/video_reels`;

    try {
        const body = {
            access_token: account.accessToken,
            video_url: payload.mediaUrls[0],
            description: payload.caption,
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.error) {
            logger.error({ platform: 'facebook', postType: 'reel', error: data.error }, 'Facebook Reel publish failed');
            return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
        }

        return { success: true, postId: data.id };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'facebook', postType: 'reel', error: message }, 'Facebook Reel publish error');
        return { success: false, error: message };
    }
}

async function publishToPinterest(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // Route for carousel posts
    if (payload.postType === 'carousel' && payload.mediaUrls.length > 1) {
        return publishToPinterestCarousel(account, payload);
    }

    if (payload.mediaUrls.length === 0) {
        return {
            success: false,
            error: 'Pinterest requires an image or video',
        };
    }

    const PINTEREST_API = 'https://api.pinterest.com/v5';

    try {
        const isVideo = payload.mediaType === 'video';
        const mediaUrl = payload.mediaUrls[0];
        const isLocal = mediaUrl.indexOf('/uploads/') !== -1;

        logger.debug({ platform: 'pinterest', mediaUrl, isLocal, isVideo }, 'Publishing pin');

        // Build media_source based on media type and location
        let mediaSource: Record<string, unknown>;

        if (isVideo) {
            // Video pins use video_url source type
            if (isLocal) {
                // Local videos need to be accessible via public URL for Pinterest
                return {
                    success: false,
                    error: 'Pinterest video pins require a publicly accessible video URL',
                };
            }
            mediaSource = {
                source_type: 'video_id',
                cover_image_url: mediaUrl, // Pinterest needs a cover, using first frame
                video_url: mediaUrl,
            };
        } else if (isLocal) {
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

/**
 * Publish Pinterest Carousel (Multi-image pin)
 * Why: Carousel pins allow up to 5 images in a single pin
 */
async function publishToPinterestCarousel(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const PINTEREST_API = 'https://api.pinterest.com/v5';

    if (payload.mediaUrls.length < 2 || payload.mediaUrls.length > 5) {
        return {
            success: false,
            error: 'Pinterest carousels require 2-5 images',
        };
    }

    try {
        // Build carousel slots (called items in Pinterest API)
        const items = payload.mediaUrls.map((url) => ({
            title: payload.caption.slice(0, 100),
            description: payload.caption,
            link: payload.link || undefined,
            media_source: {
                source_type: 'image_url',
                url,
            },
        }));

        const carouselBody = {
            board_id: payload.boardId || account.metadata?.defaultBoardId,
            carousel_slots: items,
        };

        const response = await fetch(`${PINTEREST_API}/pins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(carouselBody)
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error({ platform: 'pinterest', postType: 'carousel', error: data }, 'Pinterest carousel publish failed');
            return {
                success: false,
                error: data.message || 'Pinterest carousel publish failed',
            };
        }

        return {
            success: true,
            postId: data.id,
            postUrl: `https://pinterest.com/pin/${data.id}`,
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'pinterest', postType: 'carousel', error: errorMessage }, 'Pinterest carousel publish error');
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
    const { publishLinkedInPost, publishLinkedInArticle } = await import('@/lib/platform-api/linkedin-api');

    logger.debug({ platform: 'linkedin', postType: payload.postType, caption: payload.caption.slice(0, 50) }, 'Publishing to LinkedIn');

    // Construct LinkedIn URN from accountId
    // Why: LinkedIn UGC API requires URN format (urn:li:person:XXX or urn:li:organization:XXX)
    // The accountId stored may be just the raw ID or already a URN
    let authorUrn = account.accountId;
    if (!authorUrn.startsWith('urn:li:')) {
        // Default to person URN - organization URNs should be stored with the full URN
        authorUrn = `urn:li:person:${account.accountId}`;
        logger.debug({ accountId: account.accountId, authorUrn }, 'Constructed LinkedIn URN from accountId');
    }

    // Route article posts
    if (payload.postType === 'article') {
        const result = await publishLinkedInArticle(
            account.accessToken,
            authorUrn,
            {
                title: payload.caption.slice(0, 200),
                text: payload.caption,
                url: payload.link,
            }
        );

        if (!result.success) {
            logger.error({ platform: 'linkedin', postType: 'article', error: result.error }, 'LinkedIn article publish failed');
            return { success: false, error: result.error };
        }

        return {
            success: true,
            postId: result.data?.id,
            postUrl: result.data?.id ? `https://linkedin.com/feed/update/${result.data.id}` : undefined,
        };
    }

    // Feed posts (including carousel - LinkedIn handles multi-image automatically)
    const result = await publishLinkedInPost(
        account.accessToken,
        authorUrn,
        {
            text: payload.caption,
            mediaUrls: payload.mediaUrls.length > 0 ? payload.mediaUrls : undefined,
            mediaType: payload.mediaType === 'video' ? 'video' : 'image',
            visibility: 'PUBLIC',
        }
    );

    if (!result.success) {
        logger.error({ platform: 'linkedin', error: result.error }, 'LinkedIn publish failed');
        return { success: false, error: result.error };
    }

    return {
        success: true,
        postId: result.data?.id,
        postUrl: result.data?.url,
    };
}

async function publishToBluesky(
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
        // Split caption into thread parts (by double newline or manually)
        const threadParts = payload.caption.split(/\n\n+/).filter(p => p.trim());

        if (threadParts.length < 2) {
            // Fall back to single post if not enough parts
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

            // Extract post ID from URI
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
            // Only first post gets images
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

    // Default: Single post
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
