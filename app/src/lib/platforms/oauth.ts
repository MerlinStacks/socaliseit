/**
 * OAuth Authentication Module
 * Handles authorization URLs, token exchange, and refresh for all platforms.
 * 
 * Why: Centralizes OAuth logic separate from publishing,
 * making authentication flows testable and maintainable.
 */

import { logger } from '../logger';
import type { Platform } from '../platform-config';
import { PLATFORM_CONFIGS } from './config';
import { META_OAUTH_VERSION } from '../platform-api/constants';

/**
 * Token response from OAuth exchange or refresh.
 */
export interface TokenResponse {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    /** Refresh token expiry in seconds - use for health display (more meaningful than access token expiry) */
    refreshTokenExpiresIn?: number;
}

/**
 * Generate OAuth authorization URL.
 * Requires credentials to be passed in (loaded via getCredentialsForPlatform).
 */
export function getAuthorizationUrl(
    platform: Platform,
    redirectUri: string,
    state: string,
    credentials?: { clientId: string; clientSecret: string }
): string {
    const config = PLATFORM_CONFIGS[platform];

    // Use provided credentials or fall back to env vars for backwards compatibility
    const clientId = credentials?.clientId || process.env[`${platform.toUpperCase()}_CLIENT_ID`] || '';

    // TikTok uses 'client_key' instead of 'client_id' in auth URL
    const clientIdParam = platform === 'tiktok' ? 'client_key' : 'client_id';

    // TikTok and Threads use comma-separated scopes, other platforms use space-separated
    const scopeSeparator = (platform === 'tiktok' || platform === 'threads') ? ',' : ' ';

    const params = new URLSearchParams({
        [clientIdParam]: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: config.scopes.join(scopeSeparator),
        state,
    });

    // Google platforms require additional parameters for refresh tokens
    if (platform === 'youtube' || platform === 'google_business') {
        params.set('access_type', 'offline');  // Required to get refresh token
        params.set('prompt', 'consent');        // Force consent to get new refresh token
    }

    return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token.
 * Makes real API calls to each platform's token endpoint.
 */
export async function exchangeCodeForToken(
    platform: Platform,
    code: string,
    redirectUri: string,
    credentials?: { clientId: string; clientSecret: string }
): Promise<TokenResponse> {
    // Use provided credentials or fall back to env vars
    const clientId = credentials?.clientId || process.env[`${platform.toUpperCase()}_CLIENT_ID`] || '';
    const clientSecret = credentials?.clientSecret || process.env[`${platform.toUpperCase()}_CLIENT_SECRET`] || '';

    if (!clientId || !clientSecret) {
        throw new Error(`Missing credentials for ${platform}. Please configure in Settings → Platform Integrations.`);
    }

    switch (platform) {
        case 'instagram':
        case 'facebook':
            return exchangeFacebookToken(code, redirectUri, clientId, clientSecret);
        case 'threads':
            return exchangeThreadsToken(code, redirectUri, clientId, clientSecret);
        case 'tiktok':
            return exchangeTikTokToken(code, redirectUri, clientId, clientSecret);
        case 'youtube':
        case 'google_business':
            return exchangeGoogleToken(code, redirectUri, clientId, clientSecret);
        case 'pinterest':
            return exchangePinterestToken(code, redirectUri, clientId, clientSecret);
        case 'linkedin':
            return exchangeLinkedInToken(code, redirectUri, clientId, clientSecret);
        case 'bluesky':
            // Bluesky uses AT Protocol session auth, not OAuth
            throw new Error('Bluesky uses session authentication, not OAuth code exchange');
        default:
            throw new Error(`Unsupported platform for OAuth: ${platform}`);
    }
}

/**
 * Refresh an expired access token.
 * Routes to platform-specific refresh implementations.
 */
export async function refreshAccessToken(
    platform: Platform,
    refreshToken: string,
    credentials?: { clientId: string; clientSecret: string }
): Promise<TokenResponse> {
    const clientId = credentials?.clientId || process.env[`${platform.toUpperCase()}_CLIENT_ID`] || '';
    const clientSecret = credentials?.clientSecret || process.env[`${platform.toUpperCase()}_CLIENT_SECRET`] || '';

    logger.info({ platform }, 'Attempting token refresh');

    switch (platform) {
        case 'instagram':
            // Instagram long-lived tokens can be refreshed using the token itself
            return refreshInstagramToken(refreshToken);
        case 'facebook':
            // Why (R2-08): Previously discarded credentials and fell back to process.env.
            // Now passes them through for multi-tenant credential support.
            return refreshFacebookToken(refreshToken, clientId, clientSecret);
        case 'tiktok':
            return refreshTikTokToken(refreshToken, clientId, clientSecret);
        case 'youtube':
        case 'google_business':
            return refreshGoogleToken(refreshToken, clientId, clientSecret);
        case 'pinterest':
            return refreshPinterestToken(refreshToken, clientId, clientSecret);
        case 'linkedin':
            return refreshLinkedInToken(refreshToken, clientId, clientSecret);
        case 'bluesky':
            throw new Error('Bluesky uses session authentication, not OAuth refresh');
        case 'threads':
            return refreshThreadsToken(refreshToken);
        default:
            throw new Error(`Unsupported platform for token refresh: ${platform}`);
    }
}

// =============================================================================
// Platform-specific token refresh implementations
// =============================================================================

/**
 * Refresh Instagram long-lived token
 * Instagram tokens can be refreshed if they're not expired and at least 24 hours old
 */
async function refreshInstagramToken(accessToken: string): Promise<TokenResponse> {
    const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ error: errorData, status: response.status }, 'Instagram token refresh failed (HTTP)');
        throw new Error(errorData.error?.message || `Instagram token refresh failed with HTTP ${response.status}`);
    }
    const data = await response.json();

    if (data.error) {
        logger.error({ error: data.error }, 'Instagram token refresh failed');
        throw new Error(data.error?.message || 'Failed to refresh Instagram token');
    }

    logger.info('Instagram token refreshed successfully');
    return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 5184000, // 60 days
    };
}

/**
 * Refresh Facebook long-lived token
 * Facebook tokens can be refreshed to extend their validity
 */
async function refreshFacebookToken(
    accessToken: string, clientId: string, clientSecret: string
): Promise<TokenResponse> {
    // Why (R2-03): Previously hardcoded process.env.FACEBOOK_CLIENT_ID/SECRET,
    // bypassing the per-org credential store. Now uses params from caller.
    const url = `https://graph.facebook.com/${META_OAUTH_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ error: errorData, status: response.status }, 'Facebook token refresh failed (HTTP)');
        throw new Error(errorData.error?.message || `Facebook token refresh failed with HTTP ${response.status}`);
    }
    const data = await response.json();

    if (data.error) {
        logger.error({ error: data.error }, 'Facebook token refresh failed');
        throw new Error(data.error?.message || 'Failed to refresh Facebook token');
    }

    logger.info('Facebook token refreshed successfully');
    return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 5184000, // 60 days
    };
}

/**
 * Refresh TikTok access token using refresh token
 */
async function refreshTikTokToken(
    refreshToken: string,
    clientKey: string,
    clientSecret: string
): Promise<TokenResponse> {
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ error: errorData, status: response.status }, 'TikTok token refresh failed (HTTP)');
        throw new Error(errorData.error_description || `TikTok token refresh failed with HTTP ${response.status}`);
    }
    const data = await response.json();

    if (data.error && data.error !== 'ok') {
        logger.error({ error: data }, 'TikTok token refresh failed');
        throw new Error(data.error_description || 'Failed to refresh TikTok token');
    }

    logger.info('TikTok token refreshed successfully');
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 86400, // 24 hours
        refreshTokenExpiresIn: data.refresh_expires_in,
    };
}

/**
 * Refresh Google (YouTube/Google Business) access token
 */
async function refreshGoogleToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ error: errorData, status: response.status }, 'Google token refresh failed (HTTP)');
        throw new Error(errorData.error_description || `Google token refresh failed with HTTP ${response.status}`);
    }
    const data = await response.json();

    if (data.error) {
        logger.error({ error: data }, 'Google token refresh failed');
        throw new Error(data.error_description || 'Failed to refresh Google token');
    }

    logger.info('Google token refreshed successfully');
    return {
        accessToken: data.access_token,
        refreshToken: refreshToken, // Google doesn't return new refresh token
        expiresIn: data.expires_in || 3600, // 1 hour
    };
}

/**
 * Refresh Pinterest access token
 */
async function refreshPinterestToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ error: errorData, status: response.status }, 'Pinterest token refresh failed (HTTP)');
        throw new Error(errorData.message || `Pinterest token refresh failed with HTTP ${response.status}`);
    }
    const data = await response.json();

    if (data.code || data.error) {
        logger.error({ error: data }, 'Pinterest token refresh failed');
        throw new Error(data.message || 'Failed to refresh Pinterest token');
    }

    logger.info('Pinterest token refreshed successfully');
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 2592000, // 30 days
        // Pinterest refresh tokens last 1 year
        refreshTokenExpiresIn: data.refresh_token_expires_in || 31536000,
    };
}

/**
 * Refresh LinkedIn access token
 */
async function refreshLinkedInToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ error: errorData, status: response.status }, 'LinkedIn token refresh failed (HTTP)');
        throw new Error(errorData.error_description || `LinkedIn token refresh failed with HTTP ${response.status}`);
    }
    const data = await response.json();

    if (data.error) {
        logger.error({ error: data }, 'LinkedIn token refresh failed');
        throw new Error(data.error_description || 'Failed to refresh LinkedIn token');
    }

    logger.info('LinkedIn token refreshed successfully');
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 5184000, // 60 days
    };
}

// =============================================================================
// Platform-specific token exchange implementations
// =============================================================================



/**
 * Instagram API with Instagram Login token exchange
 * Uses api.instagram.com endpoint, then exchanges for long-lived token
 */
async function exchangeInstagramToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    // Step 1: Exchange code for short-lived access token via Instagram endpoint
    const tokenUrl = 'https://api.instagram.com/oauth/access_token';

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code,
        }),
    });

    const data = await response.json();

    if (data.error_type || data.error_message) {
        logger.error({ error: data }, 'Instagram OAuth token exchange failed');
        throw new Error(data.error_message || 'Failed to exchange Instagram authorization code');
    }

    // Step 2: Exchange short-lived token for long-lived token (60 days)
    const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${data.access_token}`;
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
        logger.warn({ error: longLivedData.error }, 'Failed to get long-lived Instagram token, using short-lived');
        return {
            accessToken: data.access_token,
            expiresIn: 3600, // Short-lived tokens last 1 hour
        };
    }

    return {
        accessToken: longLivedData.access_token,
        expiresIn: longLivedData.expires_in || 5184000, // 60 days default
    };
}

/**
 * Facebook OAuth token exchange - Graph API v24.0
 */
async function exchangeFacebookToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    const tokenUrl = `https://graph.facebook.com/${META_OAUTH_VERSION}/oauth/access_token`;

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code,
        }),
    });

    const data = await response.json();

    if (data.error) {
        logger.error({ error: data.error, redirectUri, clientIdPrefix: clientId.slice(0, 4) + '...' }, 'Facebook OAuth token exchange failed');
        throw new Error(data.error.message || 'Failed to exchange Facebook authorization code');
    }

    // Exchange short-lived token for long-lived token (60 days)
    const longLivedUrl = `https://graph.facebook.com/${META_OAUTH_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${data.access_token}`;
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
        logger.warn({ error: longLivedData.error }, 'Facebook long-lived token exchange failed, falling back to short-lived token');
    }

    return {
        accessToken: longLivedData.access_token || data.access_token,
        expiresIn: longLivedData.expires_in || data.expires_in || 5184000, // 60 days default
    };
}


/**
 * TikTok OAuth token exchange - API v2
 */
async function exchangeTikTokToken(
    code: string,
    redirectUri: string,
    clientKey: string,
    clientSecret: string
): Promise<TokenResponse> {
    const tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        }),
    });

    const data = await response.json();

    if (data.error && data.error !== 'ok') {
        logger.error({ error: data }, 'TikTok OAuth token exchange failed');
        throw new Error(data.error_description || 'Failed to exchange TikTok authorization code');
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 86400, // 24 hours default
        // TikTok refresh tokens last 365 days - use for health display
        refreshTokenExpiresIn: data.refresh_expires_in || 31536000,
    };
}

/**
 * Google (YouTube/Google Business) OAuth token exchange
 */
async function exchangeGoogleToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        }),
    });

    const data = await response.json();

    if (data.error) {
        logger.error({ error: data }, 'Google OAuth token exchange failed');
        throw new Error(data.error_description || 'Failed to exchange Google authorization code');
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600, // 1 hour default
        // Why: Google refresh tokens don't have a fixed expiry — they're valid
        // until revoked (production) or 7 days (testing). No refreshTokenExpiresIn
        // is set here so tokenExpiry correctly tracks the 1-hour access token.
    };
}

/**
 * Pinterest OAuth token exchange - API v5
 */
async function exchangePinterestToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    const tokenUrl = 'https://api.pinterest.com/v5/oauth/token';

    // Pinterest uses Basic Auth with client credentials
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
        }),
    });

    const data = await response.json();

    if (data.code || data.error) {
        logger.error({ error: data }, 'Pinterest OAuth token exchange failed');
        throw new Error(data.message || 'Failed to exchange Pinterest authorization code');
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 2592000, // 30 days default
        // Pinterest refresh tokens last 1 year
        refreshTokenExpiresIn: data.refresh_token_expires_in || 31536000,
    };
}

/**
 * LinkedIn OAuth token exchange
 */
async function exchangeLinkedInToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    const tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });

    const data = await response.json();

    if (data.error) {
        logger.error({ error: data }, 'LinkedIn OAuth token exchange failed');
        throw new Error(data.error_description || 'Failed to exchange LinkedIn authorization code');
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 5184000, // 60 days default
    };
}

/**
 * Threads OAuth token exchange - Threads API
 * Why: Threads has its own OAuth endpoints on graph.threads.net,
 * separate from Facebook/Instagram despite sharing the same Meta app.
 */
async function exchangeThreadsToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    // Step 1: Exchange code for short-lived access token
    const tokenUrl = 'https://graph.threads.net/oauth/access_token';

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code,
        }),
    });

    const data = await response.json();

    if (data.error_type || data.error_message || data.error) {
        logger.error({ error: data }, 'Threads OAuth token exchange failed');
        throw new Error(data.error_message || data.error?.message || 'Failed to exchange Threads authorization code');
    }

    // Step 2: Exchange short-lived token for long-lived token (60 days)
    const longLivedUrl = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${clientSecret}&access_token=${data.access_token}`;
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
        logger.warn({ error: longLivedData.error }, 'Failed to get long-lived Threads token, using short-lived');
        return {
            accessToken: data.access_token,
            expiresIn: 3600, // Short-lived tokens last 1 hour
        };
    }

    logger.info('Threads token exchanged for long-lived token');
    return {
        accessToken: longLivedData.access_token,
        expiresIn: longLivedData.expires_in || 5184000, // 60 days default
    };
}

/**
 * Refresh Threads long-lived token
 * Why: Threads tokens can be refreshed if not expired and at least 24 hours old.
 * Uses graph.threads.net endpoint with th_refresh_token grant type.
 */
async function refreshThreadsToken(accessToken: string): Promise<TokenResponse> {
    const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${accessToken}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
        logger.error({ error: data.error }, 'Threads token refresh failed');
        throw new Error(data.error.message || 'Failed to refresh Threads token');
    }

    logger.info('Threads token refreshed successfully');
    return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 5184000, // 60 days
    };
}
