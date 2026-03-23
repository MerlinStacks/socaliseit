/**
 * Token Refresh Sweep Worker
 * Proactively refreshes OAuth tokens before they expire.
 *
 * Why: Without this, tokens only refresh at publish time or when users
 * visit the health page. If a token expires overnight (e.g., Google's
 * 1-hour tokens, Bluesky's 2-hour JWTs), the next scheduled publish
 * fails with a "reconnect" error. This worker runs every 30 minutes
 * and refreshes any token within 15 minutes of expiry.
 */

import { Worker, Job } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureValidToken } from '@/lib/services/token-service';
import { refreshAccountAvatar } from '@/lib/services/avatar-refresh';

/**
 * Why: 15 minutes is wider than token-service's 5-minute buffer.
 * The sweep runs every 30 min so the wider window prevents tokens
 * from slipping through the gap between sweeps.
 */
const PROACTIVE_REFRESH_BUFFER_MS = 15 * 60 * 1000;


interface TokenRefreshSweepJob {
    type: 'sweep';
}

/**
 * Processes a single token refresh sweep across all active accounts.
 */
export async function processTokenRefreshSweep(job: Job<TokenRefreshSweepJob>): Promise<void> {
    const sweepStart = Date.now();
    logger.info('Starting proactive token refresh sweep');

    const now = new Date();
    const bufferThreshold = new Date(now.getTime() + PROACTIVE_REFRESH_BUFFER_MS);

    // Why: Only fetch active, non-MANUAL accounts that have a refresh token.
    // MANUAL accounts don't use OAuth. Accounts without refresh tokens
    // can't be refreshed (they need user reconnection).
    // Why (BUG-30): Previously the OR clause included { tokenExpiry: null } for
    // "legacy accounts", but the loop immediately skipped those — wasting DB bandwidth.
    // Now the query itself excludes null-expiry accounts.
    const accounts = await db.socialAccount.findMany({
        where: {
            isActive: true,
            platform: { not: 'MANUAL' },
            refreshToken: { not: null },
            tokenExpiry: { not: null, lte: bufferThreshold },
        },
        select: {
            id: true,
            platform: true,
            name: true,
            organizationId: true,
            tokenExpiry: true,
            lastRefreshError: true,
        },
    });

    if (accounts.length === 0) {
        logger.info('Token refresh sweep: no accounts need refresh');
        return;
    }

    logger.info({ count: accounts.length }, 'Token refresh sweep: accounts need refresh');

    let refreshed = 0;
    let failed = 0;

    // Why: Process accounts in concurrent batches of 3 instead of sequentially.
    // For deployments with 20+ accounts, this cuts sweep time significantly.
    const BATCH_SIZE = 3;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
            batch.map(async (account) => {
                const result = await ensureValidToken(account.id);

                if (result.success) {
                    await db.socialAccount.update({
                        where: { id: account.id },
                        data: { lastRefreshAt: new Date(), lastRefreshError: null },
                    });

                    // Why: Meta-family CDN avatar URLs expire alongside tokens.
                    const META_PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'THREADS'];
                    if (META_PLATFORMS.includes(account.platform)) {
                        await refreshAccountAvatar(account.id).catch((err) => {
                            logger.warn({ err, accountId: account.id }, 'Avatar refresh failed (non-fatal)');
                        });
                    }
                    return { account, success: true as const, result };
                } else {
                    const errorMsg = result.error || 'Unknown refresh error';
                    await db.socialAccount.update({
                        where: { id: account.id },
                        data: { lastRefreshError: errorMsg },
                    });
                    if (result.needsReconnect) {
                        await createReconnectNotification(account);
                    }
                    return { account, success: false as const, error: errorMsg };
                }
            })
        );

        for (const [idx, settled] of batchResults.entries()) {
            if (settled.status === 'fulfilled') {
                if (settled.value.success) {
                    refreshed++;
                } else {
                    failed++;
                    logger.warn(
                        { accountId: settled.value.account.id, platform: settled.value.account.platform, error: settled.value.error },
                        'Token refresh sweep: refresh failed'
                    );
                }
            } else {
                failed++;
                const account = batch[idx];
                const errorMsg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
                logger.error(
                    { accountId: account.id, platform: account.platform, err: settled.reason },
                    'Token refresh sweep: unexpected error'
                );
                await db.socialAccount.update({
                    where: { id: account.id },
                    data: { lastRefreshError: errorMsg },
                }).catch(() => { /* best effort */ });
            }
        }
    }

    const durationMs = Date.now() - sweepStart;
    logger.info(
        { refreshed, failed, total: accounts.length, durationMs },
        'Token refresh sweep completed'
    );
}

/**
 * Creates an in-app notification telling the user to reconnect a failed account.
 * De-duplicates by checking for an existing unread notification for the same account.
 */
async function createReconnectNotification(account: {
    id: string;
    platform: string;
    name: string;
    organizationId: string;
}): Promise<void> {
    try {
        // Why: Avoid spamming — only create one notification per account
        // until the user reads or resolves it.
        const existing = await db.notification.findFirst({
            where: {
                organizationId: account.organizationId,
                type: 'warning',
                isRead: false,
                link: `/settings/accounts`,
                title: { contains: account.name },
            },
        });

        if (existing) return;

        await db.notification.create({
            data: {
                organizationId: account.organizationId,
                title: `${account.name} needs reconnection`,
                message: `Your ${account.platform.toLowerCase()} account "${account.name}" has an expired token that could not be refreshed automatically. Please reconnect it to avoid publishing failures.`,
                type: 'warning',
                link: '/settings/accounts',
            },
        });

        logger.info(
            { accountId: account.id, platform: account.platform },
            'Created reconnection notification for user'
        );
    } catch (err) {
        logger.warn({ err, accountId: account.id }, 'Failed to create reconnect notification');
    }
}

/**
 * Creates and starts the token refresh sweep worker.
 */
export function createTokenRefreshWorker(): Worker<TokenRefreshSweepJob> {
    const worker = new Worker<TokenRefreshSweepJob>(
        'token-refresh',
        processTokenRefreshSweep,
        {
            connection: getBullMQConnection(),
            concurrency: 1, // Why: Only one sweep at a time to avoid duplicate refreshes
        }
    );

    worker.on('completed', () => {
        logger.info('Token refresh sweep job completed');
    });

    worker.on('failed', (job, err) => {
        logger.error({ err }, 'Token refresh sweep job failed');
    });

    return worker;
}
