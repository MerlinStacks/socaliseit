/**
 * Platform Analytics Sync Service
 * Fetches account-level metrics (followers, profile views, website clicks)
 * from platform APIs and stores daily snapshots in PlatformAnalytics.
 *
 * Why: The engagement sync worker only handles comments/mentions/DMs.
 * Without this service, the Account Growth section on the analytics page
 * shows all zeros because PlatformAnalytics is never populated.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { startOfDay } from 'date-fns';
import type { SocialAccount } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { getInstagramAnalytics } from '@/lib/platform-api/instagram/analytics';
import { getFacebookPageAnalytics } from '@/lib/platform-api/facebook-api';

export interface PlatformAnalyticsSyncResult {
    accountsSynced: number;
    accountsSkipped: number;
    errors: { accountId: string; platform: string; error: string }[];
}

/**
 * Sync account-level analytics for all active accounts in a workspace.
 * Creates one PlatformAnalytics row per account per day (upsert on unique constraint).
 *
 * @param organizationId - Workspace to sync
 */
export async function syncPlatformAnalytics(
    organizationId: string
): Promise<PlatformAnalyticsSyncResult> {
    const result: PlatformAnalyticsSyncResult = {
        accountsSynced: 0,
        accountsSkipped: 0,
        errors: [],
    };

    const accounts = await db.socialAccount.findMany({
        where: { organizationId, isActive: true },
    });

    const today = startOfDay(new Date());

    for (const account of accounts) {
        try {
            // Why: Decrypt / refresh token before calling platform API
            const { ensureValidToken } = await import('@/lib/services/token-service');
            const tokenResult = await ensureValidToken(account.id);
            if (!tokenResult.success || !tokenResult.accessToken) {
                result.accountsSkipped++;
                continue;
            }
            const token = tokenResult.accessToken;

            const metrics = await fetchAccountMetrics(account, token);
            if (!metrics) {
                result.accountsSkipped++;
                continue;
            }

            // Why: Calculate followerChange by comparing with the most recent snapshot
            const previousSnapshot = await db.platformAnalytics.findFirst({
                where: { socialAccountId: account.id, date: { lt: today } },
                orderBy: { date: 'desc' },
                select: { followers: true },
            });
            const followersChange = previousSnapshot
                ? metrics.followers - previousSnapshot.followers
                : 0;

            await db.platformAnalytics.upsert({
                where: {
                    socialAccountId_date: {
                        socialAccountId: account.id,
                        date: today,
                    },
                },
                create: {
                    organizationId,
                    socialAccountId: account.id,
                    date: today,
                    followers: metrics.followers,
                    followersChange,
                    following: metrics.following,
                    impressions: metrics.impressions,
                    reach: metrics.reach,
                    profileViews: metrics.profileViews,
                    websiteClicks: metrics.websiteClicks,
                    emailClicks: metrics.emailClicks,
                    engagementRate: metrics.engagementRate,
                    platformMetrics: (metrics.platformMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
                },
                update: {
                    followers: metrics.followers,
                    followersChange,
                    following: metrics.following,
                    impressions: metrics.impressions,
                    reach: metrics.reach,
                    profileViews: metrics.profileViews,
                    websiteClicks: metrics.websiteClicks,
                    emailClicks: metrics.emailClicks,
                    engagementRate: metrics.engagementRate,
                    platformMetrics: (metrics.platformMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
                    syncedAt: new Date(),
                },
            });

            result.accountsSynced++;
            logger.debug(
                { accountId: account.id, platform: account.platform, followers: metrics.followers },
                'Platform analytics synced'
            );

            // Rate limit between accounts
            await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error({ err, accountId: account.id }, 'Platform analytics sync failed for account');
            result.errors.push({
                accountId: account.id,
                platform: account.platform,
                error: message,
            });
        }
    }

    return result;
}

interface AccountMetricsSnapshot {
    followers: number;
    following: number;
    impressions: number;
    reach: number;
    profileViews: number;
    websiteClicks: number;
    emailClicks: number;
    engagementRate: number;
    platformMetrics: Record<string, unknown> | null;
}

/**
 * Fetch account-level metrics from the appropriate platform API.
 * Returns null for platforms that don't support account insights.
 */
async function fetchAccountMetrics(
    account: SocialAccount,
    accessToken: string
): Promise<AccountMetricsSnapshot | null> {
    switch (account.platform) {
        case 'INSTAGRAM': {
            const res = await getInstagramAnalytics(accessToken, account.platformId);
            if (!res.success || !res.data) return null;
            return {
                followers: res.data.followers,
                following: res.data.following,
                impressions: res.data.impressions,
                reach: res.data.reach,
                profileViews: res.data.profileViews,
                websiteClicks: res.data.websiteClicks,
                emailClicks: res.data.emailClicks,
                engagementRate: res.data.engagementRate,
                platformMetrics: res.data.platformMetrics || null,
            };
        }
        case 'FACEBOOK': {
            const res = await getFacebookPageAnalytics(accessToken, account.platformId);
            if (!res.success || !res.data) return null;
            return {
                followers: res.data.followers,
                following: res.data.following,
                impressions: res.data.impressions,
                reach: res.data.reach,
                profileViews: res.data.profileViews,
                websiteClicks: res.data.websiteClicks,
                emailClicks: res.data.emailClicks,
                engagementRate: res.data.engagementRate,
                platformMetrics: res.data.platformMetrics || null,
            };
        }
        default:
            // Why: Only Instagram and Facebook currently support account-level insights
            return null;
    }
}
