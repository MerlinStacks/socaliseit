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
                isActive: true,
                updatedAt: true,
            },
        });

        const now = new Date();
        const healthResults: AccountHealth[] = accounts.map((account) => {
            let status: AccountHealthStatus = 'healthy';
            let expiresIn: number | null = null;
            let message: string | undefined;

            if (!account.isActive) {
                status = 'error';
                message = 'Account is deactivated';
            } else if (account.tokenExpiry) {
                const expiryDate = new Date(account.tokenExpiry);
                const diffMs = expiryDate.getTime() - now.getTime();
                expiresIn = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                if (diffMs <= 0) {
                    status = 'expired';
                    message = 'Token has expired. Please reconnect.';
                } else if (
                    isTokenExpiringSoon(
                        { tokenExpiresAt: expiryDate } as Parameters<typeof isTokenExpiringSoon>[0],
                        7
                    )
                ) {
                    status = 'expiring';
                    message = `Token expires in ${expiresIn} day${expiresIn === 1 ? '' : 's'}`;
                }
            }

            return {
                id: account.id,
                platform: account.platform.toLowerCase(),
                name: account.name,
                status,
                expiresIn,
                lastChecked: now.toISOString(),
                message,
            };
        });

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
