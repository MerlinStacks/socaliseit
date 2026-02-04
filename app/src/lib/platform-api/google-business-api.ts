/**
 * Google Business Profile API Service
 * Handles post creation, media upload, and location management.
 *
 * Why: Direct Google Business Profile API integration (now that approval is granted)
 * provides better reliability and lower latency than third-party proxies.
 *
 * API Reference: https://developers.google.com/my-business/content/posts-data
 */

import { logger } from '@/lib/logger';

const GBP_API_BASE = 'https://mybusiness.googleapis.com/v4';

/**
 * Local post topic types supported by Google Business Profile.
 */
export type LocalPostTopicType = 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT';

/**
 * Call-to-action types for local posts.
 */
export type CallToActionType =
    | 'ACTION_TYPE_UNSPECIFIED'
    | 'BOOK'
    | 'ORDER'
    | 'SHOP'
    | 'LEARN_MORE'
    | 'SIGN_UP'
    | 'CALL';

/**
 * Media item for a local post.
 */
export interface LocalPostMedia {
    mediaFormat: 'PHOTO' | 'VIDEO';
    sourceUrl: string;
}

/**
 * Call-to-action button configuration.
 */
export interface CallToAction {
    actionType: CallToActionType;
    url?: string;
}

/**
 * Request payload for creating a local post.
 */
export interface CreateLocalPostRequest {
    languageCode?: string;
    summary: string;
    media?: LocalPostMedia[];
    callToAction?: CallToAction;
    topicType?: LocalPostTopicType;
}

/**
 * Response from creating a local post.
 */
export interface CreateLocalPostResponse {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
    errorCode?: string;
}

/**
 * Creates a local post on a Google Business Profile location.
 *
 * @param accessToken - Valid OAuth access token with business.manage scope
 * @param accountId - Google Business account ID (format: accounts/123456789)
 * @param locationId - Location ID (format: locations/987654321)
 * @param post - Post content and configuration
 * @returns Result with postId or error details
 */
export async function createLocalPost(
    accessToken: string,
    accountId: string,
    locationId: string,
    post: CreateLocalPostRequest
): Promise<CreateLocalPostResponse> {
    // Ensure IDs have correct prefix format
    const formattedAccountId = accountId.startsWith('accounts/')
        ? accountId
        : `accounts/${accountId}`;
    const formattedLocationId = locationId.startsWith('locations/')
        ? locationId
        : `locations/${locationId}`;

    const url = `${GBP_API_BASE}/${formattedAccountId}/${formattedLocationId}/localPosts`;

    const body = {
        languageCode: post.languageCode || 'en-US',
        summary: post.summary,
        topicType: post.topicType || 'STANDARD',
        ...(post.media && post.media.length > 0 && { media: post.media }),
        ...(post.callToAction && { callToAction: post.callToAction }),
    };

    logger.debug(
        { url, accountId: formattedAccountId, locationId: formattedLocationId },
        'Creating Google Business local post'
    );

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error(
                { status: response.status, error: data.error },
                'Google Business post creation failed'
            );

            // Handle specific error codes
            const errorMessage = data.error?.message || 'Failed to create post';
            const errorCode = data.error?.code?.toString() || response.status.toString();

            return {
                success: false,
                error: errorMessage,
                errorCode: errorCode,
            };
        }

        // Extract post ID from the response name (format: accounts/.../locations/.../localPosts/{postId})
        const postId = data.name?.split('/').pop() || data.name;

        // Construct the public URL for the post
        // Note: Google Business posts are visible on the business's Google profile
        const postUrl = `https://business.google.com/posts/${postId}`;

        logger.info(
            { postId, locationId: formattedLocationId },
            'Google Business post created successfully'
        );

        return {
            success: true,
            postId,
            postUrl,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Google Business API request failed');

        return {
            success: false,
            error: errorMessage,
            errorCode: 'NETWORK_ERROR',
        };
    }
}

/**
 * Parses a stored platformId back into accountId and locationId.
 * The platformId is stored as "{accountId}_{locationId}" during account connection.
 *
 * @param platformId - Combined ID from SocialAccount.platformId
 * @returns Object with accountId and locationId, or null if invalid format
 */
export function parseGoogleBusinessPlatformId(platformId: string): {
    accountId: string;
    locationId: string;
} | null {
    const parts = platformId.split('_');
    if (parts.length !== 2) {
        logger.warn({ platformId }, 'Invalid Google Business platformId format');
        return null;
    }

    return {
        accountId: parts[0],
        locationId: parts[1],
    };
}

/**
 * Maps a media MIME type to Google Business media format.
 */
export function getMediaFormat(mimeType: string): 'PHOTO' | 'VIDEO' {
    if (mimeType.startsWith('video/')) {
        return 'VIDEO';
    }
    return 'PHOTO';
}

/**
 * Maps a CTA type string to Google Business CallToActionType.
 */
export function mapCallToActionType(ctaType?: string): CallToActionType | undefined {
    if (!ctaType) return undefined;

    const mapping: Record<string, CallToActionType> = {
        book: 'BOOK',
        order: 'ORDER',
        shop: 'SHOP',
        learn_more: 'LEARN_MORE',
        sign_up: 'SIGN_UP',
        call: 'CALL',
    };

    return mapping[ctaType.toLowerCase()] || 'LEARN_MORE';
}
