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
import { getInstagramAnalytics, getInstagramPostAnalytics, getInstagramStoryAnalytics } from '@/lib/platform-api/instagram-api';
import { getFacebookPageAnalytics, getFacebookPostAnalytics, getFacebookStoryAnalytics } from '@/lib/platform-api/facebook-api';
import { getTikTokAnalytics, getTikTokVideoAnalytics } from '@/lib/platform-api/tiktok-api';
import { getYouTubeChannelAnalytics, getYouTubeVideoMetrics } from '@/lib/platform-api/youtube-api';
import { getPinterestUserAnalytics, getPinterestPinAnalytics } from '@/lib/platform-api/pinterest-api';
import { getThreadsUserInsights, getThreadsMediaInsights } from '@/lib/platform-api/threads-api';
import { getGoogleBusinessAnalytics } from '@/lib/platform-api/google-business-api';
import type { AccountMetrics, PostMetrics, ApiResponse } from '@/lib/platform-api/types';

/**
 * Why: Only these platforms currently expose account-level analytics APIs.
 * BLUESKY and LINKEDIN are silently skipped to keep sync logs clean
 * and avoid pointless token refreshes.
 */
const SUPPORTED_ANALYTICS_PLATFORMS = new Set([
    'INSTAGRAM',
    'FACEBOOK',
    'YOUTUBE',
    'TIKTOK',
    'PINTEREST',
    'THREADS',
    'GOOGLE_BUSINESS',
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
    skipped?: boolean;
    platform?: string;
    error?: string;
}

/** Per-post result shape. */
export interface PostSyncResult {
    id: string;
    success: boolean;
    skipped?: boolean;
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

    // Why (#2): Process accounts in batched parallel (batch size 3) instead of
    // sequentially. For 10 accounts the old approach had 10 × 300ms = 3s of delay alone.
    const BATCH_SIZE = 3;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
            batch.map(async (account) => {
                if (!SUPPORTED_ANALYTICS_PLATFORMS.has(account.platform)) {
                    return { skipped: true as const };
                }

                const tokenResult = await ensureValidToken(account.id);
                if (!tokenResult.success || !tokenResult.accessToken) {
                    throw new Error(tokenResult.error || 'Token refresh failed');
                }
                const token = tokenResult.accessToken;

                const metrics = await fetchAccountMetrics(account, token);
                if (!metrics.success || !metrics.data) {
                    throw new Error(metrics.error || `${account.platform} analytics API returned no data`);
                }

                // Why (#8): previousSnapshot query runs in parallel within the batch.
                const previousSnapshot = await db.platformAnalytics.findFirst({
                    where: { socialAccountId: account.id, date: { lt: today } },
                    orderBy: { date: 'desc' },
                    select: { followers: true },
                });
                const followersChange = previousSnapshot
                    ? metrics.data.followers - previousSnapshot.followers
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
                        followers: metrics.data.followers,
                        followersChange,
                        following: metrics.data.following,
                        impressions: metrics.data.impressions,
                        reach: metrics.data.reach,
                        profileViews: metrics.data.profileViews,
                        websiteClicks: metrics.data.websiteClicks,
                        emailClicks: metrics.data.emailClicks,
                        engagementRate: metrics.data.engagementRate,
                        platformMetrics: (metrics.data.platformMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
                    },
                    update: {
                        followers: metrics.data.followers,
                        followersChange,
                        following: metrics.data.following,
                        impressions: metrics.data.impressions,
                        reach: metrics.data.reach,
                        profileViews: metrics.data.profileViews,
                        websiteClicks: metrics.data.websiteClicks,
                        emailClicks: metrics.data.emailClicks,
                        engagementRate: metrics.data.engagementRate,
                        platformMetrics: (metrics.data.platformMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
                        syncedAt: new Date(),
                    },
                });

                logger.debug(
                    { accountId: account.id, platform: account.platform, followers: metrics.data.followers },
                    'Platform analytics synced'
                );

                return { synced: true as const, accountId: account.id };
            })
        );

        for (const [idx, settled] of batchResults.entries()) {
            if (settled.status === 'fulfilled') {
                if ('synced' in settled.value) {
                    result.accountsSynced++;
                } else {
                    result.accountsSkipped++;
                }
            } else {
                const account = batch[idx];
                const message = settled.reason instanceof Error ? settled.reason.message : 'Unknown error';
                logger.error({ err: settled.reason, accountId: account.id }, 'Platform analytics sync failed for account');
                result.errors.push({
                    accountId: account.id,
                    platform: account.platform,
                    error: message,
                });
            }
        }

        // Why: Rate limit between batches to avoid API throttling
        if (i + BATCH_SIZE < accounts.length) {
            await new Promise((r) => setTimeout(r, 300));
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

    if (!account.isActive) {
        return { success: false, skipped: true, error: 'Account is inactive', platform: account.platform };
    }

    if (!SUPPORTED_ANALYTICS_PLATFORMS.has(account.platform)) {
        return { success: false, skipped: true, error: 'Unsupported platform', platform: account.platform };
    }

    try {
        const tokenResult = await ensureValidToken(account.id);
        if (!tokenResult.success || !tokenResult.accessToken) {
            return { success: false, error: tokenResult.error || 'Token refresh failed', platform: account.platform };
        }

        const metrics = await fetchAccountMetrics(account, tokenResult.accessToken);
        if (!metrics.success || !metrics.data) {
            return {
                success: false,
                error: metrics.error || `${account.platform} analytics API returned no data`,
                platform: account.platform,
            };
        }

        const today = startOfDay(new Date());

        const previousSnapshot = await db.platformAnalytics.findFirst({
            where: { socialAccountId: account.id, date: { lt: today } },
            orderBy: { date: 'desc' },
            select: { followers: true },
        });
        const followersChange = previousSnapshot
            ? metrics.data.followers - previousSnapshot.followers
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
                followers: metrics.data.followers,
                followersChange,
                following: metrics.data.following,
                impressions: metrics.data.impressions,
                reach: metrics.data.reach,
                profileViews: metrics.data.profileViews,
                websiteClicks: metrics.data.websiteClicks,
                emailClicks: metrics.data.emailClicks,
                engagementRate: metrics.data.engagementRate,
                platformMetrics: (metrics.data.platformMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
            },
            update: {
                followers: metrics.data.followers,
                followersChange,
                following: metrics.data.following,
                impressions: metrics.data.impressions,
                reach: metrics.data.reach,
                profileViews: metrics.data.profileViews,
                websiteClicks: metrics.data.websiteClicks,
                emailClicks: metrics.data.emailClicks,
                engagementRate: metrics.data.engagementRate,
                platformMetrics: (metrics.data.platformMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
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
            // BLUESKY and LINKEDIN don't support post-level analytics.
            platform: { in: [...SUPPORTED_ANALYTICS_PLATFORMS] as any },
            platformPostId: { not: null },
            socialAccountId: { not: null },
            socialAccount: { is: { isActive: true } },
        },
        include: { socialAccount: true },
    });

    /**
     * Why (BUG-51): Process posts in small batches instead of unbounded Promise.all.
     * Prevents API rate limit bombardment for orgs with many published posts.
     */
    const BATCH_SIZE = 5;
    const results: PostSyncResult[] = [];

    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
            batch.map(async (post): Promise<PostSyncResult> => {
                try {
                    // Pending IDs represent accepted publications whose public IDs are
                    // not available yet. Reconciliation, not analytics, handles them.
                    const isPendingId = post.platformPostId?.includes('_pending:');
                    if (!post.platformPostId || isPendingId || !post.platform || !post.socialAccount) {
                        return {
                            id: post.id,
                            platform: post.platform ?? undefined,
                            success: false,
                            skipped: true,
                            error: isPendingId ? 'Pending platform post ID' : 'Post is not eligible for analytics sync',
                        };
                    }
                    const account = post.socialAccount;

                    if (!SUPPORTED_ANALYTICS_PLATFORMS.has(post.platform)) {
                        return { id: post.id, platform: post.platform, success: false, skipped: true, error: 'Unsupported platform' };
                    }

                    if (!tokenCache.has(account.id)) {
                        const tokenResult = await ensureValidToken(account.id);
                        tokenCache.set(account.id, tokenResult.success && tokenResult.accessToken ? tokenResult.accessToken : null);
                    }
                    const accessToken = tokenCache.get(account.id);
                    if (!accessToken) {
                        return { id: post.id, platform: post.platform, success: false, error: 'Token refresh failed' };
                    }

                    const metrics = await fetchPostMetrics(post.platform, accessToken, post.platformPostId, post.postType);
                    if (metrics.success && metrics.data) {
                        await upsertPostAnalytics(post.id, metrics.data);
                        return { id: post.id, platform: post.platform, success: true };
                    }

                    // Why: Instagram Stories expire after 24h. Their media IDs become
                    // invalid, returning "does not exist" from the Graph API. This is
                    // expected — not a sync failure. Skip gracefully.
                    if (metrics.error?.includes('does not exist')) {
                        logger.debug({ postId: post.id, platform: post.platform }, 'Post expired or deleted on platform — skipping analytics');
                        return { id: post.id, platform: post.platform, success: false, skipped: true, error: 'Post expired or deleted on platform' };
                    }

                    return { id: post.id, platform: post.platform, success: false, error: metrics.error || `${post.platform} analytics API returned no data` };
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Unknown error';
                    logger.error({ err, postId: post.id }, 'Post analytics sync failed');
                    return { id: post.id, platform: post.platform ?? undefined, success: false, error: message };
                }
            })
        );

        results.push(...batchResults);

        // Why: Rate-limit pause between batches
        if (i + BATCH_SIZE < posts.length) {
            await new Promise((r) => setTimeout(r, 200));
        }
    }

    return results;
}

/**
 * Sync analytics for one published post on demand.
 * Why: Calendar users can open older posts that are outside the rolling
 * background sync window, but still expect the modal to show current metrics.
 */
export async function syncSinglePostAnalytics(
    organizationId: string,
    postId: string
): Promise<PostSyncResult> {
    const post = await db.post.findFirst({
        where: {
            id: postId,
            organizationId,
            status: 'PUBLISHED',
            platform: { in: [...SUPPORTED_ANALYTICS_PLATFORMS] as any },
            platformPostId: { not: null },
            socialAccountId: { not: null },
            socialAccount: { is: { isActive: true } },
        },
        include: { socialAccount: true },
    });

    if (!post?.platformPostId || !post.platform || !post.socialAccount) {
        return { id: postId, success: false, skipped: true, error: 'Post is not eligible for analytics sync' };
    }

    if (post.platformPostId.includes('_pending:')) {
        return { id: post.id, platform: post.platform, success: false, skipped: true, error: 'Pending platform post ID' };
    }

    const tokenResult = await ensureValidToken(post.socialAccount.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        return { id: post.id, platform: post.platform, success: false, error: 'Token refresh failed' };
    }

    const metrics = await fetchPostMetrics(post.platform, tokenResult.accessToken, post.platformPostId, post.postType);
    if (!metrics.success || !metrics.data) {
        return { id: post.id, platform: post.platform, success: false, error: metrics.error || `${post.platform} analytics API returned no data` };
    }

    await upsertPostAnalytics(post.id, metrics.data);
    return { id: post.id, platform: post.platform, success: true };
}

/**
 * Fetch per-post metrics from the appropriate platform API.
 * Why: Extracted from the sync loop so both legacy and new paths share the
 * same switch logic without duplication.
 */
async function fetchPostMetrics(
    platform: string,
    accessToken: string,
    platformPostId: string,
    postType?: string
): Promise<ApiResponse<PostMetrics>> {
    switch (platform) {
        case 'INSTAGRAM':
            // Why: Stories use a different insights metric set (impressions, reach,
            // replies, taps_forward, taps_back) than feed/reel posts (views, reach,
            // saved, shares). Using the wrong endpoint returns an API error.
            if (postType === 'STORY') {
                return getInstagramStoryAnalytics(accessToken, platformPostId);
            }
            return getInstagramPostAnalytics(accessToken, platformPostId);
        case 'FACEBOOK':
            // Why: Facebook Page Stories only support `total_unique_impressions`.
            // The standard post insights (post_impressions, post_clicks) fail
            // on Story nodes and return zeros.
            if (postType === 'STORY') {
                return getFacebookStoryAnalytics(accessToken, platformPostId);
            }
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
        case 'THREADS':
            return getThreadsMediaInsights(accessToken, platformPostId);
        case 'GOOGLE_BUSINESS':
            return { success: true, data: { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, engagementRate: 0 } };
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
): Promise<ApiResponse<AccountMetricsSnapshot>> {
    switch (account.platform) {
        case 'INSTAGRAM': {
            const res = await getInstagramAnalytics(accessToken, account.platformId);
            if (!res.success || !res.data) {
                logger.error({ error: res.error, accountId: account.id }, 'Instagram analytics fetch failed');
                return { success: false, error: res.error || 'Instagram analytics API returned no data' };
            }
            return { success: true, data: mapAccountMetrics(res.data) };
        }
        case 'FACEBOOK': {
            const res = await getFacebookPageAnalytics(accessToken, account.platformId);
            if (!res.success || !res.data) return { success: false, error: res.error || 'Facebook analytics API returned no data' };
            return { success: true, data: mapAccountMetrics(res.data) };
        }
        case 'YOUTUBE': {
            const res = await getYouTubeChannelAnalytics(accessToken, account.platformId);
            if (!res.success || !res.data) return { success: false, error: res.error || 'YouTube analytics API returned no data' };
            return { success: true, data: mapAccountMetrics(res.data) };
        }
        case 'TIKTOK': {
            const res = await getTikTokAnalytics(accessToken);
            if (!res.success || !res.data) return { success: false, error: res.error || 'TikTok analytics API returned no data' };
            return { success: true, data: mapAccountMetrics(res.data) };
        }
        case 'PINTEREST': {
            const res = await getPinterestUserAnalytics(accessToken);
            if (!res.success || !res.data) return { success: false, error: res.error || 'Pinterest analytics API returned no data' };
            return { success: true, data: mapAccountMetrics(res.data) };
        }
        case 'THREADS': {
            const res = await getThreadsUserInsights(accessToken, account.platformId);
            if (!res.success || !res.data) return { success: false, error: res.error || 'Threads analytics API returned no data' };
            return { success: true, data: mapAccountMetrics(res.data) };
        }
        case 'GOOGLE_BUSINESS': {
            const res = await getGoogleBusinessAnalytics(accessToken, account.platformId);
            if (!res.success || !res.data) return { success: false, error: res.error || 'Google Business analytics API returned no data' };
            return { success: true, data: mapAccountMetrics(res.data) };
        }
        default:
            return { success: false, error: `Unsupported platform: ${account.platform}` };
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
