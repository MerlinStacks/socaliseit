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
    /** True only when this call, or the lock holder it waited for, renewed the token. */
    refreshed?: boolean;
}

export interface EnsureValidTokenOptions {
    refreshThresholdMs?: number;
    forceRefresh?: boolean;
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
export async function ensureValidToken(
    accountId: string,
    options: EnsureValidTokenOptions = {}
): Promise<TokenResult> {
    try {
        const account = await db.socialAccount.findUnique({
            where: { id: accountId },
        });

        if (!account) {
            return { success: false, error: 'Account not found', needsReconnect: true };
        }

        if (!account.isActive) {
            return {
                success: false,
                error: 'Account is inactive. Please reconnect your account.',
                needsReconnect: true,
                refreshed: false,
            };
        }

        const platform = account.platform.toLowerCase() as Platform;

        // Meta Page tokens do not share the user-token expiry copied during OAuth.
        // Keep using the stored Page token until Meta rejects it. A forced refresh
        // means an API authentication failure was already observed, so reconnect.
        if ((platform === 'facebook' || platform === 'instagram') && account.accessToken) {
            if (!options.forceRefresh) {
                return { success: true, accessToken: decryptToken(account.accessToken), refreshed: false };
            }

            const error = 'This Meta account cannot be renewed automatically. Please reconnect your account.';
            await db.socialAccount.update({
                where: { id: accountId },
                data: { lastRefreshError: error },
            }).catch(() => { /* best effort */ });
            await markAccountForReconnection(accountId, error);
            return { success: false, error, needsReconnect: true, refreshed: false };
        }

        // Check if token needs refresh (expired or expiring within the caller's buffer)
        const now = new Date();
        const refreshThresholdMs = options.refreshThresholdMs ?? TOKEN_REFRESH_BUFFER_MS;
        const needsRefresh = options.forceRefresh || (account.tokenExpiry
            ? new Date(account.tokenExpiry).getTime() - now.getTime() < refreshThresholdMs
            : false);

        if (!needsRefresh && account.accessToken) {
            // Token is still valid — decrypt before returning
            return { success: true, accessToken: decryptToken(account.accessToken), refreshed: false };
        }

        // Threads refreshes with its current access token. Other strategies require
        // a separately stored refresh token.
        if (!account.refreshToken && !(platform === 'threads' && account.accessToken)) {
            logger.warn({ accountId, platform: account.platform }, 'No refresh token available');
            const error = 'No refresh token available. Please reconnect your account.';
            await db.socialAccount.update({
                where: { id: accountId },
                data: { lastRefreshError: error },
            }).catch(() => { /* best effort */ });
            await markAccountForReconnection(accountId, error);
            return {
                success: false,
                error,
                needsReconnect: true,
                refreshed: false,
            };
        }

        // Why (BUG-04): Acquire a per-account mutex so only one worker
        // refreshes at a time. Losers wait briefly and re-read from DB.
        interface MinimalRedisClient {
            set(key: string, value: string, ex: 'EX', time: number, nx: 'NX'): Promise<string | null>;
            get(key: string): Promise<string | null>;
            del(key: string): Promise<number>;
        }
        let redis: MinimalRedisClient | null = null;
        const lockKey = `token-refresh:${accountId}`;
        let lockAcquired = false;
        try {
            const { getRedisConnection } = await import('@/lib/bullmq/connection');
            redis = getRedisConnection();
            const lockResult = await redis.set(lockKey, '1', 'EX', 30, 'NX');
            lockAcquired = lockResult === 'OK';
        } catch (lockErr) {
            logger.error({ accountId, err: lockErr }, 'Token refresh mutex unavailable, blocking refresh to avoid token rotation race');
            return {
                success: false,
                error: 'Token refresh temporarily unavailable. Please retry shortly.',
                needsReconnect: false,
            };
        }

        if (!lockAcquired) {
            // Another worker is refreshing — poll until the lock is released
            // or the token is updated, rather than a single fixed wait.
            // Why (BUG-FIX): The previous 2-second single wait was insufficient
            // when platform APIs were slow. Callers would re-read the DB before
            // the lock-holder committed, see stale tokens, and either fail or
            // attempt their own refresh with an already-consumed refresh token.
            logger.info({ accountId }, 'Token refresh in progress by another worker, waiting');
            const originalExpiry = account.tokenExpiry?.getTime() ?? 0;
            const originalLastRefreshAt = account.lastRefreshAt?.getTime() ?? 0;
            const POLL_INTERVAL_MS = 500;
            const MAX_WAIT_MS = 15_000; // Wait up to 15 seconds (lock TTL is 30s)
            let waited = 0;

            while (waited < MAX_WAIT_MS) {
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                waited += POLL_INTERVAL_MS;

                const updated = await db.socialAccount.findUnique({ where: { id: accountId } });
                if (!updated?.accessToken) continue;

                // Only accept a currently valid token whose refresh metadata changed.
                const updatedExpiry = updated.tokenExpiry?.getTime() ?? 0;
                const updatedLastRefreshAt = updated.lastRefreshAt?.getTime() ?? 0;
                if (
                    updatedExpiry > Date.now() &&
                    (
                        updatedExpiry > originalExpiry
                        || updatedLastRefreshAt > originalLastRefreshAt
                        || updatedExpiry - Date.now() >= refreshThresholdMs
                    )
                ) {
                    return {
                        success: true,
                        accessToken: decryptToken(updated.accessToken),
                        refreshed: true,
                    };
                }

                // The refresh may have committed before our initial DB read but
                // still held the lock. Once released, trust a valid, error-free
                // result even when its metadata matches our baseline.
                const lockStillHeld = await redis.get(lockKey);
                if (!lockStillHeld) {
                    if (updatedExpiry > Date.now() && !updated.lastRefreshError) {
                        return {
                            success: true,
                            accessToken: decryptToken(updated.accessToken),
                            refreshed: true,
                        };
                    }
                    break;
                }
            }

            return {
                success: false,
                error: 'Token refresh by another worker did not produce a verified valid token',
                needsReconnect: false,
                refreshed: false,
            };
        }

        try {
            // Why: Prisma stores Platform as uppercase enum (e.g. YOUTUBE),
            // but refreshPlatformToken uses lowercase platform-config values.
            const refreshResult = await refreshPlatformToken(
                platform,
                account.refreshToken
                    ? decryptToken(account.refreshToken)
                    : decryptToken(account.accessToken!),
                account.accessToken ? decryptToken(account.accessToken) : undefined
            );

            if (!refreshResult.success) {
                // Track the failure reason for diagnostics
                await db.socialAccount.update({
                    where: { id: accountId },
                    data: { lastRefreshError: refreshResult.error || 'Token refresh failed' },
                }).catch(() => { /* best effort */ });
                if (refreshResult.needsReconnect) {
                    await markAccountForReconnection(accountId, refreshResult.error || 'Token refresh failed');
                }
                return { ...refreshResult, refreshed: false };
            }

            if (!refreshResult.accessToken || !refreshResult.expiry) {
                return {
                    success: false,
                    error: 'Token refresh returned incomplete credentials',
                    needsReconnect: false,
                    refreshed: false,
                };
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
            return {
                success: true,
                accessToken: refreshResult.accessToken,
                needsReconnect: false,
                refreshed: true,
            };
        } finally {
            // Release the mutex
            if (redis && lockAcquired) {
                try { await redis.del(lockKey); } catch { /* best effort */ }
            }
        }
    } catch (error) {
        logger.error({ err: error, accountId }, 'Failed to ensure valid token');
        return { success: false, error: 'Token validation failed', needsReconnect: false, refreshed: false };
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

    // Why (BUG-46): Previously called refreshPlatformToken directly, bypassing
    // the Redis mutex in ensureValidToken. For platforms that rotate refresh
    // tokens (Bluesky, TikTok, Pinterest), concurrent refreshes from this path
    // and the token-refresh-worker could invalidate each other's tokens.
    // Force refresh without mutating the persisted expiry before acquiring the lock.
    const refreshResult = await ensureValidToken(accountId, { forceRefresh: true });

    if (!refreshResult.success) {
        return {
            success: false,
            error: refreshResult.needsReconnect
                ? 'Your account connection has expired. Please reconnect.'
                : refreshResult.error || 'Token refresh failed. Please retry shortly.',
            needsReconnect: refreshResult.needsReconnect ?? false,
            refreshed: false,
        };
    }

    logger.info({ accountId }, 'Successfully refreshed token after 401 error');
    return { success: true, accessToken: refreshResult.accessToken, refreshed: refreshResult.refreshed };
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

/** Detect whether an error confirms that the credential itself is invalid. */
function isAuthenticationError(error: unknown): boolean {
    if (!error) return false;

    // Check error message for explicit auth failure indicators
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (
        message.includes('401') ||
        message.includes('unauthorized') ||
        message.includes('authentication failed') ||
        message.includes('invalid token') ||
        message.includes('token expired') ||
        message.includes('token has been revoked') ||
        message.includes('session expired')
    ) {
        return true;
    }

    // Check for HTTP status code property
    const errorWithStatus = error as { status?: number; statusCode?: number; response?: { status?: number } };
    const status = errorWithStatus.status || errorWithStatus.statusCode || errorWithStatus.response?.status;
    // A generic 403 is usually a permission/capability failure, not proof that
    // the credential is invalid. Deactivating on it can disconnect valid accounts.
    if (status === 401) {
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
    needsReconnect?: boolean;
}

/**
 * Refreshes access token for a specific platform.
 *
 * The optional accessToken is used by platforms such as Threads that renew
 * with their current long-lived access token rather than a refresh token.
 */
async function refreshPlatformToken(
    platform: Platform,
    refreshToken: string,
    accessToken?: string
): Promise<RefreshResult> {
    if (platform === 'facebook' || platform === 'instagram') {
        return {
            success: false,
            error: 'Stored Meta Page tokens cannot be renewed automatically. Please reconnect your account.',
            needsReconnect: true,
        };
    }

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

        // Threads renews its long-lived token using the current access token.
        const tokenToRefresh = platform === 'threads'
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
        return {
            success: false,
            error: message,
            needsReconnect: isPermanentRefreshFailure(message),
        };
    }
}

function isPermanentRefreshFailure(message: string): boolean {
    const normalized = message.toLowerCase();
    return [
        'invalid_grant',
        'invalid refresh token',
        'refresh token expired',
        'refresh token has expired',
        'refresh token revoked',
        'token has been revoked',
        'authorization has been revoked',
        'invalidtoken',
        'expiredtoken',
        'http 401',
        'unauthorized',
    ].some(pattern => normalized.includes(pattern));
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
                needsReconnect: isPermanentRefreshFailure(`${data.error} ${data.message || ''}`),
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
        return {
            success: false,
            error: 'Failed to refresh Bluesky session',
            needsReconnect: false,
        };
    }
}
