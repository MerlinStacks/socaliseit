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
import { syncRecentPostsAnalytics } from '@/lib/platform-api/analytics-sync';
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

    const results: PostSyncResult[] = [];

    for (const account of accounts) {
        try {
            const result = await syncAccountPosts(
                organizationId,
                account.id,
                account.platform,
                account.platformId,
                account.accessToken,
                since
            );
            results.push(result);
        } catch (error) {
            logger.error({ error, accountId: account.id }, 'Account sync failed');
            results.push({
                socialAccountId: account.id,
                platform: account.platform,
                success: false,
                postsImported: 0,
                postsSkipped: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
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
            await syncRecentPostsAnalytics(organizationId);
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
