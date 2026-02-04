/**
 * Engagement Sync Service
 * Orchestrates fetching comments and mentions from ALL platform content
 *
 * Why: Users want to see engagement (comments, mentions, tags) for all their
 * content, including posts made directly on platforms (not through SocialiseIT)
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Platform, SocialAccount } from '@/generated/prisma/client';

// Platform API imports for comments
import { getInstagramComments, getInstagramMentions } from '@/lib/platform-api/instagram-api';
import { getFacebookComments, getFacebookMentions } from '@/lib/platform-api/facebook-api';
import { getTikTokComments } from '@/lib/platform-api/tiktok-api';
import { getYouTubeComments } from '@/lib/platform-api/youtube-api';

// Platform API imports for posts
import {
    getInstagramMedia,
    getFacebookPagePosts,
    getTikTokVideos,
    getYouTubeVideos,
    getPinterestPins,
    type ExternalPost,
} from '@/lib/platform-api/posts-sync';

import type { PlatformComment, PlatformMention } from '@/lib/platform-api/types';

// ============================================================================
// Types
// ============================================================================

export interface EngagementSyncResult {
    organizationId: string;
    commentsAdded: number;
    commentsUpdated: number;
    mentionsAdded: number;
    mentionsUpdated: number;
    postsScanned: number;
    accountsProcessed: number;
    errors: { accountId: string; platform: string; error: string }[];
}

interface AccountSyncResult {
    commentsAdded: number;
    commentsUpdated: number;
    mentionsAdded: number;
    mentionsUpdated: number;
    postsScanned: number;
    errors: string[];
}

// ============================================================================
// Main Sync Function
// ============================================================================

/**
 * Sync all engagement data (comments + mentions) for a workspace
 *
 * Flow:
 * 1. Get all active social accounts for the workspace
 * 2. For each account:
 *    a. Fetch recent posts from the platform
 *    b. For each post, fetch and upsert comments
 *    c. Fetch and upsert account-level mentions (Instagram/Facebook only)
 * 3. Return summary of sync results
 *
 * @param organizationId - Workspace to sync
 * @param daysSince - Number of days back to fetch posts (default 30)
 */
export async function syncWorkspaceEngagement(
    organizationId: string,
    daysSince: number = 30
): Promise<EngagementSyncResult> {
    const since = new Date();
    since.setDate(since.getDate() - daysSince);

    const result: EngagementSyncResult = {
        organizationId,
        commentsAdded: 0,
        commentsUpdated: 0,
        mentionsAdded: 0,
        mentionsUpdated: 0,
        postsScanned: 0,
        accountsProcessed: 0,
        errors: [],
    };

    // Get all active social accounts
    const accounts = await db.socialAccount.findMany({
        where: {
            organizationId,
            isActive: true,
        },
    });

    logger.info(
        { organizationId, accountCount: accounts.length, daysSince },
        'Starting workspace engagement sync'
    );

    // Process each account
    for (const account of accounts) {
        try {
            const accountResult = await syncAccountEngagement(account, since);

            result.commentsAdded += accountResult.commentsAdded;
            result.commentsUpdated += accountResult.commentsUpdated;
            result.mentionsAdded += accountResult.mentionsAdded;
            result.mentionsUpdated += accountResult.mentionsUpdated;
            result.postsScanned += accountResult.postsScanned;
            result.accountsProcessed++;

            // Collect errors
            for (const error of accountResult.errors) {
                result.errors.push({
                    accountId: account.id,
                    platform: account.platform,
                    error,
                });
            }

            // Rate limiting - wait between accounts
            await new Promise((r) => setTimeout(r, 500));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ error, accountId: account.id }, 'Account engagement sync failed');
            result.errors.push({
                accountId: account.id,
                platform: account.platform,
                error: message,
            });
        }
    }

    logger.info({ result }, 'Workspace engagement sync complete');

    return result;
}

// ============================================================================
// Account-Level Sync
// ============================================================================

/**
 * Sync engagement for a single social account
 */
async function syncAccountEngagement(
    account: SocialAccount,
    since: Date
): Promise<AccountSyncResult> {
    const result: AccountSyncResult = {
        commentsAdded: 0,
        commentsUpdated: 0,
        mentionsAdded: 0,
        mentionsUpdated: 0,
        postsScanned: 0,
        errors: [],
    };

    // Step 1: Fetch recent posts from the platform
    const posts = await fetchAccountPosts(account, since);

    if (posts.length === 0) {
        logger.debug({ accountId: account.id }, 'No posts found for account');
    }

    // Step 2: Fetch comments for each post
    for (const post of posts) {
        try {
            const commentResult = await syncPostComments(account, post.externalId);
            result.commentsAdded += commentResult.added;
            result.commentsUpdated += commentResult.updated;
            result.postsScanned++;

            // Rate limiting between posts
            await new Promise((r) => setTimeout(r, 200));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Comments for ${post.externalId}: ${message}`);
        }
    }

    // Step 3: Fetch account-level mentions (Instagram/Facebook only)
    if (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') {
        try {
            const mentionResult = await syncAccountMentions(account);
            result.mentionsAdded += mentionResult.added;
            result.mentionsUpdated += mentionResult.updated;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Mentions: ${message}`);
        }
    }

    return result;
}

// ============================================================================
// Posts Fetching
// ============================================================================

/**
 * Fetch recent posts from a platform account
 */
async function fetchAccountPosts(account: SocialAccount, since: Date): Promise<ExternalPost[]> {
    switch (account.platform) {
        case 'INSTAGRAM': {
            const result = await getInstagramMedia(account.accessToken, account.platformId, since);
            return result.success && result.data ? result.data : [];
        }
        case 'FACEBOOK': {
            const result = await getFacebookPagePosts(account.accessToken, account.platformId, since);
            return result.success && result.data ? result.data : [];
        }
        case 'TIKTOK': {
            const result = await getTikTokVideos(account.accessToken, since);
            return result.success && result.data ? result.data : [];
        }
        case 'YOUTUBE': {
            const result = await getYouTubeVideos(account.accessToken, account.platformId, since);
            return result.success && result.data ? result.data : [];
        }
        case 'PINTEREST': {
            const result = await getPinterestPins(account.accessToken, since);
            return result.success && result.data ? result.data : [];
        }
        default:
            return [];
    }
}

// ============================================================================
// Comments Sync
// ============================================================================

/**
 * Fetch and upsert comments for a single post
 */
async function syncPostComments(
    account: SocialAccount,
    platformPostId: string
): Promise<{ added: number; updated: number }> {
    let comments: PlatformComment[] = [];

    // Fetch comments from platform
    switch (account.platform) {
        case 'INSTAGRAM': {
            const result = await getInstagramComments(account.accessToken, platformPostId);
            if (result.success && result.data) {
                comments = result.data;
            }
            break;
        }
        case 'FACEBOOK': {
            const result = await getFacebookComments(account.accessToken, platformPostId);
            if (result.success && result.data) {
                comments = result.data;
            }
            break;
        }
        case 'TIKTOK': {
            const result = await getTikTokComments(account.accessToken, platformPostId);
            if (result.success && result.data) {
                comments = result.data;
            }
            break;
        }
        case 'YOUTUBE': {
            const result = await getYouTubeComments(account.accessToken, platformPostId);
            if (result.success && result.data) {
                comments = result.data;
            }
            break;
        }
        default:
            return { added: 0, updated: 0 };
    }

    // Upsert comments to database
    let added = 0;
    let updated = 0;

    for (const comment of comments) {
        try {
            const existing = await db.comment.findUnique({
                where: {
                    socialAccountId_platformCommentId: {
                        socialAccountId: account.id,
                        platformCommentId: comment.platformCommentId,
                    },
                },
            });

            await db.comment.upsert({
                where: {
                    socialAccountId_platformCommentId: {
                        socialAccountId: account.id,
                        platformCommentId: comment.platformCommentId,
                    },
                },
                create: {
                    organizationId: account.organizationId,
                    socialAccountId: account.id,
                    platformPostId: platformPostId,
                    platformCommentId: comment.platformCommentId,
                    authorId: comment.authorId,
                    authorUsername: comment.authorUsername,
                    authorAvatar: comment.authorAvatar,
                    text: comment.text,
                    likeCount: comment.likeCount || 0,
                    replyCount: comment.replyCount || 0,
                    createdAt: comment.createdAt,
                    isHidden: comment.isHidden || false,
                },
                update: {
                    text: comment.text,
                    likeCount: comment.likeCount || 0,
                    replyCount: comment.replyCount || 0,
                    isHidden: comment.isHidden || false,
                    syncedAt: new Date(),
                },
            });

            if (existing) {
                updated++;
            } else {
                added++;
            }
        } catch (error) {
            logger.debug({ error, commentId: comment.platformCommentId }, 'Comment upsert failed');
        }
    }

    // Handle parent-child relationships in a second pass
    for (const comment of comments) {
        if (comment.parentId) {
            try {
                const parent = await db.comment.findUnique({
                    where: {
                        socialAccountId_platformCommentId: {
                            socialAccountId: account.id,
                            platformCommentId: comment.parentId,
                        },
                    },
                });

                const child = await db.comment.findUnique({
                    where: {
                        socialAccountId_platformCommentId: {
                            socialAccountId: account.id,
                            platformCommentId: comment.platformCommentId,
                        },
                    },
                });

                if (parent && child && !child.parentId) {
                    await db.comment.update({
                        where: { id: child.id },
                        data: { parentId: parent.id },
                    });
                }
            } catch (error) {
                // Parent linking failure is non-critical
            }
        }
    }

    return { added, updated };
}

// ============================================================================
// Mentions Sync
// ============================================================================

/**
 * Fetch and upsert mentions for an account
 */
async function syncAccountMentions(
    account: SocialAccount
): Promise<{ added: number; updated: number }> {
    let mentions: PlatformMention[] = [];

    // Fetch mentions from platform
    switch (account.platform) {
        case 'INSTAGRAM': {
            const result = await getInstagramMentions(account.accessToken, account.platformId);
            if (result.success && result.data) {
                mentions = result.data;
            }
            break;
        }
        case 'FACEBOOK': {
            const result = await getFacebookMentions(account.accessToken, account.platformId);
            if (result.success && result.data) {
                mentions = result.data;
            }
            break;
        }
        default:
            return { added: 0, updated: 0 };
    }

    // Upsert mentions to database
    let added = 0;
    let updated = 0;

    for (const mention of mentions) {
        try {
            const existing = await db.mention.findUnique({
                where: {
                    socialAccountId_platformPostId_type: {
                        socialAccountId: account.id,
                        platformPostId: mention.platformPostId,
                        type: mention.type,
                    },
                },
            });

            await db.mention.upsert({
                where: {
                    socialAccountId_platformPostId_type: {
                        socialAccountId: account.id,
                        platformPostId: mention.platformPostId,
                        type: mention.type,
                    },
                },
                create: {
                    organizationId: account.organizationId,
                    socialAccountId: account.id,
                    type: mention.type,
                    platformPostId: mention.platformPostId,
                    authorId: mention.authorId,
                    authorUsername: mention.authorUsername,
                    authorAvatar: mention.authorAvatar,
                    text: mention.text,
                    mediaUrl: mention.mediaUrl,
                    createdAt: mention.createdAt,
                },
                update: {
                    authorUsername: mention.authorUsername,
                    authorAvatar: mention.authorAvatar,
                    text: mention.text,
                    mediaUrl: mention.mediaUrl,
                    syncedAt: new Date(),
                },
            });

            if (existing) {
                updated++;
            } else {
                added++;
            }
        } catch (error) {
            logger.debug({ error, mentionPostId: mention.platformPostId }, 'Mention upsert failed');
        }
    }

    return { added, updated };
}
