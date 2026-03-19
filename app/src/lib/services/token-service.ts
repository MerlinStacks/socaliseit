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
 * Why (BUG-04): Uses a Redis mutex to prevent concurrent refreshes from
 * racing. Platforms that rotate refresh tokens (TikTok, Pinterest, LinkedIn)
 * invalidate the old refresh token on use — a second concurrent refresh
 * with the stale token would fail or clobber the first result.
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

        // Why (BUG-04): Acquire a per-account mutex so only one worker
        // refreshes at a time. Losers wait briefly and re-read from DB.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import; Redis type not in static scope
        let redis: any = null;
        const lockKey = `token-refresh:${accountId}`;
        let lockAcquired = false;
        try {
            const { getRedisConnection } = await import('@/lib/bullmq/connection');
            redis = getRedisConnection();
            const lockResult = await redis.set(lockKey, '1', 'EX', 30, 'NX');
            lockAcquired = lockResult === 'OK';
        } catch (lockErr) {
            // Redis unavailable — proceed without lock (fail-open)
            logger.warn({ accountId, err: lockErr }, 'Token refresh mutex unavailable, proceeding without lock');
            lockAcquired = true;
        }

        if (!lockAcquired) {
            // Another worker is refreshing — wait, then re-read from DB
            logger.info({ accountId }, 'Token refresh in progress by another worker, waiting');
            await new Promise(r => setTimeout(r, 2000));
            // Re-read the (hopefully refreshed) token from DB
            const updated = await db.socialAccount.findUnique({ where: { id: accountId } });
            if (updated?.accessToken) {
                return { success: true, accessToken: decryptToken(updated.accessToken) };
            }
            return { success: false, error: 'Token refresh by another worker may have failed' };
        }

        try {
            // Why: Prisma stores Platform as uppercase enum (e.g. YOUTUBE),
            // but refreshPlatformToken switch uses lowercase platform-config values.
            // Why: Facebook/Instagram use the current access token (not refresh token)
            // for token exchange via fb_exchange_token.
            const refreshResult = await refreshPlatformToken(
                account.platform.toLowerCase() as Platform,
                decryptToken(account.refreshToken),
                account.accessToken ? decryptToken(account.accessToken) : undefined
            );

            if (!refreshResult.success) {
                // Track the failure reason for diagnostics
                await db.socialAccount.update({
                    where: { id: accountId },
                    data: { lastRefreshError: refreshResult.error || 'Token refresh failed' },
                }).catch(() => { /* best effort */ });
                // Mark account as needing reconnection
                await markAccountForReconnection(accountId, refreshResult.error || 'Token refresh failed');
                return refreshResult;
            }

            // Update the database with new tokens and refresh observability fields
            await db.socialAccount.update({
                where: { id: accountId },
                data: {
                    accessToken: encryptToken(refreshResult.accessToken!),
                    tokenExpiry: refreshResult.expiry,
                    ...(refreshResult.refreshToken && { refreshToken: encryptToken(refreshResult.refreshToken) }),
                    lastRefreshAt: new Date(),
                    lastRefreshError: null,
                },
            });

            logger.info({ accountId, platform: account.platform }, 'Token refreshed successfully');
            return { success: true, accessToken: refreshResult.accessToken };
        } finally {
            // Release the mutex
            if (redis && lockAcquired) {
                try { await redis.del(lockKey); } catch { /* best effort */ }
            }
        }
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

    // Why (BUG-46): Previously called refreshPlatformToken directly, bypassing
    // the Redis mutex in ensureValidToken. For platforms that rotate refresh
    // tokens (Bluesky, TikTok, Pinterest), concurrent refreshes from this path
    // and the token-refresh-worker could invalidate each other's tokens.
    // Invalidate the expiry so ensureValidToken treats it as needing refresh,
    // then delegate to ensureValidToken which already has mutex protection.
    await db.socialAccount.update({
        where: { id: accountId },
        data: { tokenExpiry: new Date(0) }, // Force ensureValidToken to refresh
    }).catch(() => { /* best effort */ });

    const refreshResult = await ensureValidToken(accountId);

    if (!refreshResult.success) {
        await markAccountForReconnection(accountId, refreshResult.error || 'Token refresh failed after 401');
        return {
            success: false,
            error: 'Your account connection has expired. Please reconnect.',
            needsReconnect: true,
        };
    }

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
// Platform-specific token refresh
// Why: Delegates to oauth.ts for standard OAuth platforms to avoid duplication.
// Bluesky uses AT Protocol session auth (not OAuth) so lives here.
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
 *
 * Why: Facebook/Instagram use fb_exchange_token which requires the current
 * access token, not the refresh token. The optional accessToken param
 * is passed through for those platforms.
 */
async function refreshPlatformToken(
    platform: Platform,
    refreshToken: string,
    accessToken?: string
): Promise<RefreshResult> {
    // Bluesky uses AT Protocol, not OAuth — handle inline
    if (platform === 'bluesky') {
        return refreshBlueskyToken(refreshToken);
    }

    // For all standard OAuth platforms, delegate to oauth.ts
    try {
        const { refreshAccessToken } = await import('@/lib/platforms/oauth');
        const { getCredentialsForPlatform } = await import('@/lib/platforms/credentials');

        // Load credentials: DB-stored per-org creds, with env-var fallback
        let credentials: { clientId: string; clientSecret: string } | undefined;
        try {
            const creds = await getCredentialsForPlatform(platform);
            if (creds) credentials = creds;
        } catch (e) {
            logger.warn({ err: e, platform }, 'Failed to load credentials from database');
        }

        // Why: Facebook/Instagram use the current access token (not refresh token)
        // for fb_exchange_token. oauth.ts's refreshAccessToken handles this per-platform.
        const tokenToRefresh = (platform === 'facebook' || platform === 'instagram')
            ? (accessToken || refreshToken)
            : refreshToken;

        const result = await refreshAccessToken(platform, tokenToRefresh, credentials);

        return {
            success: true,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiry: new Date(Date.now() + (result.expiresIn || 3600) * 1000),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, platform }, 'Platform token refresh failed');
        return { success: false, error: message };
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
            // Why: accessJwt expires after 2 hours, not 90 days.
            // The previous value (90 days) was the refresh token lifetime,
            // which prevented proactive access token refresh.
            expiry: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
        };
    } catch (error) {
        logger.error({ err: error }, 'Bluesky session refresh request failed');
        return { success: false, error: 'Failed to refresh Bluesky session' };
    }
}

