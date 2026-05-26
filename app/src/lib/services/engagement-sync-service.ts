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
import { syncOrganizationDMs } from '@/lib/platform-api/dm-sync';
import { isPlatformEngagementSyncSupported, isPermanentTokenError } from '@/lib/sync-platforms';

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
    dmsAdded: number;
    dmsUpdated: number;
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

const TIKTOK_COMMENT_404_LOG_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const tiktokComment404LastLoggedAt = new Map<string, number>();

function shouldLogTikTok404(accountId: string, platformPostId: string, nowMs: number): boolean {
    const key = `${accountId}:${platformPostId}`;
    const lastLoggedAt = tiktokComment404LastLoggedAt.get(key);
    if (lastLoggedAt !== undefined && nowMs - lastLoggedAt < TIKTOK_COMMENT_404_LOG_COOLDOWN_MS) {
        return false;
    }

    tiktokComment404LastLoggedAt.set(key, nowMs);
    return true;
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
        dmsAdded: 0,
        dmsUpdated: 0,
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

    // Why: BLUESKY, THREADS, etc. lack engagement API integrations.
    // Filtering up front avoids per-account errors and wasted API calls.
    const syncable = accounts.filter((a) => isPlatformEngagementSyncSupported(a.platform));
    const skippedCount = accounts.length - syncable.length;
    if (skippedCount > 0) {
        logger.debug({ skippedCount, organizationId }, 'Skipped unsupported platform accounts for engagement sync');
    }

    // Why: Process accounts in concurrent batches of 3 instead of sequentially.
    // For orgs with 10+ accounts, this cuts sync time by ~60%.
    const BATCH_SIZE = 3;
    for (let i = 0; i < syncable.length; i += BATCH_SIZE) {
        const batch = syncable.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
            batch.map(async (account) => {
                const accountResult = await syncAccountEngagement(account, since);
                return { account, accountResult };
            })
        );

        for (const [idx, settled] of batchResults.entries()) {
            if (settled.status === 'fulfilled') {
                const { account, accountResult } = settled.value;
                result.commentsAdded += accountResult.commentsAdded;
                result.commentsUpdated += accountResult.commentsUpdated;
                result.mentionsAdded += accountResult.mentionsAdded;
                result.mentionsUpdated += accountResult.mentionsUpdated;
                result.postsScanned += accountResult.postsScanned;
                result.accountsProcessed++;

                for (const error of accountResult.errors) {
                    result.errors.push({ accountId: account.id, platform: account.platform, error });
                    if (isPermanentTokenError(error)) {
                        logger.warn({ accountId: account.id, platform: account.platform }, 'Deactivating account due to permanent token error — user must reconnect');
                        await db.socialAccount.update({ where: { id: account.id }, data: { isActive: false } });
                        await db.notification.create({
                            data: {
                                organizationId: account.organizationId,
                                type: 'warning',
                                title: `${account.platform} account disconnected`,
                                message: `Your ${account.platform} account lost access and needs to be reconnected to continue syncing.`,
                                link: '/settings/accounts',
                            },
                        }).catch(() => { /* non-blocking */ });
                    }
                }
            } else {
                const account = batch[idx];
                const message = settled.reason instanceof Error ? settled.reason.message : 'Unknown error';
                logger.error({ error: settled.reason, accountId: account.id }, 'Account engagement sync failed');
                if (isPermanentTokenError(message)) {
                    await db.socialAccount.update({ where: { id: account.id }, data: { isActive: false } });
                    await db.notification.create({
                        data: {
                            organizationId: account.organizationId,
                            type: 'warning',
                            title: `${account.platform} account disconnected`,
                            message: `Your ${account.platform} account lost access and needs to be reconnected to continue syncing.`,
                            link: '/settings/accounts',
                        },
                    }).catch(() => { /* non-blocking */ });
                }
                result.errors.push({ accountId: account.id, platform: account.platform, error: message });
            }
        }

        // Rate limiting between batches
        if (i + BATCH_SIZE < syncable.length) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    // Why: Suppress noisy logs when nothing changed — only emit info when data was actually added/updated.
    const hasChanges = result.commentsAdded > 0 || result.commentsUpdated > 0 ||
        result.mentionsAdded > 0 || result.mentionsUpdated > 0;
    if (hasChanges || result.errors.length > 0) {
        logger.info({ result }, 'Workspace engagement sync complete');
    } else {
        logger.debug({ organizationId, accountsProcessed: result.accountsProcessed }, 'Workspace engagement sync — no changes');
    }

    // Also sync DMs for Instagram/Facebook accounts
    try {
        const dmResult = await syncOrganizationDMs(organizationId);
        result.dmsAdded = dmResult.totalAdded;
        result.dmsUpdated = dmResult.totalUpdated;

        for (const dmError of dmResult.errors) {
            result.errors.push({
                accountId: dmError.accountId,
                platform: 'DM',
                error: dmError.error,
            });
        }

        logger.info(
            { dmsAdded: dmResult.totalAdded, dmsUpdated: dmResult.totalUpdated },
            'DM sync complete'
        );
    } catch (error) {
        logger.error({ error }, 'DM sync failed');
        result.errors.push({
            accountId: 'organization',
            platform: 'DM',
            error: error instanceof Error ? error.message : 'DM sync failed',
        });
    }

    // Why (BUG-31): Previously syncPlatformAnalytics() was called here, causing
    // analytics to run every 15 min (engagement schedule) instead of every 6 hrs
    // (analytics-sync-worker schedule). Removed — analytics-sync-worker.ts handles it.

    // Why: Notify org members about newly synced inbox items (push + in-app).
    // Only fires when items were actually added, not for updates.
    try {
        const { sendInboxNotifications } = await import('@/lib/services/inbox-notifications');
        await sendInboxNotifications({
            organizationId,
            commentsAdded: result.commentsAdded,
            mentionsAdded: result.mentionsAdded,
            dmsAdded: result.dmsAdded,
            reviewsAdded: 0, // Reviews are notified separately by review-sync-service
        });
    } catch (notifErr) {
        logger.warn({ err: notifErr }, 'Inbox notification dispatch failed (non-blocking)');
    }

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

    // Get a fresh, decrypted access token before any API calls.
    // Why: account.accessToken from DB may be encrypted (enc: prefix) or expired.
    const { ensureValidToken } = await import('@/lib/services/token-service');
    const tokenResult = await ensureValidToken(account.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        result.errors.push(tokenResult.error || 'Failed to get valid token');
        return result;
    }
    /**
     * Why (HT04): Spread instead of mutating the original Prisma object.
     * Direct mutation is fragile if processing is ever parallelized.
     */
    const freshAccount = { ...account, accessToken: tokenResult.accessToken };

    // Step 1: Fetch recent posts from the platform
    const posts = await fetchAccountPosts(freshAccount, since);

    if (posts.length === 0) {
        logger.debug({ accountId: freshAccount.id }, 'No posts found for account');
    }

    // Step 2: Fetch comments for each post
    for (const post of posts) {
        try {
            const commentResult = await syncPostComments(freshAccount, post.externalId);
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
    if (freshAccount.platform === 'INSTAGRAM' || freshAccount.platform === 'FACEBOOK') {
        try {
            const mentionResult = await syncAccountMentions(freshAccount);
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
// Sentiment Classification
// ============================================================================

/**
 * Classify comment sentiment using keyword matching.
 * Why: Lightweight, zero-latency, no external API cost. Accurate enough for
 * triage filtering. AI-powered classification can be layered on top later.
 */
function classifyCommentSentiment(text: string): 'positive' | 'negative' | 'neutral' | 'question' {
    if (!text) return 'neutral';
    const lower = text.toLowerCase();

    // Questions take priority — a negative question is still a question
    if (lower.includes('?') || /\b(how|why|when|where|what|who|does|can|will|is|are|should|could|would)\b/.test(lower)) {
        return 'question';
    }

    const positiveWords = [
        'love', 'great', 'awesome', 'excellent', 'thanks', 'thank', 'amazing', 'fantastic',
        'wonderful', 'perfect', 'beautiful', 'happy', 'best', 'good', 'nice', 'like',
        'helpful', 'brilliant', 'outstanding', 'incredible', 'superb', 'delightful', 'glad',
    ];
    const negativeWords = [
        'hate', 'worst', 'terrible', 'awful', 'horrible', 'disgusting', 'disappointed',
        'disappointing', 'poor', 'useless', 'broken', 'scam', 'refund', 'bad', 'issue',
        'problem', 'fix', 'fail', 'failed', 'wrong', 'error', 'never', 'waste', 'ridiculous',
        'unacceptable', 'disgraceful', 'pathetic',
    ];

    const positiveCount = positiveWords.filter((w) => lower.includes(w)).length;
    const negativeCount = negativeWords.filter((w) => lower.includes(w)).length;

    if (negativeCount > positiveCount) return 'negative';
    if (positiveCount > negativeCount) return 'positive';
    return 'neutral';
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
            } else if (!result.success) {
                const logContext = {
                    accountId: account.id,
                    platformPostId,
                    errorCode: result.errorCode,
                    error: result.error,
                };

                if (result.errorCode === 'HTTP_404') {
                    if (shouldLogTikTok404(account.id, platformPostId, Date.now())) {
                        logger.debug(logContext, 'TikTok comment fetch unavailable for video');
                    }
                } else {
                    logger.warn(logContext, 'TikTok comment fetch failed');
                }
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

    // Why: Pre-fetch existing comment IDs so we can detect new vs existing records
    // without relying on syncedAt (@default(now()) makes it always set, even on create).
    const existingCommentIds = new Set(
        (await db.comment.findMany({
            where: { socialAccountId: account.id, platformPostId: platformPostId },
            select: { platformCommentId: true },
        })).map((c) => c.platformCommentId)
    );

    for (const comment of comments) {
        try {
            const isNew = !existingCommentIds.has(comment.platformCommentId);
            // Only classify sentiment for new comments — no need to re-run on every sync
            const sentiment = isNew && comment.text ? classifyCommentSentiment(comment.text) : undefined;

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
                    sentiment,
                    likeCount: comment.likeCount || 0,
                    replyCount: comment.replyCount || 0,
                    createdAt: comment.createdAt,
                    isHidden: comment.isHidden || false,
                },
                update: {
                    text: comment.text,
                    authorAvatar: comment.authorAvatar,
                    likeCount: comment.likeCount || 0,
                    replyCount: comment.replyCount || 0,
                    isHidden: comment.isHidden || false,
                    syncedAt: new Date(),
                },
            });

            if (!isNew) {
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

    // Fetch all existing mention keys for this batch in one query (avoids N+1)
    const existingMentions = await db.mention.findMany({
        where: {
            socialAccountId: account.id,
            platformPostId: { in: mentions.map(m => m.platformPostId) },
        },
        select: { platformPostId: true, type: true },
    });
    const existingKeys = new Set(
        existingMentions.map(m => `${m.platformPostId}:${m.type}`)
    );

    let added = 0;
    let updated = 0;

    for (const mention of mentions) {
        try {
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

            if (existingKeys.has(`${mention.platformPostId}:${mention.type}`)) {
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
