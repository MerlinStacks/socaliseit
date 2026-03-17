/**
 * OAuth Profile Fetching Service
 * Fetches user profile data from each platform after successful OAuth
 */

import { logger } from '@/lib/logger';
import {
    GRAPH_API_URL,
    TIKTOK_API_URL,
    YOUTUBE_DATA_API_URL as YOUTUBE_API_URL,
    PINTEREST_API_URL,
    LINKEDIN_API_URL,
} from './constants';

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

/** Represents a single Facebook Page available for connection */
export interface FacebookPageOption {
    id: string;
    name: string;
    picture?: string;
    fanCount?: number;
    pageAccessToken: string;
}

/** Represents a single Instagram Business Account available for connection */
export interface InstagramAccountOption {
    igId: string;
    igName: string;
    igUsername: string;
    igPicture?: string;
    facebookPageId: string;
    facebookPageName: string;
    pageAccessToken: string;
}

/**
 * Fetch ALL Facebook Pages the user manages.
 * Why: Users may manage multiple pages and need to choose which one to link.
 */
export async function fetchAllFacebookPages(accessToken: string): Promise<FacebookPageOption[]> {
    try {
        const url = `${GRAPH_API_URL}/me/accounts?fields=id,name,picture{url},fan_count,access_token&access_token=${accessToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            logger.error({ error: data.error }, 'Failed to fetch Facebook pages for picker');
            return [];
        }

        const pages = data.data;
        if (!pages || pages.length === 0) {
            logger.warn('No Facebook pages found for picker');
            return [];
        }

        return pages.map((page: Record<string, unknown>) => ({
            id: page.id as string,
            name: page.name as string,
            picture: (page.picture as { data?: { url?: string } })?.data?.url,
            fanCount: page.fan_count as number | undefined,
            pageAccessToken: page.access_token as string,
        }));
    } catch (error) {
        logger.error({ error }, 'Error fetching all Facebook pages');
        return [];
    }
}

/**
 * Fetch ALL Instagram Business Accounts linked to the user's Facebook Pages.
 * Why: A user may have multiple IG business accounts across their pages.
 */
export async function fetchAllInstagramAccounts(accessToken: string): Promise<InstagramAccountOption[]> {
    try {
        const url = `${GRAPH_API_URL}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${accessToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            logger.error({ error: data.error }, 'Failed to fetch Instagram accounts for picker');
            return [];
        }

        const pages = data.data;
        if (!pages || pages.length === 0) {
            return [];
        }

        // Why: Filter to only pages that have a linked Instagram Business Account
        const accounts: InstagramAccountOption[] = [];
        for (const page of pages) {
            const ig = page.instagram_business_account;
            if (ig) {
                accounts.push({
                    igId: ig.id,
                    igName: ig.name || page.name,
                    igUsername: ig.username || '',
                    igPicture: ig.profile_picture_url,
                    facebookPageId: page.id,
                    facebookPageName: page.name,
                    pageAccessToken: page.access_token,
                });
            }
        }

        return accounts;
    } catch (error) {
        logger.error({ error }, 'Error fetching all Instagram accounts');
        return [];
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
 * Requires: user_accounts:read scope
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
        // Why: LinkedIn userinfo is an OpenID Connect endpoint at /v2/userinfo,
        // not a Posts API endpoint — use the explicit path.
        const url = `${LINKEDIN_API_URL}/v2/userinfo`;

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

/**
 * Fetch Google Business Profile locations
 * Requires: business.manage scope
 * 
 * Uses the My Business Account Management API to get accounts,
 * then the Business Information API to get locations.
 * 
 * API Flow:
 * 1. GET accounts via mybusinessaccountmanagement.googleapis.com/v1/accounts
 * 2. GET locations for each account via mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
 */
export async function fetchGoogleBusinessProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        // Step 1: Get all accounts the user has access to
        // Requires: My Business Account Management API to be enabled in Google Cloud Console
        const accountsUrl = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';

        logger.debug('Fetching Google Business accounts...');
        const accountsResponse = await fetch(accountsUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        // Check for HTTP errors first
        if (!accountsResponse.ok) {
            const errorText = await accountsResponse.text();
            logger.error(
                { status: accountsResponse.status, error: errorText },
                'Google Business accounts API returned error - ensure My Business Account Management API is enabled'
            );
            return null;
        }

        const accountsData = await accountsResponse.json();

        if (accountsData.error) {
            logger.error({ error: accountsData.error }, 'Failed to fetch Google Business accounts');
            return null;
        }

        logger.debug({ accounts: accountsData }, 'Google Business accounts response');

        // Get the first account
        const account = accountsData.accounts?.[0];
        if (!account) {
            logger.warn('No Google Business accounts found for this user');
            return null;
        }

        // Step 2: Get locations for this account
        // account.name format: "accounts/{accountId}"
        // Requires: My Business Business Information API to be enabled
        // Using minimal readMask - just name and title are essential
        const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`;

        logger.debug({ accountName: account.name }, 'Fetching locations for account');
        const locationsResponse = await fetch(locationsUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        // Check for HTTP errors first
        if (!locationsResponse.ok) {
            const errorText = await locationsResponse.text();
            logger.error(
                { status: locationsResponse.status, error: errorText, accountName: account.name },
                'Google Business locations API returned error - ensure My Business Business Information API is enabled'
            );
            return null;
        }

        const locationsData = await locationsResponse.json();

        if (locationsData.error) {
            logger.error({ error: locationsData.error }, 'Failed to fetch Google Business locations');
            return null;
        }

        logger.debug({ locations: locationsData }, 'Google Business locations response');

        // Use the first location
        const location = locationsData.locations?.[0];
        if (!location) {
            logger.warn({ accountName: account.name }, 'No locations found for Google Business account');
            return null;
        }

        // Extract account ID from the name (format: "accounts/{accountId}")
        const accountId = account.name?.split('/').pop() || account.name;
        // Extract location ID from the name (format: "locations/{locationId}")
        const locationId = location.name?.split('/').pop() || location.name;

        // Combine accountId and locationId for publishing (format: "{accountId}_{locationId}")
        const combinedPlatformId = `${accountId}_${locationId}`;

        return {
            platformId: combinedPlatformId,
            name: location.title || account.accountName || 'Business Location',
            username: location.title || account.accountName,
            profilePicture: undefined, // Google Business doesn't return profile pictures in this API
            metadata: {
                accountId: account.name,
                locationId: location.name,
                accountName: account.accountName,
                accountType: account.type,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching Google Business profile');
        return null;
    }
}

/**
 * Fetch Bluesky profile using AT Protocol session
 * Note: Bluesky uses session auth, not OAuth. This is called after createSession.
 */
export async function fetchBlueskyProfile(accessToken: string, did?: string): Promise<OAuthProfile | null> {
    try {
        // Get profile using the access token (JWT)
        const url = `https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${did || 'self'}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        const data = await response.json();

        if (data.error) {
            logger.error({ error: data }, 'Failed to fetch Bluesky profile');
            return null;
        }

        return {
            platformId: data.did,
            name: data.displayName || data.handle,
            username: data.handle,
            profilePicture: data.avatar,
            metadata: {
                did: data.did,
                followersCount: data.followersCount,
                followsCount: data.followsCount,
                postsCount: data.postsCount,
                description: data.description,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching Bluesky profile');
        return null;
    }
}

/**
 * Fetch Threads profile via Threads API
 * Requires: threads_basic scope
 *
 * Why: Threads uses a separate API domain (graph.threads.net) from the
 * main Meta Graph API, with its own user endpoint.
 */
export async function fetchThreadsProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const fields = 'id,username,name,threads_profile_picture_url,threads_biography';
        const url = `https://graph.threads.net/v1.0/me?fields=${fields}&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            logger.error({ error: data.error }, 'Failed to fetch Threads profile');
            return null;
        }

        return {
            platformId: data.id,
            name: data.name || data.username || 'Threads User',
            username: data.username || '',
            profilePicture: data.threads_profile_picture_url,
            metadata: {
                biography: data.threads_biography,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Error fetching Threads profile');
        return null;
    }
}

/**
 * Create Bluesky session using AT Protocol
 * Returns access token and refresh token for the session, or an error string.
 *
 * Why: We return `{ session, error }` instead of `null` so callers can
 * surface the real AT Protocol error (e.g. "Invalid identifier or password")
 * to the user instead of a generic failure message.
 */
export async function createBlueskySession(
    identifier: string,
    password: string
): Promise<{
    session: { accessJwt: string; refreshJwt: string; did: string; handle: string } | null;
    error?: string;
}> {
    try {
        // Why: AT Protocol rejects identifiers with a leading '@'. Users naturally
        // include it (e.g. "@handle.bsky.social"), so we strip it server-side.
        const normalizedId = identifier.startsWith('@') ? identifier.slice(1) : identifier;
        const url = 'https://bsky.social/xrpc/com.atproto.server.createSession';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                identifier: normalizedId,
                password,
            }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            const reason = data.message || data.error || `HTTP ${response.status}`;
            logger.error({ error: data, status: response.status }, 'Failed to create Bluesky session');
            return { session: null, error: reason };
        }

        return {
            session: {
                accessJwt: data.accessJwt,
                refreshJwt: data.refreshJwt,
                did: data.did,
                handle: data.handle,
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Network error';
        logger.error({ error }, 'Error creating Bluesky session');
        return { session: null, error: message };
    }
}

