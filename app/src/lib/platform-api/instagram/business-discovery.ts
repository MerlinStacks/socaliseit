/**
 * Instagram Business Discovery API
 *
 * Why: Enables looking up public Business/Creator Instagram accounts
 * by username using the connected account's token. Replaces the brittle
 * HTML scraper that Instagram was blocking.
 *
 * Limitations:
 * - Target account must be a **public** Business or Creator account.
 * - Personal / private accounts return an IG API error.
 * - If the target has explicitly blocked your connected IG account,
 *   the API may also return an error.
 *
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
 */

import { GRAPH_API_URL } from './constants';
import type { ApiResponse } from '../types';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface DiscoveredProfile {
    username: string;
    displayName: string;
    biography: string | null;
    followers: number;
    following: number;
    mediaCount: number;
    avatarUrl: string | null;
    isVerified: boolean;
}

export interface DiscoveredMedia {
    id: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
    caption: string;
    permalink: string;
    likeCount: number;
    commentsCount: number;
    timestamp: Date;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Look up a public Instagram Business/Creator account by username.
 *
 * Why: The official Graph API endpoint for competitor profile data —
 * no scraping, no ToS violations, reliable data.
 *
 * @param accessToken  - Token from the caller's connected IG Business account
 * @param igUserId     - The caller's own IG Business account platformId
 * @param targetUsername - The competitor's Instagram username (without @)
 */
export async function getBusinessDiscoveryProfile(
    accessToken: string,
    igUserId: string,
    targetUsername: string
): Promise<ApiResponse<DiscoveredProfile>> {
    const cleanUsername = targetUsername.toLowerCase().replace('@', '').trim();

    const fields = [
        'username',
        'name',
        'biography',
        'followers_count',
        'follows_count',
        'media_count',
        'profile_picture_url',
        'ig_id',
    ].join(',');

    const url =
        `${GRAPH_API_URL}/${igUserId}` +
        `?fields=business_discovery.fields(${fields}){username=${cleanUsername}}` +
        `&access_token=${accessToken}`;

    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(15_000),
        });
        const data = await response.json();

        if (data.error) {
            logger.warn(
                { username: cleanUsername, code: data.error.code, subcode: data.error.error_subcode },
                'Business Discovery API error'
            );
            return {
                success: false,
                error: mapBusinessDiscoveryError(data.error),
                errorCode: String(data.error.code),
            };
        }

        const bd = data.business_discovery;
        if (!bd) {
            return { success: false, error: 'No data returned for this username.' };
        }

        return {
            success: true,
            data: {
                username: bd.username ?? cleanUsername,
                displayName: bd.name ?? cleanUsername,
                biography: bd.biography ?? null,
                followers: bd.followers_count ?? 0,
                following: bd.follows_count ?? 0,
                mediaCount: bd.media_count ?? 0,
                avatarUrl: bd.profile_picture_url ?? null,
                // Why: `is_verified_user` is not available via business_discovery;
                // fall back to false and let sync update it if needed.
                isVerified: false,
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ username: cleanUsername, err: error }, 'Business Discovery profile fetch failed');
        return { success: false, error: message };
    }
}

/**
 * Fetch recent media from a public Instagram Business/Creator account.
 *
 * Why: Provides competitor post data (engagement metrics, posting frequency)
 * without scraping HTML.
 *
 * @param accessToken   - Token from the caller's connected IG Business account
 * @param igUserId      - The caller's own IG Business account platformId
 * @param targetUsername - The competitor's Instagram username (without @)
 * @param limit         - Max posts to return (capped at 50 by the API)
 */
export async function getBusinessDiscoveryMedia(
    accessToken: string,
    igUserId: string,
    targetUsername: string,
    limit: number = 12
): Promise<ApiResponse<DiscoveredMedia[]>> {
    const cleanUsername = targetUsername.toLowerCase().replace('@', '').trim();
    const cappedLimit = Math.min(limit, 50);

    const mediaFields = [
        'media_type',
        'caption',
        'permalink',
        'like_count',
        'comments_count',
        'timestamp',
    ].join(',');

    const url =
        `${GRAPH_API_URL}/${igUserId}` +
        `?fields=business_discovery.fields(media.limit(${cappedLimit}){${mediaFields}}){username=${cleanUsername}}` +
        `&access_token=${accessToken}`;

    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(20_000),
        });
        const data = await response.json();

        if (data.error) {
            logger.warn(
                { username: cleanUsername, code: data.error.code },
                'Business Discovery media API error'
            );
            return {
                success: false,
                error: mapBusinessDiscoveryError(data.error),
                errorCode: String(data.error.code),
            };
        }

        const mediaEdges = data.business_discovery?.media?.data ?? [];
        const posts: DiscoveredMedia[] = mediaEdges.map((m: Record<string, unknown>) => ({
            id: String(m.id ?? ''),
            mediaType: (m.media_type as DiscoveredMedia['mediaType']) ?? 'IMAGE',
            caption: String(m.caption ?? ''),
            permalink: String(m.permalink ?? ''),
            likeCount: Number(m.like_count ?? 0),
            commentsCount: Number(m.comments_count ?? 0),
            timestamp: new Date(String(m.timestamp)),
        }));

        return { success: true, data: posts };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ username: cleanUsername, err: error }, 'Business Discovery media fetch failed');
        return { success: false, error: message };
    }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map raw Graph API error objects into user-friendly messages.
 *
 * Why: The raw API errors reference internal codes that mean nothing to users.
 * Common cases: username not found, personal account, private account.
 */
function mapBusinessDiscoveryError(error: { code?: number; error_subcode?: number; message?: string }): string {
    // OAuthException with subcode 2207013: username not found or not a Business/Creator account
    if (error.error_subcode === 2207013) {
        return 'Account not found. The username may not exist or may be a personal (non-business) account.';
    }

    // Generic "invalid user id" — usually means the account is private
    if (error.code === 100) {
        return 'Unable to look up this account. It may be private or a personal account.';
    }

    // Rate limiting
    if (error.code === 4 || error.code === 32) {
        return 'Rate limit reached. Please wait a few minutes and try again.';
    }

    // Token expired / invalid
    if (error.code === 190) {
        return 'Your Instagram connection has expired. Please reconnect your account in Settings.';
    }

    return error.message ?? 'An unknown error occurred fetching competitor data.';
}
