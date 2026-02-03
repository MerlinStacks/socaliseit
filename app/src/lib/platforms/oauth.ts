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

/**
 * Token response from OAuth exchange or refresh.
 */
export interface TokenResponse {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
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

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: config.scopes.join(' '),
        state,
    });

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
            return exchangeMetaToken(code, redirectUri, clientId, clientSecret);
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
 */
export async function refreshAccessToken(
    platform: Platform,
    refreshToken: string
): Promise<TokenResponse> {
    // In production, make actual API call
    return {
        accessToken: `${platform}_access_${Date.now()}`,
        refreshToken: `${platform}_refresh_${Date.now()}`,
        expiresIn: 3600 * 24 * 60,
    };
}

// =============================================================================
// Platform-specific token exchange implementations
// =============================================================================

/**
 * Meta (Facebook/Instagram) OAuth token exchange - Graph API v24.0
 */
async function exchangeMetaToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
): Promise<TokenResponse> {
    const tokenUrl = 'https://graph.facebook.com/v24.0/oauth/access_token';

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
        logger.error({ error: data.error }, 'Meta OAuth token exchange failed');
        throw new Error(data.error.message || 'Failed to exchange Meta authorization code');
    }

    // Exchange short-lived token for long-lived token (60 days)
    const longLivedUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${data.access_token}`;
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

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
