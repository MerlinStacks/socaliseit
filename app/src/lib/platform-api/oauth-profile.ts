/**
 * OAuth Profile Fetching Service
 * Fetches user profile data from each platform after successful OAuth
 */

import { logger } from '@/lib/logger';

const GRAPH_API_URL = 'https://graph.facebook.com/v24.0';
const TIKTOK_API_URL = 'https://open.tiktokapis.com/v2';
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';
const PINTEREST_API_URL = 'https://api.pinterest.com/v5';
const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';

export interface OAuthProfile {
    platformId: string;
    name: string;
    username: string;
    profilePicture?: string;
    /** Platform-specific metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Fetch Instagram Business Account profile via Facebook Page
 * Requires: instagram_basic permission
 * 
 * IMPORTANT: Graph API v24.0 (2026) requires Page Access Token for publishing.
 * Instagram Business accounts publish via the linked Facebook Page's token.
 */
export async function fetchInstagramProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        // Step 1: Get Facebook Pages the user manages - MUST include access_token for publishing
        const pagesUrl = `${GRAPH_API_URL}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${accessToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
            logger.error({ error: pagesData.error }, 'Failed to fetch Facebook pages');
            return null;
        }

        // Find the first page with an Instagram business account
        const pageWithInstagram = pagesData.data?.find(
            (page: { instagram_business_account?: unknown }) => page.instagram_business_account
        );

        if (!pageWithInstagram?.instagram_business_account) {
            logger.warn('No Instagram business account found linked to any Facebook page');
            return null;
        }

        const ig = pageWithInstagram.instagram_business_account;

        return {
            platformId: ig.id,
            name: ig.name || pageWithInstagram.name,
            username: ig.username || '',
            profilePicture: ig.profile_picture_url,
            metadata: {
                facebookPageId: pageWithInstagram.id,
                facebookPageName: pageWithInstagram.name,
                // Store Page Access Token - REQUIRED for Instagram publishing via Graph API
                pageAccessToken: pageWithInstagram.access_token,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching Instagram profile');
        return null;
    }
}

/**
 * Fetch Facebook Page profile
 * Requires: pages_show_list permission
 * 
 * IMPORTANT: Graph API v24.0 (2026) requires Page Access Token for publishing.
 * The /me/accounts endpoint returns page-specific access_token that must be
 * stored and used for all Page publishing operations (especially videos).
 */
export async function fetchFacebookPageProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        // Get pages the user manages - MUST include access_token field for publishing
        const url = `${GRAPH_API_URL}/me/accounts?fields=id,name,picture{url},fan_count,access_token&access_token=${accessToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            logger.error({ error: data.error }, 'Failed to fetch Facebook pages');
            return null;
        }

        // Use the first page (user can switch later if they have multiple)
        const page = data.data?.[0];
        if (!page) {
            logger.warn('No Facebook pages found');
            return null;
        }

        return {
            platformId: page.id,
            name: page.name,
            username: page.name, // Pages don't have traditional usernames
            profilePicture: page.picture?.data?.url,
            metadata: {
                fanCount: page.fan_count,
                // Store Page Access Token - REQUIRED for video/Reels publishing
                pageAccessToken: page.access_token,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching Facebook page profile');
        return null;
    }
}

/**
 * Fetch TikTok user profile
 * Requires: user.info.basic, user.info.profile scopes
 */
export async function fetchTikTokProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const url = `${TIKTOK_API_URL}/user/info/?fields=open_id,union_id,avatar_url,display_name,username`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            logger.error({ error: data.error }, 'Failed to fetch TikTok profile');
            return null;
        }

        const user = data.data?.user;
        if (!user) {
            return null;
        }

        return {
            platformId: user.open_id || user.union_id,
            name: user.display_name || user.username,
            username: user.username || '',
            profilePicture: user.avatar_url,
            metadata: {
                openId: user.open_id,
                unionId: user.union_id,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching TikTok profile');
        return null;
    }
}

/**
 * Fetch YouTube channel profile
 * Requires: youtube.readonly scope
 */
export async function fetchYouTubeChannel(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const url = `${YOUTUBE_API_URL}/channels?part=snippet,statistics&mine=true`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        const data = await response.json();

        if (data.error) {
            logger.error({ error: data.error }, 'Failed to fetch YouTube channel');
            return null;
        }

        const channel = data.items?.[0];
        if (!channel) {
            return null;
        }

        return {
            platformId: channel.id,
            name: channel.snippet.title,
            username: channel.snippet.customUrl || `@${channel.snippet.title}`,
            profilePicture: channel.snippet.thumbnails?.default?.url,
            metadata: {
                subscriberCount: channel.statistics?.subscriberCount,
                videoCount: channel.statistics?.videoCount,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching YouTube channel');
        return null;
    }
}

/**
 * Fetch Pinterest user profile
 * Requires: boards:read scope
 */
export async function fetchPinterestProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const url = `${PINTEREST_API_URL}/user_account`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        const data = await response.json();

        if (data.code) {
            logger.error({ error: data }, 'Failed to fetch Pinterest profile');
            return null;
        }

        // Also fetch user's boards to get a default board
        const boardsUrl = `${PINTEREST_API_URL}/boards?page_size=1`;
        const boardsResponse = await fetch(boardsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const boardsData = await boardsResponse.json();
        const defaultBoard = boardsData.items?.[0];

        return {
            platformId: data.id || data.username,
            name: data.business_name || data.username,
            username: data.username,
            profilePicture: data.profile_image,
            metadata: {
                followerCount: data.follower_count,
                followingCount: data.following_count,
                defaultBoardId: defaultBoard?.id,
                defaultBoardName: defaultBoard?.name,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching Pinterest profile');
        return null;
    }
}

/**
 * Fetch LinkedIn user profile
 * Requires: openid, profile scopes
 */
export async function fetchLinkedInProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        // LinkedIn OpenID Connect userinfo endpoint
        const url = `${LINKEDIN_API_URL}/userinfo`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        const data = await response.json();

        if (data.error) {
            logger.error({ error: data }, 'Failed to fetch LinkedIn profile');
            return null;
        }

        return {
            platformId: data.sub,
            name: data.name || `${data.given_name} ${data.family_name}`,
            username: data.email || data.sub,
            profilePicture: data.picture,
            metadata: {
                email: data.email,
                locale: data.locale,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching LinkedIn profile');
        return null;
    }
}
