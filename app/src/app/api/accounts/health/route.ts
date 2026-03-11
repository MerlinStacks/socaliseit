/**
 * Account Health API
 * Checks token validity and connection health for all workspace accounts.
 *
 * Why: Surface expiring tokens and connection issues before they cause publishing failures.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { isTokenExpiringSoon } from '@/lib/platforms';
import { ensureValidToken } from '@/lib/services/token-service';
import { logger } from '@/lib/logger';

export type AccountHealthStatus = 'healthy' | 'expiring' | 'expired' | 'error';

export interface AccountHealth {
    id: string;
    platform: string;
    name: string;
    status: AccountHealthStatus;
    expiresIn: number | null; // days until expiry, null if no expiry
    lastChecked: string;
    message?: string;
}

/**
 * GET /api/accounts/health
 * Returns health status for all connected accounts in the organization.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accounts = await db.socialAccount.findMany({
            where: { organizationId: session.user.currentOrganizationId },
            select: {
                id: true,
                platform: true,
                name: true,
                tokenExpiry: true,
                refreshToken: true,
                isActive: true,
                updatedAt: true,
                lastRefreshError: true,
            },
        });

        const now = new Date();

        // Why: Build health results with proactive refresh for accounts that have
        // short-lived access tokens (e.g. Google = 1hr) but valid refresh tokens.
        const healthResults: AccountHealth[] = [];

        for (const account of accounts) {
            let status: AccountHealthStatus = 'healthy';
            let expiresIn: number | null = null;
            let message: string | undefined;
            let currentExpiry = account.tokenExpiry;

            // Why: Accounts with refresh tokens are auto-refreshed by the background
            // token-refresh-worker. Short-lived access token expiry (TikTok=24h,
            // YouTube=1h) is expected and doesn't indicate a user-facing problem.
            const isAutoRefreshable = !!account.refreshToken;

            if (!account.isActive) {
                status = 'error';
                message = 'Account is deactivated';
            } else if (isAutoRefreshable && account.lastRefreshError) {
                // Why: Has a refresh token but auto-refresh is failing — warn the user
                status = 'expiring';
                message = 'Auto-refresh failing. Please reconnect if issues persist.';
            } else if (currentExpiry) {
                const expiryDate = new Date(currentExpiry);
                const diffMs = expiryDate.getTime() - now.getTime();

                // If the stored token appears expired/expiring and a refresh token exists,
                // attempt proactive refresh before declaring the account unhealthy.
                const isExpiredOrExpiring = diffMs <= 0 || isTokenExpiringSoon(
                    { tokenExpiresAt: expiryDate } as Parameters<typeof isTokenExpiringSoon>[0],
                    7
                );

                if (isExpiredOrExpiring && account.refreshToken) {
                    const refreshResult = await ensureValidToken(account.id);
                    if (refreshResult.success) {
                        // Re-read updated expiry after successful refresh
                        const updated = await db.socialAccount.findUnique({
                            where: { id: account.id },
                            select: { tokenExpiry: true },
                        });
                        currentExpiry = updated?.tokenExpiry ?? currentExpiry;
                    }
                }

                // Re-evaluate with potentially updated expiry
                const finalExpiry = new Date(currentExpiry);
                const finalDiffMs = finalExpiry.getTime() - now.getTime();
                expiresIn = Math.ceil(finalDiffMs / (1000 * 60 * 60 * 24));

                if (finalDiffMs <= 0) {
                    // Why: Only mark expired if not auto-refreshable. Platforms like
                    // TikTok/YouTube have short access tokens that normally expire,
                    // but the background worker refreshes them automatically.
                    if (!isAutoRefreshable) {
                        status = 'expired';
                        message = 'Token has expired. Please reconnect.';
                    }
                } else if (
                    isTokenExpiringSoon(
                        { tokenExpiresAt: finalExpiry } as Parameters<typeof isTokenExpiringSoon>[0],
                        7
                    )
                ) {
                    // Why: Only surface the 'expiring' warning for accounts without
                    // a refresh token. Auto-refreshable accounts handle this silently.
                    if (!isAutoRefreshable) {
                        status = 'expiring';
                        message = `Token expires in ${expiresIn} day${expiresIn === 1 ? '' : 's'}`;
                    }
                }
            }

            healthResults.push({
                id: account.id,
                platform: account.platform.toLowerCase(),
                name: account.name,
                status,
                expiresIn,
                lastChecked: now.toISOString(),
                message,
            });
        }

        // Summary stats for quick UI consumption
        const summary = {
            total: healthResults.length,
            healthy: healthResults.filter((a) => a.status === 'healthy').length,
            expiring: healthResults.filter((a) => a.status === 'expiring').length,
            expired: healthResults.filter((a) => a.status === 'expired').length,
            error: healthResults.filter((a) => a.status === 'error').length,
        };

        return NextResponse.json({ accounts: healthResults, summary });
    } catch (error) {
        logger.error({ error }, 'Failed to check account health');
        return NextResponse.json({ error: 'Failed to check account health' }, { status: 500 });
    }
}
