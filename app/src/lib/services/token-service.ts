/**
 * Token Refresh Service
 * Centralized OAuth token management with proactive refresh and error handling.
 *
 * Why: Prevents 401 errors by proactively refreshing tokens before expiry,
 * and gracefully handles revoked/invalid tokens by marking accounts for reconnection.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Platform } from '@/lib/platform-config';
import { encryptToken, decryptToken } from '@/lib/token-encryption';

/** Buffer time before expiry to trigger proactive refresh (5 minutes) */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Result of a token validation/refresh operation.
 */
export interface TokenResult {
    success: boolean;
    accessToken?: string;
    error?: string;
    needsReconnect?: boolean;
}

/**
 * Ensures a valid access token for the given social account.
 * Proactively refreshes if token is expired or expiring soon.
 *
 * @param accountId - The SocialAccount ID
 * @returns TokenResult with valid accessToken or error details
 */
export async function ensureValidToken(accountId: string): Promise<TokenResult> {
    try {
        const account = await db.socialAccount.findUnique({
            where: { id: accountId },
        });

        if (!account) {
            return { success: false, error: 'Account not found', needsReconnect: true };
        }

        // Check if token needs refresh (expired or expiring within buffer)
        const now = new Date();
        const needsRefresh = account.tokenExpiry
            ? new Date(account.tokenExpiry).getTime() - now.getTime() < TOKEN_REFRESH_BUFFER_MS
            : false;

        if (!needsRefresh && account.accessToken) {
            // Token is still valid — decrypt before returning
            return { success: true, accessToken: decryptToken(account.accessToken) };
        }

        // Attempt to refresh the token
        if (!account.refreshToken) {
            logger.warn({ accountId, platform: account.platform }, 'No refresh token available');
            return {
                success: false,
                error: 'No refresh token available. Please reconnect your account.',
                needsReconnect: true,
            };
        }

        const refreshResult = await refreshPlatformToken(
            account.platform as Platform,
            decryptToken(account.refreshToken)
        );

        if (!refreshResult.success) {
            // Mark account as needing reconnection
            await markAccountForReconnection(accountId, refreshResult.error || 'Token refresh failed');
            return refreshResult;
        }

        // Update the database with new tokens
        await db.socialAccount.update({
            where: { id: accountId },
            data: {
                accessToken: encryptToken(refreshResult.accessToken!),
                tokenExpiry: refreshResult.expiry,
                ...(refreshResult.refreshToken && { refreshToken: encryptToken(refreshResult.refreshToken) }),
            },
        });

        logger.info({ accountId, platform: account.platform }, 'Token refreshed successfully');
        return { success: true, accessToken: refreshResult.accessToken };
    } catch (error) {
        logger.error({ err: error, accountId }, 'Failed to ensure valid token');
        return { success: false, error: 'Token validation failed' };
    }
}

/**
 * Handles a 401 error from a platform API.
 * Attempts to refresh the token and retry, or marks for reconnection.
 *
 * @param accountId - The SocialAccount ID
 * @param originalError - The original error message
 * @returns TokenResult indicating if token was refreshed or account needs reconnection
 */
export async function handle401Error(
    accountId: string,
    originalError?: string
): Promise<TokenResult> {
    logger.warn({ accountId, error: originalError }, 'Handling 401 authentication error');

    const account = await db.socialAccount.findUnique({
        where: { id: accountId },
    });

    if (!account) {
        return { success: false, error: 'Account not found', needsReconnect: true };
    }

    if (!account.refreshToken) {
        await markAccountForReconnection(accountId, 'Authentication failed - no refresh token');
        return {
            success: false,
            error: 'Authentication failed. Please reconnect your account.',
            needsReconnect: true,
        };
    }

    // Attempt emergency token refresh
    const refreshResult = await refreshPlatformToken(
        account.platform as Platform,
        decryptToken(account.refreshToken)
    );

    if (!refreshResult.success) {
        await markAccountForReconnection(accountId, refreshResult.error || 'Token refresh failed after 401');
        return {
            success: false,
            error: 'Your account connection has expired. Please reconnect.',
            needsReconnect: true,
        };
    }

    await db.socialAccount.update({
        where: { id: accountId },
        data: {
            accessToken: encryptToken(refreshResult.accessToken!),
            tokenExpiry: refreshResult.expiry,
            ...(refreshResult.refreshToken && { refreshToken: encryptToken(refreshResult.refreshToken) }),
        },
    });

    logger.info({ accountId }, 'Successfully refreshed token after 401 error');
    return { success: true, accessToken: refreshResult.accessToken };
}

/**
 * Marks an account as needing reconnection.
 * Sets isActive to false and logs the reason.
 */
async function markAccountForReconnection(accountId: string, reason: string): Promise<void> {
    try {
        await db.socialAccount.update({
            where: { id: accountId },
            data: { isActive: false },
        });
        logger.warn({ accountId, reason }, 'Account marked for reconnection');
    } catch (error) {
        logger.error({ err: error, accountId }, 'Failed to mark account for reconnection');
    }
}

/**
 * Execute an operation with automatic token refresh on 401 errors.
 * If the operation fails with a 401/authentication error, refreshes the token
 * and retries once. If retry also fails, the error is thrown.
 *
 * Why: OAuth tokens can expire mid-operation (e.g., during a multi-phase upload).
 * This wrapper provides transparent recovery without manual intervention.
 *
 * @param accountId - The SocialAccount ID
 * @param operation - Async function that receives the current access token
 * @returns The result of the operation
 */
export async function withTokenRefreshRetry<T>(
    accountId: string,
    operation: (accessToken: string) => Promise<T>
): Promise<T> {
    // Get initial valid token
    const initialToken = await ensureValidToken(accountId);
    if (!initialToken.success || !initialToken.accessToken) {
        throw new Error(initialToken.error || 'Failed to get valid token');
    }

    try {
        // Attempt the operation
        return await operation(initialToken.accessToken);
    } catch (error) {
        // Check if this is a 401/authentication error
        const is401 = isAuthenticationError(error);

        if (!is401) {
            throw error; // Not an auth error, don't retry
        }

        logger.info({ accountId }, 'Operation failed with 401, attempting token refresh and retry');

        // Attempt to handle the 401 and get a new token
        const refreshResult = await handle401Error(accountId, error instanceof Error ? error.message : 'Unknown 401 error');

        if (!refreshResult.success || !refreshResult.accessToken) {
            throw new Error(refreshResult.error || 'Token refresh failed after 401');
        }

        // Retry the operation with the new token
        try {
            return await operation(refreshResult.accessToken);
        } catch (retryError) {
            logger.error({ accountId, err: retryError }, 'Operation failed again after token refresh');
            throw retryError;
        }
    }
}

/**
 * Detect if an error is an authentication/authorization error (401/403).
 */
function isAuthenticationError(error: unknown): boolean {
    if (!error) return false;

    // Check error message
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (
        message.includes('401') ||
        message.includes('unauthorized') ||
        message.includes('authentication') ||
        message.includes('invalid token') ||
        message.includes('token expired') ||
        message.includes('access_token')
    ) {
        return true;
    }

    // Check for HTTP status code property
    const errorWithStatus = error as { status?: number; statusCode?: number; response?: { status?: number } };
    const status = errorWithStatus.status || errorWithStatus.statusCode || errorWithStatus.response?.status;
    if (status === 401 || status === 403) {
        return true;
    }

    return false;
}

// =============================================================================
// Platform-specific token refresh implementations
// =============================================================================

interface RefreshResult {
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiry?: Date;
    error?: string;
}

/**
 * Refreshes access token for a specific platform.
 */
async function refreshPlatformToken(
    platform: Platform,
    refreshToken: string
): Promise<RefreshResult> {
    switch (platform) {
        case 'youtube':
        case 'google_business':
            return refreshGoogleToken(refreshToken);
        case 'tiktok':
            return refreshTikTokToken(refreshToken);
        case 'pinterest':
            return refreshPinterestToken(refreshToken);
        case 'instagram':
        case 'facebook':
            return refreshFacebookToken(refreshToken);
        case 'linkedin':
            return refreshLinkedInToken(refreshToken);
        case 'bluesky':
            return refreshBlueskyToken(refreshToken);
        default:
            return { success: false, error: `Token refresh not implemented for ${platform}` };
    }
}

/**
 * Refresh Bluesky AT Protocol session.
 * Why: Bluesky access tokens (accessJwt) expire after 2 hours,
 * but the refresh token (refreshJwt) lasts ~90 days and can be used
 * to get a new session via com.atproto.server.refreshSession.
 */
async function refreshBlueskyToken(refreshToken: string): Promise<RefreshResult> {
    try {
        const response = await fetch('https://bsky.social/xrpc/com.atproto.server.refreshSession', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${refreshToken}`,
            },
        });

        const data = await response.json();

        if (data.error) {
            logger.error({ error: data }, 'Bluesky session refresh failed');
            return {
                success: false,
                error: data.message || `Bluesky auth error: ${data.error}`,
            };
        }

        return {
            success: true,
            accessToken: data.accessJwt,
            refreshToken: data.refreshJwt,
            expiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days (refresh token lifetime)
        };
    } catch (error) {
        logger.error({ err: error }, 'Bluesky session refresh request failed');
        return { success: false, error: 'Failed to refresh Bluesky session' };
    }
}

/**
 * Refresh Google OAuth token (YouTube, Google Business).
 */
async function refreshGoogleToken(refreshToken: string): Promise<RefreshResult> {
    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // Fall back to database-stored global credentials
    if (!clientId || !clientSecret) {
        try {
            const { getCredentialsForPlatform } = await import('@/lib/platforms/credentials');
            const creds = await getCredentialsForPlatform('google_business');
            if (creds) {
                clientId = creds.clientId;
                clientSecret = creds.clientSecret;
            }
        } catch (e) {
            logger.warn({ err: e }, 'Failed to load Google credentials from database');
        }
    }

    if (!clientId || !clientSecret) {
        return { success: false, error: 'Google OAuth credentials not configured' };
    }

    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const data = await response.json();

        if (data.error) {
            logger.error({ error: data }, 'Google token refresh failed');
            return {
                success: false,
                error: data.error_description || `Google auth error: ${data.error}`,
            };
        }

        return {
            success: true,
            accessToken: data.access_token,
            expiry: new Date(Date.now() + (data.expires_in || 3600) * 1000),
        };
    } catch (error) {
        logger.error({ err: error }, 'Google token refresh request failed');
        return { success: false, error: 'Failed to refresh Google token' };
    }
}

/**
 * Refresh TikTok OAuth token.
 */
async function refreshTikTokToken(refreshToken: string): Promise<RefreshResult> {
    const clientKey = process.env.TIKTOK_CLIENT_ID || process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

    if (!clientKey || !clientSecret) {
        return { success: false, error: 'TikTok OAuth credentials not configured' };
    }

    try {
        const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const data = await response.json();

        if (data.error && data.error !== 'ok') {
            logger.error({ error: data }, 'TikTok token refresh failed');
            return {
                success: false,
                error: data.error_description || 'TikTok refresh failed',
            };
        }

        return {
            success: true,
            accessToken: data.access_token,
            refreshToken: data.refresh_token, // TikTok issues new refresh tokens
            expiry: new Date(Date.now() + (data.expires_in || 86400) * 1000),
        };
    } catch (error) {
        logger.error({ err: error }, 'TikTok token refresh request failed');
        return { success: false, error: 'Failed to refresh TikTok token' };
    }
}

/**
 * Refresh Pinterest OAuth token.
 */
async function refreshPinterestToken(refreshToken: string): Promise<RefreshResult> {
    let clientId = process.env.PINTEREST_CLIENT_ID;
    let clientSecret = process.env.PINTEREST_CLIENT_SECRET;

    // Fall back to database-stored global credentials
    if (!clientId || !clientSecret) {
        try {
            const { getCredentialsForPlatform } = await import('@/lib/platforms/credentials');
            const creds = await getCredentialsForPlatform('pinterest');
            if (creds) {
                clientId = creds.clientId;
                clientSecret = creds.clientSecret;
            }
        } catch (e) {
            logger.warn({ err: e }, 'Failed to load Pinterest credentials from database');
        }
    }

    if (!clientId || !clientSecret) {
        return { success: false, error: 'Pinterest OAuth credentials not configured' };
    }

    try {
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });

        const data = await response.json();

        if (data.code || data.error) {
            logger.error({ error: data }, 'Pinterest token refresh failed');
            return {
                success: false,
                error: data.message || 'Pinterest refresh failed',
            };
        }

        return {
            success: true,
            accessToken: data.access_token,
            refreshToken: data.refresh_token, // Pinterest may issue new refresh tokens
            expiry: new Date(Date.now() + (data.expires_in || 2592000) * 1000),
        };
    } catch (error) {
        logger.error({ err: error }, 'Pinterest token refresh request failed');
        return { success: false, error: 'Failed to refresh Pinterest token' };
    }
}

/**
 * Refresh Facebook/Instagram long-lived token.
 * Note: Facebook/Instagram tokens can be refreshed before expiry.
 */
async function refreshFacebookToken(accessToken: string): Promise<RefreshResult> {
    const clientId = process.env.FACEBOOK_CLIENT_ID || process.env.META_APP_ID;
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET || process.env.META_APP_SECRET;

    if (!clientId || !clientSecret) {
        return { success: false, error: 'Facebook/Meta OAuth credentials not configured' };
    }

    try {
        // Facebook uses access_token (not refresh_token) to get a new long-lived token
        const url = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            logger.error({ error: data.error }, 'Facebook token refresh failed');
            return {
                success: false,
                error: data.error.message || 'Facebook refresh failed',
            };
        }

        return {
            success: true,
            accessToken: data.access_token,
            expiry: new Date(Date.now() + (data.expires_in || 5184000) * 1000), // 60 days
        };
    } catch (error) {
        logger.error({ err: error }, 'Facebook token refresh request failed');
        return { success: false, error: 'Failed to refresh Facebook token' };
    }
}

/**
 * Refresh LinkedIn OAuth token.
 */
async function refreshLinkedInToken(refreshToken: string): Promise<RefreshResult> {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return { success: false, error: 'LinkedIn OAuth credentials not configured' };
    }

    try {
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

        const data = await response.json();

        if (data.error) {
            logger.error({ error: data }, 'LinkedIn token refresh failed');
            return {
                success: false,
                error: data.error_description || 'LinkedIn refresh failed',
            };
        }

        return {
            success: true,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiry: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
        };
    } catch (error) {
        logger.error({ err: error }, 'LinkedIn token refresh request failed');
        return { success: false, error: 'Failed to refresh LinkedIn token' };
    }
}
