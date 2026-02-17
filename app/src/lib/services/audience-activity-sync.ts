/**
 * Audience Activity Sync Service
 *
 * Why: Fetches follower online-hours data from platform APIs and caches it
 * in the AudienceActivity table. This data drives the smart-scheduling engine
 * to recommend times when the user's specific audience is online, instead of
 * relying on generic industry benchmarks.
 *
 * Currently supported: Instagram (via `online_followers` insight metric).
 * Other platforms don't expose follower activity via their APIs.
 */

import { db } from '@/lib/db';
import { Platform } from '@/generated/prisma/enums';
import { getInstagramOnlineFollowers } from '@/lib/platform-api/instagram/analytics';
import { ensureValidToken } from '@/lib/services/token-service';
import { logger } from '@/lib/logger';

const log = logger.child({ service: 'audience-activity-sync' });

/** Platforms that expose follower activity data via API. */
const SUPPORTED_PLATFORMS = new Set<Platform>([Platform.INSTAGRAM]);

interface AudienceActivitySyncResult {
    synced: number;
    skipped: number;
    errors: { accountId: string; platform: string; error: string }[];
}

/**
 * Sync audience activity data for all supported accounts in an organization.
 * Called from the analytics sync cron — piggybacks on the existing schedule.
 *
 * Why: Only fetches for platforms in SUPPORTED_PLATFORMS. Silently skips
 * unsupported platforms to keep logs clean.
 */
export async function syncAudienceActivity(
    organizationId: string
): Promise<AudienceActivitySyncResult> {
    const result: AudienceActivitySyncResult = { synced: 0, skipped: 0, errors: [] };

    const accounts = await db.socialAccount.findMany({
        where: {
            organizationId,
            isActive: true,
            platform: { in: Array.from(SUPPORTED_PLATFORMS) },
        },
        select: {
            id: true,
            platform: true,
            platformId: true,
            accessToken: true,
            refreshToken: true,
            tokenExpiry: true,
            audienceActivity: { select: { fetchedAt: true } },
        },
    });

    for (const account of accounts) {
        try {
            // Why: Skip if data was already fetched today (avoid unnecessary API calls).
            const lastFetch = account.audienceActivity?.fetchedAt;
            if (lastFetch) {
                const hoursSinceLastFetch = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60);
                if (hoursSinceLastFetch < 20) {
                    result.skipped++;
                    continue;
                }
            }

            // Why: Token must be decrypted and refreshed before use.
            const tokenResult = await ensureValidToken(account.id);
            if (!tokenResult.success || !tokenResult.accessToken) {
                result.errors.push({
                    accountId: account.id,
                    platform: account.platform,
                    error: `Token refresh failed: ${tokenResult.error || 'unknown'}`,
                });
                continue;
            }

            const apiResult = await fetchAudienceData(
                account.platform,
                tokenResult.accessToken,
                account.platformId
            );

            if (!apiResult) {
                result.skipped++;
                continue;
            }

            // Why: Upsert — create if first fetch, update if refreshing.
            await db.audienceActivity.upsert({
                where: { socialAccountId: account.id },
                create: {
                    socialAccountId: account.id,
                    platform: account.platform,
                    activityGrid: apiResult,
                    fetchedAt: new Date(),
                },
                update: {
                    activityGrid: apiResult,
                    fetchedAt: new Date(),
                },
            });

            result.synced++;
            log.info({ accountId: account.id, platform: account.platform }, 'Audience activity synced');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            result.errors.push({
                accountId: account.id,
                platform: account.platform,
                error: message,
            });
            log.warn({ accountId: account.id, err: error }, 'Audience activity sync failed');
        }
    }

    return result;
}

/**
 * Dispatch to the correct platform API for audience data.
 * Why: Separated for easy extension when new platforms add follower activity APIs.
 */
async function fetchAudienceData(
    platform: Platform,
    accessToken: string,
    platformId: string
): Promise<Record<number, Record<number, number>> | null> {
    switch (platform) {
        case Platform.INSTAGRAM: {
            const result = await getInstagramOnlineFollowers(accessToken, platformId);
            if (!result.success || !result.data) {
                log.debug({ platform, error: result.error }, 'No audience data available');
                return null;
            }
            return result.data;
        }
        default:
            return null;
    }
}
