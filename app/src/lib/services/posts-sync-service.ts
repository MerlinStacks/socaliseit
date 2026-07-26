/**
 * Posts Sync Service
 * Orchestrates fetching and storing external posts from connected platforms
 * 
 * Why: Users want to see posts published directly on platforms (not through us)
 * displayed in their calendar for a complete content overview
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
    getInstagramMedia,
    getInstagramStories,
    getFacebookPagePosts,
    getFacebookPageStories,
    getTikTokVideos,
    getYouTubeVideos,
    getPinterestPins,
    type ExternalPost,
} from '@/lib/platform-api/posts-sync';
import { syncPostAnalytics } from '@/lib/services/platform-analytics-sync';
import { ensureValidToken } from '@/lib/services/token-service';
import { isPlatformPostSyncSupported, isPermanentTokenError } from '@/lib/sync-platforms';
import type { Platform } from '@/generated/prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface PostSyncResult {
    socialAccountId: string;
    platform: Platform;
    success: boolean;
    postsAttempted: number;
    postsImported: number;
    postsUpdated: number;
    postsSkipped: number;
    error?: string;
}

export interface WorkspaceSyncSummary {
    organizationId: string;
    totalAccounts: number;
    attemptedAccounts: number;
    unsupportedAccounts: number;
    successfulAccounts: number;
    failedAccounts: number;
    totalPostsAttempted: number;
    totalPostsImported: number;
    totalPostsUpdated: number;
    totalPostsSkipped: number;
    results: PostSyncResult[];
}

// ============================================================================
// Main Sync Functions
// ============================================================================

/**
 * Sync posts for all connected accounts in a workspace
 * 
 * @param organizationId - Workspace to sync
 * @param daysSince - Number of days back to sync (default 30)
 */
export async function syncWorkspacePosts(
    organizationId: string,
    daysSince: number = 30
): Promise<WorkspaceSyncSummary> {
    const since = new Date();
    since.setDate(since.getDate() - daysSince);

    // Get all active social accounts
    const accounts = await db.socialAccount.findMany({
        where: {
            organizationId,
            isActive: true,
        },
    });

    logger.info({ organizationId, accountCount: accounts.length, daysSince }, 'Starting workspace posts sync');

    // Why: BLUESKY, THREADS, etc. are in the Platform enum but lack post-fetch integrations.
    // Filtering up front avoids per-account errors and wasted API calls.
    const syncable = accounts.filter((a) => isPlatformPostSyncSupported(a.platform));
    const skippedCount = accounts.length - syncable.length;
    if (skippedCount > 0) {
        logger.debug({ skippedCount, organizationId }, 'Skipped unsupported platform accounts for posts sync');
    }

    const results: PostSyncResult[] = [];

    // Why: Process accounts in batches of 3 for parallelism, same pattern as engagement sync.
    const BATCH_SIZE = 3;
    for (let i = 0; i < syncable.length; i += BATCH_SIZE) {
        const batch = syncable.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
            batch.map(async (account) => {

                // Why: Static import instead of per-iteration dynamic import.
                const tokenResult = await ensureValidToken(account.id);
                // Why: Do NOT fall back to encrypted token — it will always fail the
                // platform API call, wasting a full HTTP round-trip.
                if (!tokenResult.success || !tokenResult.accessToken) {
                    return {
                        account,
                        result: {
                            socialAccountId: account.id,
                            platform: account.platform,
                            success: false,
                            postsAttempted: 0,
                            postsImported: 0,
                            postsUpdated: 0,
                            postsSkipped: 0,
                            error: tokenResult.error || 'Token refresh failed',
                        } as PostSyncResult,
                    };
                }

                const result = await syncAccountPosts(
                    organizationId, account.id, account.platform,
                    account.platformId, tokenResult.accessToken, since
                );


                return { account, result };
            })
        );

        for (const [idx, settled] of batchResults.entries()) {
            if (settled.status === 'fulfilled') {
                const { account, result } = settled.value;
                results.push(result);

                if (!result.success && result.error && isPermanentTokenError(result.error)) {
                    logger.warn(
                        { accountId: account.id, platform: account.platform, error: result.error },
                        'Deactivating account due to permanent token error — user must reconnect'
                    );
                    await db.socialAccount.update({
                        where: { id: account.id }, data: { isActive: false },
                    });
                }
            } else {
                const account = batch[idx];
                const message = settled.reason instanceof Error ? settled.reason.message : 'Unknown error';
                logger.error({ error: settled.reason, accountId: account.id }, 'Account sync failed');

                if (isPermanentTokenError(message)) {
                    await db.socialAccount.update({
                        where: { id: account.id }, data: { isActive: false },
                    });
                }

                results.push({
                    socialAccountId: account.id,
                    platform: account.platform,
                    success: false,
                    postsAttempted: 0,
                    postsImported: 0,
                    postsUpdated: 0,
                    postsSkipped: 0,
                    error: message,
                });
            }
        }
    }

    const summary: WorkspaceSyncSummary = {
        organizationId,
        totalAccounts: accounts.length,
        attemptedAccounts: syncable.length,
        unsupportedAccounts: skippedCount,
        successfulAccounts: results.filter(r => r.success).length,
        failedAccounts: results.filter(r => !r.success).length,
        totalPostsAttempted: results.reduce((sum, r) => sum + r.postsAttempted, 0),
        totalPostsImported: results.reduce((sum, r) => sum + r.postsImported, 0),
        totalPostsUpdated: results.reduce((sum, r) => sum + r.postsUpdated, 0),
        totalPostsSkipped: results.reduce((sum, r) => sum + r.postsSkipped, 0),
        results,
    };

    logger.info({ summary }, 'Workspace posts sync complete');

    // Sync analytics for newly imported external posts
    // Why: External posts need analytics fetched from platform APIs to display performance metrics
    if (summary.totalPostsImported > 0) {
        try {
            await syncPostAnalytics(organizationId);
            logger.info({ organizationId }, 'Analytics synced for external posts');
        } catch (error) {
            // Non-blocking: analytics sync failure shouldn't break the posts sync
            logger.warn({ error, organizationId }, 'Failed to sync analytics for external posts');
        }
    }

    return summary;
}

/**
 * Sync posts for a single social account
 */
async function syncAccountPosts(
    organizationId: string,
    socialAccountId: string,
    platform: Platform,
    platformId: string,
    accessToken: string,
    since: Date
): Promise<PostSyncResult> {
    let externalPosts: ExternalPost[] = [];

    // Fetch posts from the appropriate platform
    switch (platform) {
        case 'INSTAGRAM': {
            // Why: Media and Stories are independent API calls — run in parallel.
            const [mediaResult, storiesResult] = await Promise.all([
                getInstagramMedia(accessToken, platformId, since),
                getInstagramStories(accessToken, platformId),
            ]);
            if (mediaResult.success && mediaResult.data) {
                externalPosts = mediaResult.data;
            } else {
                return {
                    socialAccountId,
                    platform,
                    success: false,
                    postsAttempted: 0,
                    postsImported: 0,
                    postsUpdated: 0,
                    postsSkipped: 0,
                    error: mediaResult.error,
                };
            }
            // Stories fetch failure is non-blocking
            if (storiesResult.success && storiesResult.data) {
                externalPosts.push(...storiesResult.data);
            }
            break;
        }
        case 'FACEBOOK': {
            // Why: Posts and Stories are independent API calls — run in parallel.
            const [postsResult, fbStoriesResult] = await Promise.all([
                getFacebookPagePosts(accessToken, platformId, since),
                getFacebookPageStories(accessToken, platformId),
            ]);
            if (postsResult.success && postsResult.data) {
                externalPosts = postsResult.data;
            } else {
                return {
                    socialAccountId,
                    platform,
                    success: false,
                    postsAttempted: 0,
                    postsImported: 0,
                    postsUpdated: 0,
                    postsSkipped: 0,
                    error: postsResult.error,
                };
            }
            // Stories fetch failure is non-blocking
            if (fbStoriesResult.success && fbStoriesResult.data) {
                externalPosts.push(...fbStoriesResult.data);
            }
            break;
        }
        case 'TIKTOK': {
            const result = await getTikTokVideos(accessToken, since);
            if (result.success && result.data) {
                externalPosts = result.data;
            } else {
                return {
                    socialAccountId,
                    platform,
                    success: false,
                    postsAttempted: 0,
                    postsImported: 0,
                    postsUpdated: 0,
                    postsSkipped: 0,
                    error: result.error,
                };
            }
            break;
        }
        case 'YOUTUBE': {
            const result = await getYouTubeVideos(accessToken, platformId, since);
            if (result.success && result.data) {
                externalPosts = result.data;
            } else {
                return {
                    socialAccountId,
                    platform,
                    success: false,
                    postsAttempted: 0,
                    postsImported: 0,
                    postsUpdated: 0,
                    postsSkipped: 0,
                    error: result.error,
                };
            }
            break;
        }
        case 'PINTEREST': {
            const result = await getPinterestPins(accessToken, since);
            if (result.success && result.data) {
                externalPosts = result.data;
            } else {
                return {
                    socialAccountId,
                    platform,
                    success: false,
                    postsAttempted: 0,
                    postsImported: 0,
                    postsUpdated: 0,
                    postsSkipped: 0,
                    error: result.error,
                };
            }
            break;
        }
        default:
            return {
                socialAccountId,
                platform,
                success: false,
                postsAttempted: 0,
                postsImported: 0,
                postsUpdated: 0,
                postsSkipped: 0,
                error: `Platform ${platform} not supported for posts sync`,
            };
    }

    // Why: Platform APIs can return the same post in both media and stories listings
    // (e.g. a Reel appears in getInstagramMedia AND getInstagramStories). Dedup by
    // externalId before processing to avoid hitting the unique constraint.
    const uniquePosts = new Map<string, ExternalPost>();
    for (const ep of externalPosts) {
        if (!uniquePosts.has(ep.externalId)) {
            uniquePosts.set(ep.externalId, ep);
        }
    }
    const deduplicatedPosts = Array.from(uniquePosts.values());

    // Why (#1 N+1 FIX): Pre-fetch all native platformPostIds for this org+platform
    // in a single query, then check membership via Set (O(1) per post).
    // Previously did a findFirst per post: O(N) DB round-trips.
    const existingNativePosts = await db.post.findMany({
        where: {
            organizationId,
            platform,
            isExternal: false,
            platformPostId: { not: null },
        },
        select: { id: true, platformPostId: true, externalId: true },
    });
    const nativePostByPlatformId = new Map(
        existingNativePosts.map(p => [p.platformPostId!, { id: p.id, externalId: p.externalId }])
    );

    // Why: Also pre-fetch the set of customThumbnailUrls so we can skip them
    // in orphan cleanup (not needed here, but the pattern is available).

    // Import posts to database
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    // Why (#7): Batch DB upserts via $transaction to reduce round-trips.
    const UPSERT_BATCH_SIZE = 10;
    for (let i = 0; i < deduplicatedPosts.length; i += UPSERT_BATCH_SIZE) {
        const batch = deduplicatedPosts.slice(i, i + UPSERT_BATCH_SIZE);
        const operations: Array<Promise<void>> = [];

        for (const post of batch) {
            operations.push((async () => {
                try {
                    const existingNative = nativePostByPlatformId.get(post.externalId);

                    if (existingNative) {
                        // Backfill externalId so future upserts match via the unique key
                        if (!existingNative.externalId) {
                            // Why: A previous sync cycle may have already created an external
                            // post row with this externalId. Delete the orphan first so the
                            // backfill update does not violate the unique constraint.
                            const orphanedExternal = await db.post.findFirst({
                                where: {
                                    organizationId,
                                    externalId: post.externalId,
                                    isExternal: true,
                                },
                                select: { id: true },
                            });
                            if (orphanedExternal) {
                                await db.post.delete({ where: { id: orphanedExternal.id } });
                            }

                            await db.post.update({
                                where: { id: existingNative.id },
                                data: {
                                    externalId: post.externalId,
                                    externalUrl: post.permalink,
                                    syncedAt: new Date(),
                                },
                            });
                        }
                        skipped++;
                        return;
                    }

                    // Create first so only the process that wins a concurrent insert
                    // reports a new import. Unique conflicts are existing posts to update.
                    const upsertData = {
                        caption: post.caption,
                        status: 'PUBLISHED' as const,
                        publishedAt: post.publishedAt,
                        externalUrl: post.permalink,
                        externalThumbnailUrl: post.thumbnailUrl || null,
                        syncedAt: new Date(),
                        platform,
                        socialAccountId,
                        platformPostId: post.externalId,
                    };

                    try {
                        await db.post.create({
                            data: {
                                organizationId,
                                isExternal: true,
                                externalId: post.externalId,
                                ...upsertData,
                            },
                        });
                        imported++;
                    } catch (upsertError: unknown) {
                        const isPrismaConstraint = upsertError instanceof Error
                            && 'code' in upsertError
                            && (upsertError as { code: string }).code === 'P2002';

                        if (isPrismaConstraint) {
                            try {
                                await db.post.update({
                                    where: {
                                        organizationId_externalId: {
                                            organizationId,
                                            externalId: post.externalId,
                                        },
                                    },
                                    data: upsertData,
                                });
                                updated++;
                            } catch (fallbackError) {
                                logger.debug({ error: fallbackError, externalId: post.externalId }, 'Post import fallback update failed');
                                skipped++;
                            }
                        } else {
                            throw upsertError;
                        }
                    }
                } catch (error) {
                    logger.debug({ error, externalId: post.externalId }, 'Post import skipped');
                    skipped++;
                }
            })());
        }

        await Promise.allSettled(operations);
    }


    logger.info({
        socialAccountId,
        platform,
        attempted: deduplicatedPosts.length,
        imported,
        updated,
        skipped,
    }, 'Account posts synced');

    return {
        socialAccountId,
        platform,
        success: true,
        postsAttempted: deduplicatedPosts.length,
        postsImported: imported,
        postsUpdated: updated,
        postsSkipped: skipped,
    };
}
