/**
 * Google Business Profile Reviews API
 *
 * Why: Fetches reviews from Google Business Profile locations and posts replies.
 * Uses the My Business Account Management + Business Profile Performance APIs.
 *
 * API Reference:
 * - List reviews: GET /v4/{parent}/reviews
 * - Reply to review: PUT /v4/{name}/reply
 */

import { logger } from '@/lib/logger';
import { parseGoogleBusinessPlatformId } from './google-business-api';

const GBP_API_BASE = 'https://mybusiness.googleapis.com/v4';

/** Mapped star rating from Google's enum to integer */
const STAR_RATING_MAP: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
};

/** Shape returned by the Google reviews endpoint */
interface GoogleReviewRaw {
    name: string;
    reviewId: string;
    reviewer: { displayName: string; profilePhotoUrl?: string };
    starRating: string;
    comment?: string;
    createTime: string;
    updateTime: string;
    reviewReply?: { comment: string; updateTime: string };
}

/** Normalised review returned to callers */
export interface GoogleReview {
    platformReviewId: string;
    authorName: string;
    authorAvatar: string | null;
    rating: number;
    text: string | null;
    replyText: string | null;
    isReplied: boolean;
    reviewUrl: string | null;
    createdAt: string;
}

export interface GoogleReviewsResponse {
    success: boolean;
    reviews: GoogleReview[];
    totalCount: number;
    complete: boolean;
    error?: string;
}

export interface GoogleReplyResponse {
    success: boolean;
    error?: string;
    /** HTTP status code from the Google API (populated on failure) */
    statusCode?: number;
}

/**
 * Fetch all reviews for a Google Business Profile location.
 *
 * @param accessToken - OAuth token with business.manage scope
 * @param platformId  - Combined "{accountId}_{locationId}" from SocialAccount
 */
export async function getGoogleReviews(
    accessToken: string,
    platformId: string,
): Promise<GoogleReviewsResponse> {
    const parsed = parseGoogleBusinessPlatformId(platformId);
    if (!parsed) {
        return { success: false, reviews: [], totalCount: 0, complete: false, error: 'Invalid platformId format' };
    }

    const { accountId, locationId } = parsed;
    const formattedAccount = accountId.startsWith('accounts/') ? accountId : `accounts/${accountId}`;
    const formattedLocation = locationId.startsWith('locations/') ? locationId : `locations/${locationId}`;
    const baseUrl = `${GBP_API_BASE}/${formattedAccount}/${formattedLocation}/reviews`;

    logger.debug({ url: baseUrl }, 'Fetching Google Business reviews');

    try {
        const rawReviews: GoogleReviewRaw[] = [];
        const seenPageTokens = new Set<string>();
        let pageToken: string | undefined;
        let totalCount = 0;

        do {
            const url = new URL(baseUrl);
            url.searchParams.set('pageSize', '50');
            if (pageToken) url.searchParams.set('pageToken', pageToken);

            const response = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const data = await response.json();

            if (!response.ok) {
                const msg = data.error?.message || 'Failed to fetch reviews';
                logger.error({ status: response.status, error: data.error }, 'Google reviews fetch failed');
                return { success: false, reviews: [], totalCount: 0, complete: false, error: msg };
            }

            rawReviews.push(...(data.reviews || []));
            totalCount = data.totalReviewCount ?? totalCount;
            pageToken = data.nextPageToken;

            if (pageToken && seenPageTokens.has(pageToken)) {
                throw new Error('Google reviews pagination returned a repeated page token');
            }
            if (pageToken) seenPageTokens.add(pageToken);
        } while (pageToken);

        if (totalCount > rawReviews.length) {
            throw new Error(`Google reviews pagination incomplete: fetched ${rawReviews.length} of ${totalCount}`);
        }

        const reviews: GoogleReview[] = rawReviews.map((r) => ({
            platformReviewId: r.reviewId,
            authorName: r.reviewer?.displayName || 'Anonymous',
            authorAvatar: r.reviewer?.profilePhotoUrl || null,
            rating: STAR_RATING_MAP[r.starRating] ?? 0,
            text: r.comment || null,
            replyText: r.reviewReply?.comment || null,
            isReplied: !!r.reviewReply,
            reviewUrl: null, // Google doesn't provide a direct link per review
            createdAt: r.createTime,
        }));

        logger.info({ count: reviews.length }, 'Fetched Google Business reviews');
        return { success: true, reviews, totalCount: totalCount || reviews.length, complete: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: msg }, 'Google reviews API request failed');
        return { success: false, reviews: [], totalCount: 0, complete: false, error: msg };
    }
}

/**
 * Reply to (or update reply on) a Google Business Profile review.
 *
 * @param accessToken - OAuth token with business.manage scope
 * @param platformId  - Combined "{accountId}_{locationId}" from SocialAccount
 * @param reviewId    - The platformReviewId of the review
 * @param replyText   - Reply body text
 */
export async function replyToGoogleReview(
    accessToken: string,
    platformId: string,
    reviewId: string,
    replyText: string,
): Promise<GoogleReplyResponse> {
    const parsed = parseGoogleBusinessPlatformId(platformId);
    if (!parsed) {
        return { success: false, error: 'Invalid platformId format' };
    }

    const { accountId, locationId } = parsed;
    const formattedAccount = accountId.startsWith('accounts/') ? accountId : `accounts/${accountId}`;
    const formattedLocation = locationId.startsWith('locations/') ? locationId : `locations/${locationId}`;
    const url = `${GBP_API_BASE}/${formattedAccount}/${formattedLocation}/reviews/${reviewId}/reply`;

    logger.debug({ url, reviewId }, 'Replying to Google Business review');

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ comment: replyText }),
        });

        if (!response.ok) {
            const data = await response.json();
            const msg = data.error?.message || 'Failed to reply to review';
            logger.error({ status: response.status, error: data.error }, 'Google review reply failed');
            return { success: false, error: msg, statusCode: response.status };
        }

        logger.info({ reviewId }, 'Google Business review reply posted');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: msg }, 'Google review reply request failed');
        return { success: false, error: msg };
    }
}
