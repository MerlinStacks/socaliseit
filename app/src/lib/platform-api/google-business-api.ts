/**
 * Google Business Profile API Service
 * Handles post creation, media upload, location management, and analytics.
 *
 * Why: Direct Google Business Profile API integration (now that approval is granted)
 * provides better reliability and lower latency than third-party proxies.
 *
 * API Reference: https://developers.google.com/my-business/content/posts-data
 */

import { logger } from '@/lib/logger';
import type { ApiResponse, AccountMetrics } from './types';

const GBP_API_BASE = 'https://mybusiness.googleapis.com/v4';
const GBP_PERFORMANCE_API_BASE = 'https://businessprofileperformance.googleapis.com/v1';

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

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : { error: { message: await response.text() } };

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

// ============================================================================
// Analytics
// ============================================================================

/** Google Business Profile Performance API daily metrics. */
const GBP_METRICS = {
    DESKTOP_MAPS_IMPRESSIONS: 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
    DESKTOP_SEARCH_IMPRESSIONS: 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
    MOBILE_MAPS_IMPRESSIONS: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    MOBILE_SEARCH_IMPRESSIONS: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
    CONVERSATIONS: 'BUSINESS_CONVERSATIONS',
    WEBSITE_CLICKS: 'WEBSITE_CLICKS',
    CALLS: 'CALL_CLICKS',
    DIRECTION_REQUESTS: 'BUSINESS_DIRECTION_REQUESTS',
} as const;

/** Shape returned by the GBP Performance API response. */
interface GbpPerformanceReport {
    multiDailyMetricTimeSeries?: Array<{
        dailyMetricTimeSeries?: Array<{
            dailyMetric: string;
            timeSeries?: {
                datedValues?: Array<{ value?: string }>;
            };
        }>;
    }>;
}

/**
 * Fetches account-level analytics for a Google Business Profile location.
 *
 * Uses the Performance API to retrieve key business metrics for the last 30 days.
 * Falls back to empty metrics if insights are unavailable (e.g., insufficient
 * permissions or newly created location).
 *
 * API Reference: https://developers.google.com/my-business/reference/performance/rest/v1/locations/fetchMultiDailyMetricsTimeSeries
 *
 * @param accessToken - OAuth token with business.manage scope
 * @param platformId  - Combined "{accountId}_{locationId}" from SocialAccount
 */
export async function getGoogleBusinessAnalytics(
    accessToken: string,
    platformId: string,
): Promise<ApiResponse<AccountMetrics>> {
    const parsed = parseGoogleBusinessPlatformId(platformId);
    if (!parsed) {
        return { success: false, error: 'Invalid Google Business platformId format' };
    }

    const { locationId } = parsed;
    const formattedLocation = locationId.startsWith('locations/') ? locationId : `locations/${locationId}`;

    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);

        const params = new URLSearchParams();
        for (const metric of Object.values(GBP_METRICS)) {
            params.append('dailyMetrics', metric);
        }
        params.set('dailyRange.start_date.year', startDate.getUTCFullYear().toString());
        params.set('dailyRange.start_date.month', (startDate.getUTCMonth() + 1).toString());
        params.set('dailyRange.start_date.day', startDate.getUTCDate().toString());
        params.set('dailyRange.end_date.year', endDate.getUTCFullYear().toString());
        params.set('dailyRange.end_date.month', (endDate.getUTCMonth() + 1).toString());
        params.set('dailyRange.end_date.day', endDate.getUTCDate().toString());

        const reportUrl = `${GBP_PERFORMANCE_API_BASE}/${formattedLocation}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;

        const response = await fetch(reportUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : { error: { message: await response.text() } };

        if (!response.ok) {
            // 403/401 = no insights permission — log and return empty data gracefully
            if (response.status === 403 || response.status === 401) {
                logger.warn({ status: response.status, error: data.error }, 'GBP insights not available — missing permission');
                return {
                    success: true,
                    data: {
                        followers: 0,
                        followersChange: 0,
                        following: 0,
                        impressions: 0,
                        reach: 0,
                        engagementRate: 0,
                        profileViews: 0,
                        websiteClicks: 0,
                        emailClicks: 0,
                    },
                };
            }
            const msg = data.error?.message || 'Failed to fetch GBP insights';
            logger.error({ status: response.status, error: data.error }, 'GBP insights fetch failed');
            return { success: false, error: msg };
        }

        const report = data as GbpPerformanceReport;
        const dataPoints = report.multiDailyMetricTimeSeries?.flatMap(
            item => item.dailyMetricTimeSeries ?? []
        ) ?? [];
        const metrics = extractGbpMetrics(dataPoints);

        return {
            success: true,
            data: {
                followers: 0,
                followersChange: 0,
                following: 0,
                impressions: metrics.impressions,
                reach: metrics.reach,
                engagementRate: metrics.engagementRate,
                profileViews: metrics.profileViews,
                websiteClicks: metrics.websiteClicks,
                emailClicks: 0,
                platformMetrics: {
                    calls: metrics.calls,
                    directionRequests: metrics.directionRequests,
                    conversations: metrics.conversations,
                    searchImpressions: metrics.searchImpressions,
                    mapsImpressions: metrics.mapsImpressions,
                },
            },
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: msg }, 'GBP analytics request failed');
        return { success: false, error: msg };
    }
}

/**
 * Extracts individual metric totals from the Performance API response data points.
 */
function extractGbpMetrics(dataPoints: Array<{ dailyMetric: string; timeSeries?: { datedValues?: Array<{ value?: string }> } }>) {
    const values: Record<string, number> = {};

    for (const dp of dataPoints) {
        const metricKey = dp.dailyMetric;
        values[metricKey] = (dp.timeSeries?.datedValues ?? []).reduce((sum, point) => {
            return sum + (point.value ? parseInt(point.value, 10) || 0 : 0);
        }, 0);
    }

    const searchImpressions = (values[GBP_METRICS.DESKTOP_SEARCH_IMPRESSIONS] || 0)
        + (values[GBP_METRICS.MOBILE_SEARCH_IMPRESSIONS] || 0);

    const mapsImpressions = (values[GBP_METRICS.DESKTOP_MAPS_IMPRESSIONS] || 0)
        + (values[GBP_METRICS.MOBILE_MAPS_IMPRESSIONS] || 0);

    const totalImpressions = searchImpressions + mapsImpressions;

    return {
        impressions: totalImpressions,
        reach: totalImpressions,
        profileViews: totalImpressions,
        websiteClicks: values[GBP_METRICS.WEBSITE_CLICKS] || 0,
        calls: values[GBP_METRICS.CALLS] || 0,
        directionRequests: values[GBP_METRICS.DIRECTION_REQUESTS] || 0,
        conversations: values[GBP_METRICS.CONVERSATIONS] || 0,
        searchImpressions,
        mapsImpressions,
        engagementRate: totalImpressions > 0
            ? ((values[GBP_METRICS.CALLS] || 0) + (values[GBP_METRICS.WEBSITE_CLICKS] || 0) + (values[GBP_METRICS.DIRECTION_REQUESTS] || 0)) / totalImpressions
            : 0,
    };
}
