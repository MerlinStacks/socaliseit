/**
 * TikTok Creator Info API
 * Why: TikTok requires fetching creator_info before rendering the post page
 * to populate privacy options, check rate limits, and validate video duration.
 */

import { TIKTOK_API_URL } from './constants';
import { platformFetch } from '@/lib/fetch-with-timeout';
import type { ApiResponse } from './types';

/** Privacy level options returned by the TikTok creator_info API */
export type TikTokPrivacyLevel =
    | 'PUBLIC_TO_EVERYONE'
    | 'MUTUAL_FOLLOW_FRIENDS'
    | 'FOLLOWER_OF_CREATOR'
    | 'SELF_ONLY';

/**
 * Creator info returned by TikTok's creator_info endpoint.
 * Why: This data drives multiple compliance requirements in the compose UI.
 */
export interface TikTokCreatorInfo {
    /** Creator's display name — must be shown on the upload page */
    creatorNickname: string;
    /** Creator's TikTok avatar URL */
    creatorAvatarUrl?: string;
    /** Allowed privacy levels — must populate the privacy dropdown */
    privacyLevelOptions: TikTokPrivacyLevel[];
    /** Max video duration in seconds — videos exceeding this must be rejected */
    maxVideoPostDurationSec: number;
    /** Whether comments are disabled in the creator's app settings */
    commentDisabled: boolean;
    /** Whether duets are disabled in the creator's app settings */
    duetDisabled: boolean;
    /** Whether stitches are disabled in the creator's app settings */
    stitchDisabled: boolean;
    /** Whether the creator can currently post (false = rate-limited) */
    canPost: boolean;
}

/**
 * Fetch TikTok creator info for the authenticated user.
 * Why: TikTok mandates this call before showing the publish UI so the app
 * can enforce privacy options, rate limits, and duration constraints.
 */
export async function getTikTokCreatorInfo(
    accessToken: string
): Promise<ApiResponse<TikTokCreatorInfo>> {
    try {
        const url = `${TIKTOK_API_URL}/post/publish/creator_info/query/`;

        const response = await platformFetch('tiktok', 'getCreatorInfo', url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            return {
                success: false,
                error: data.error.message || 'Failed to fetch creator info',
                errorCode: data.error.code,
            };
        }

        const creatorInfo = data.data;

        return {
            success: true,
            data: {
                creatorNickname: creatorInfo?.creator_nickname || 'Unknown',
                creatorAvatarUrl: creatorInfo?.creator_avatar_url,
                privacyLevelOptions: creatorInfo?.privacy_level_options || ['PUBLIC_TO_EVERYONE'],
                maxVideoPostDurationSec: creatorInfo?.max_video_post_duration_sec || 600,
                commentDisabled: creatorInfo?.comment_disabled ?? false,
                duetDisabled: creatorInfo?.duet_disabled ?? false,
                stitchDisabled: creatorInfo?.stitch_disabled ?? false,
                canPost: !creatorInfo?.creator_posting_limit_reached,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}
