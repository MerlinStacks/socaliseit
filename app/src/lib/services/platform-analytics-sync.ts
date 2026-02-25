/**
 * Platform Analytics Sync Service
 * Fetches account-level and post-level metrics from platform APIs
 * and stores daily snapshots in PlatformAnalytics / PostAnalytics.
 *
 * Why: Centralised token-safe sync. All platform API calls route through
 * `ensureValidToken()` so tokens are always decrypted and refreshed.
 * Replaces the legacy `platform-api/analytics-sync.ts` which used raw
 * (encrypted) tokens.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { startOfDay } from 'date-fns';
import type { SocialAccount } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { ensureValidToken } from '@/lib/services/token-service';
import { getInstagramAnalytics, getInstagramPostAnalytics } from '@/lib/platform-api/instagram-api';
import { getFacebookPageAnalytics, getFacebookPostAnalytics } from '@/lib/platform-api/facebook-api';
import { getTikTokAnalytics, getTikTokVideoAnalytics } from '@/lib/platform-api/tiktok-api';
import { getYouTubeChannelAnalytics, getYouTubeVideoMetrics } from '@/lib/platform-api/youtube-api';
import { getPinterestUserAnalytics, getPinterestPinAnalytics } from '@/lib/platform-api/pinterest-api';
import type { AccountMetrics, PostMetrics, ApiResponse } from '@/lib/platform-api/types';

/**
 * Why: Only these platforms currently expose account-level analytics APIs.
 * Others (BLUESKY, THREADS, GOOGLE_BUSINESS, LINKEDIN) are silently skipped
 * to keep sync logs clean and avoid pointless token refreshes.
 */
const SUPPORTED_ANALYTICS_PLATFORMS = new Set([
    'INSTAGRAM',
    'FACEBOOK',
    'YOUTUBE',
    'TIKTOK',
    'PINTEREST',
]);

// ============================================================================
// Types
// ============================================================================

export interface PlatformAnalyticsSyncResult {
    accountsSynced: number;
    accountsSkipped: number;
    errors: { accountId: string; platform: string; error: string }[];
}

/** Per-account result shape used by callers that need platform + error info. */
export interface AccountSyncResult {
    success: boolean;
    platform?: string;
    error?: string;
}

/** Per-post result shape. */
export interface PostSyncResult {
    id: string;
    success: boolean;
    platform?: string;
    error?: string;
}

// ============================================================================
// Account-Level Analytics
// ============================================================================

/**
 * Sync account-level analytics for all active accounts in a workspace.
 * Creates one PlatformAnalytics row per account per day.
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
        // Why: Skip platforms without analytics API support early — avoids
        // unnecessary token refreshes and keeps error logs clean.
        if (!SUPPORTED_ANALYTICS_PLATFORMS.has(account.platform)) {
            result.accountsSkipped++;
            continue;
        }

        try {
            // Why: Decrypt / refresh token before calling platform API
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

            // Why: Rate limit between accounts to avoid API throttling
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

/**
 * Sync analytics for a single account (token-safe).
 * Used by the single-account sync endpoint.
 *
 * @param accountId - The SocialAccount ID
 */
export async function syncSingleAccountAnalytics(
    accountId: string
): Promise<AccountSyncResult> {
    const account = await db.socialAccount.findUnique({
        where: { id: accountId },
    });

    if (!account) {
        return { success: false, error: 'Account not found' };
    }

    try {
        const tokenResult = await ensureValidToken(account.id);
        if (!tokenResult.success || !tokenResult.accessToken) {
            return { success: false, error: tokenResult.error || 'Token refresh failed', platform: account.platform };
        }

        const metrics = await fetchAccountMetrics(account, tokenResult.accessToken);
        if (!metrics) {
            return { success: false, error: 'Unsupported platform', platform: account.platform };
        }

        const today = startOfDay(new Date());

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
                organizationId: account.organizationId,
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

        return { success: true, platform: account.platform };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message, platform: account.platform };
    }
}

// ============================================================================
// Post-Level Analytics
// ============================================================================

/**
 * Sync analytics for recent posts (last 30 days) across all accounts.
 * Uses `ensureValidToken()` for each account so tokens are decrypted and fresh.
 *
 * @param organizationId - Workspace to sync
 */
export async function syncPostAnalytics(
    organizationId: string
): Promise<PostSyncResult[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Why: Build a token cache keyed by account ID so we only refresh once
    // per account rather than once per post.
    const tokenCache = new Map<string, string | null>();

    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            publishedAt: { gte: thirtyDaysAgo },
            // Why: Only fetch posts for platforms that have analytics APIs.
            // BLUESKY, THREADS, GOOGLE_BUSINESS don't support post-level analytics.
            platform: { in: [...SUPPORTED_ANALYTICS_PLATFORMS] as any },
            platformPostId: { not: null },
            socialAccountId: { not: null },
        },
        include: { socialAccount: true },
    });

    return Promise.all(
        posts.map(async (post): Promise<PostSyncResult> => {
            if (!post.platformPostId || !post.platform || !post.socialAccount) {
                return { id: post.id, platform: post.platform ?? undefined, success: false };
            }
            const account = post.socialAccount;

            if (!tokenCache.has(account.id)) {
                const tokenResult = await ensureValidToken(account.id);
                tokenCache.set(
                    account.id,
                    tokenResult.success && tokenResult.accessToken
                        ? tokenResult.accessToken
                        : null
                );
            }
            const accessToken = tokenCache.get(account.id);
            if (!accessToken) {
                return { id: post.id, platform: post.platform, success: false, error: 'Token refresh failed' };
            }

            try {
                const metrics = await fetchPostMetrics(post.platform, accessToken, post.platformPostId);
                if (metrics.success && metrics.data) {
                    await upsertPostAnalytics(post.id, metrics.data);
                    return { id: post.id, platform: post.platform, success: true };
                }

                // Why: Instagram Stories expire after 24h. Their media IDs become
                // invalid, returning "does not exist" from the Graph API. This is
                // expected — not a sync failure. Skip gracefully.
                if (metrics.error?.includes('does not exist')) {
                    logger.debug({ postId: post.id, platform: post.platform }, 'Post expired or deleted on platform — skipping analytics');
                    return { id: post.id, platform: post.platform, success: true };
                }

                return { id: post.id, platform: post.platform, success: false, error: metrics.error };
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                logger.error({ err, postId: post.id }, 'Post analytics sync failed');
                return { id: post.id, platform: post.platform, success: false, error: message };
            }
        })
    );
}

/**
 * Fetch per-post metrics from the appropriate platform API.
 * Why: Extracted from the sync loop so both legacy and new paths share the
 * same switch logic without duplication.
 */
async function fetchPostMetrics(
    platform: string,
    accessToken: string,
    platformPostId: string
): Promise<ApiResponse<PostMetrics>> {
    switch (platform) {
        case 'INSTAGRAM':
            return getInstagramPostAnalytics(accessToken, platformPostId);
        case 'FACEBOOK':
            return getFacebookPostAnalytics(accessToken, platformPostId);
        case 'YOUTUBE':
            return getYouTubeVideoMetrics(accessToken, platformPostId);
        case 'PINTEREST':
            return getPinterestPinAnalytics(accessToken, platformPostId);
        case 'TIKTOK': {
            const vidMetrics = await getTikTokVideoAnalytics(accessToken, [platformPostId]);
            if (vidMetrics.success && vidMetrics.data && vidMetrics.data.length > 0) {
                return { success: true, data: vidMetrics.data[0] };
            }
            return { success: false, error: vidMetrics.error };
        }
        default:
            return { success: false, error: `Unsupported platform: ${platform}` };
    }
}

/**
 * Upsert PostAnalytics via `postId`.
 */
async function upsertPostAnalytics(
    postId: string,
    data: PostMetrics
): Promise<void> {
    await db.postAnalytics.upsert({
        where: { postId },
        update: {
            impressions: data.impressions,
            reach: data.reach,
            likes: data.likes,
            comments: data.comments,
            shares: data.shares,
            saves: data.saves,
            clicks: data.clicks,
            videoViews: data.videoViews,
            engagementRate: data.engagementRate,
            platformMetrics: data.platformMetrics as Prisma.InputJsonValue | undefined,
            syncedAt: new Date(),
        },
        create: {
            postId,
            impressions: data.impressions,
            reach: data.reach,
            likes: data.likes,
            comments: data.comments,
            shares: data.shares,
            saves: data.saves,
            clicks: data.clicks,
            videoViews: data.videoViews,
            engagementRate: data.engagementRate,
            platformMetrics: data.platformMetrics as Prisma.InputJsonValue | undefined,
        },
    });
}

// ============================================================================
// Internal Helpers
// ============================================================================

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
            if (!res.success || !res.data) {
                logger.error({ error: res.error, accountId: account.id }, 'Instagram analytics fetch failed');
                return null;
            }
            return mapAccountMetrics(res.data);
        }
        case 'FACEBOOK': {
            const res = await getFacebookPageAnalytics(accessToken, account.platformId);
            if (!res.success || !res.data) return null;
            return mapAccountMetrics(res.data);
        }
        case 'YOUTUBE': {
            const res = await getYouTubeChannelAnalytics(accessToken, account.platformId);
            if (!res.success || !res.data) return null;
            return mapAccountMetrics(res.data);
        }
        case 'TIKTOK': {
            const res = await getTikTokAnalytics(accessToken);
            if (!res.success || !res.data) return null;
            return mapAccountMetrics(res.data);
        }
        case 'PINTEREST': {
            const res = await getPinterestUserAnalytics(accessToken);
            if (!res.success || !res.data) return null;
            return mapAccountMetrics(res.data);
        }
        default:
            // Why: Platforms like BLUESKY, THREADS, GOOGLE_BUSINESS don't yet
            // support account-level insights via their APIs.
            return null;
    }
}

/**
 * Map the generic AccountMetrics shape to the snapshot shape stored in DB.
 * Why: Keeps the platform switch clean — each case only calls the API;
 * field mapping lives in one place.
 */
function mapAccountMetrics(data: AccountMetrics): AccountMetricsSnapshot {
    return {
        followers: data.followers,
        following: data.following,
        impressions: data.impressions,
        reach: data.reach,
        profileViews: data.profileViews,
        websiteClicks: data.websiteClicks,
        emailClicks: data.emailClicks,
        engagementRate: data.engagementRate,
        platformMetrics: data.platformMetrics || null,
    };
}
