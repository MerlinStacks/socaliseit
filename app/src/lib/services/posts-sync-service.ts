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
import { isPlatformPostSyncSupported, isPermanentTokenError } from '@/lib/sync-platforms';
import type { Platform } from '@/generated/prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface PostSyncResult {
    socialAccountId: string;
    platform: Platform;
    success: boolean;
    postsImported: number;
    postsSkipped: number;
    error?: string;
}

export interface WorkspaceSyncSummary {
    organizationId: string;
    totalAccounts: number;
    successfulAccounts: number;
    totalPostsImported: number;
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

    for (const account of syncable) {
        try {
            // Decrypt/refresh token before API calls
            const { ensureValidToken } = await import('@/lib/services/token-service');
            const tokenResult = await ensureValidToken(account.id);
            const accessToken = tokenResult.success && tokenResult.accessToken
                ? tokenResult.accessToken
                : account.accessToken; // fallback to raw (will likely fail but preserves existing error flow)

            const result = await syncAccountPosts(
                organizationId,
                account.id,
                account.platform,
                account.platformId,
                accessToken,
                since
            );
            results.push(result);

            // Why: Auto-deactivate accounts whose tokens are permanently invalid
            // so they stop wasting API calls every sync cycle.
            if (!result.success && result.error && isPermanentTokenError(result.error)) {
                logger.warn(
                    { accountId: account.id, platform: account.platform, error: result.error },
                    'Deactivating account due to permanent token error — user must reconnect'
                );
                await db.socialAccount.update({
                    where: { id: account.id },
                    data: { isActive: false },
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ error, accountId: account.id }, 'Account sync failed');

            // Also check thrown errors for permanent token invalidity
            if (isPermanentTokenError(message)) {
                logger.warn(
                    { accountId: account.id, platform: account.platform },
                    'Deactivating account due to permanent token error — user must reconnect'
                );
                await db.socialAccount.update({
                    where: { id: account.id },
                    data: { isActive: false },
                });
            }

            results.push({
                socialAccountId: account.id,
                platform: account.platform,
                success: false,
                postsImported: 0,
                postsSkipped: 0,
                error: message,
            });
        }
    }

    const summary: WorkspaceSyncSummary = {
        organizationId,
        totalAccounts: accounts.length,
        successfulAccounts: results.filter(r => r.success).length,
        totalPostsImported: results.reduce((sum, r) => sum + r.postsImported, 0),
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
            const result = await getInstagramMedia(accessToken, platformId, since);
            if (result.success && result.data) {
                externalPosts = result.data;
            } else {
                return {
                    socialAccountId,
                    platform,
                    success: false,
                    postsImported: 0,
                    postsSkipped: 0,
                    error: result.error,
                };
            }
            // Also fetch active Stories (ephemeral 24h content)
            const storiesResult = await getInstagramStories(accessToken, platformId);
            if (storiesResult.success && storiesResult.data) {
                externalPosts.push(...storiesResult.data);
            }
            // Stories fetch failure is non-blocking - posts still sync
            break;
        }
        case 'FACEBOOK': {
            const result = await getFacebookPagePosts(accessToken, platformId, since);
            if (result.success && result.data) {
                externalPosts = result.data;
            } else {
                return {
                    socialAccountId,
                    platform,
                    success: false,
                    postsImported: 0,
                    postsSkipped: 0,
                    error: result.error,
                };
            }
            // Also fetch active Stories (ephemeral 24h content)
            const storiesResult = await getFacebookPageStories(accessToken, platformId);
            if (storiesResult.success && storiesResult.data) {
                externalPosts.push(...storiesResult.data);
            }
            // Stories fetch failure is non-blocking - posts still sync
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
                    postsImported: 0,
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
                    postsImported: 0,
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
                    postsImported: 0,
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
                postsImported: 0,
                postsSkipped: 0,
                error: `Platform ${platform} not supported for posts sync`,
            };
    }

    // Import posts to database
    let imported = 0;
    let skipped = 0;

    for (const post of externalPosts) {
        try {
            // Upsert to handle duplicates
            // Why: Store thumbnail URL directly on Post, not as Media record
            // External CDN URLs expire and shouldn't pollute the user's media library
            await db.post.upsert({
                where: {
                    organizationId_externalId: {
                        organizationId,
                        externalId: post.externalId,
                    },
                },
                create: {
                    organizationId,
                    caption: post.caption,
                    status: 'PUBLISHED',
                    publishedAt: post.publishedAt,
                    isExternal: true,
                    externalId: post.externalId,
                    externalUrl: post.permalink,
                    externalThumbnailUrl: post.thumbnailUrl || null,
                    syncedAt: new Date(),
                    platforms: {
                        create: {
                            socialAccountId,
                            platformPostId: post.externalId,
                            status: 'PUBLISHED',
                            publishedAt: post.publishedAt,
                        },
                    },
                },
                update: {
                    caption: post.caption,
                    // Why: Ensure metadata is always fresh, especially if status changed
                    status: 'PUBLISHED',
                    publishedAt: post.publishedAt,
                    externalUrl: post.permalink,
                    externalThumbnailUrl: post.thumbnailUrl || null,
                    syncedAt: new Date(),
                },
            });

            imported++;
        } catch (error) {
            // Likely duplicate or constraint error - skip
            logger.debug({ error, externalId: post.externalId }, 'Post import skipped');
            skipped++;
        }
    }


    logger.info({ socialAccountId, platform, imported, skipped }, 'Account posts synced');

    return {
        socialAccountId,
        platform,
        success: true,
        postsImported: imported,
        postsSkipped: skipped,
    };
}
