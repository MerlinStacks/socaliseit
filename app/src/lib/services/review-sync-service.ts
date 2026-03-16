/**
 * Review Sync Service
 *
 * Why: Orchestrates fetching reviews from Google Business Profile and Facebook
 * Pages, then upserting them into the Review table. Follows the same pattern
 * as engagement-sync-service.ts for consistency.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getGoogleReviews } from '@/lib/platform-api/google-business-reviews';
import { getFacebookPageReviews } from '@/lib/platform-api/facebook-api';
import { withTokenRefreshRetry } from '@/lib/services/token-service';
import type { Platform } from '@/generated/prisma/client';

// ============================================================================
// Types
// ============================================================================

interface ReviewSyncResult {
    organizationId: string;
    reviewsAdded: number;
    reviewsUpdated: number;
    accountsProcessed: number;
    errors: { accountId: string; platform: string; error: string }[];
}

// ============================================================================
// Main Sync
// ============================================================================

/**
 * Sync reviews from all Google Business and Facebook accounts in a workspace.
 *
 * @param organizationId - Workspace to sync reviews for
 */
export async function syncWorkspaceReviews(
    organizationId: string,
): Promise<ReviewSyncResult> {
    const result: ReviewSyncResult = {
        organizationId,
        reviewsAdded: 0,
        reviewsUpdated: 0,
        accountsProcessed: 0,
        errors: [],
    };

    const accounts = await db.socialAccount.findMany({
        where: {
            organizationId,
            isActive: true,
            platform: { in: ['GOOGLE_BUSINESS', 'FACEBOOK'] as Platform[] },
        },
    });

    logger.info(
        { organizationId, accountCount: accounts.length },
        'Starting review sync',
    );

    for (const account of accounts) {
        try {
            const accountResult = await syncAccountReviews(account);
            result.reviewsAdded += accountResult.added;
            result.reviewsUpdated += accountResult.updated;
            result.accountsProcessed++;
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error(
                { accountId: account.id, platform: account.platform, error: msg },
                'Review sync failed for account',
            );
            result.errors.push({
                accountId: account.id,
                platform: account.platform,
                error: msg,
            });
        }
    }

    logger.info(
        {
            organizationId,
            added: result.reviewsAdded,
            updated: result.reviewsUpdated,
            processed: result.accountsProcessed,
            errorCount: result.errors.length,
        },
        'Review sync completed',
    );

    // Why: Notify org members about newly synced reviews (push + in-app).
    if (result.reviewsAdded > 0) {
        try {
            const { sendInboxNotifications } = await import('@/lib/services/inbox-notifications');
            await sendInboxNotifications({
                organizationId,
                commentsAdded: 0,
                mentionsAdded: 0,
                dmsAdded: 0,
                reviewsAdded: result.reviewsAdded,
            });
        } catch (notifErr) {
            logger.warn({ err: notifErr }, 'Review notification dispatch failed (non-blocking)');
        }
    }

    return result;
}

// ============================================================================
// Account-Level Sync
// ============================================================================

interface AccountReviewResult {
    added: number;
    updated: number;
}

type SocialAccount = {
    id: string;
    organizationId: string;
    platform: Platform;
    platformId: string;
    accessToken: string;
};

/**
 * Fetch and upsert reviews for a single social account.
 *
 * Why: Uses withTokenRefreshRetry to proactively refresh expired OAuth tokens
 * before API calls, fixing 401 errors from Google Business / Facebook.
 */
async function syncAccountReviews(
    account: SocialAccount,
): Promise<AccountReviewResult> {
    let added = 0;
    let updated = 0;

    if (account.platform === 'GOOGLE_BUSINESS') {
        const res = await withTokenRefreshRetry(account.id, async (accessToken) => {
            const result = await getGoogleReviews(accessToken, account.platformId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch Google reviews');
            }
            return result;
        });

        for (const review of res.reviews) {
            const existing = await db.review.findUnique({
                where: {
                    socialAccountId_platformReviewId: {
                        socialAccountId: account.id,
                        platformReviewId: review.platformReviewId,
                    },
                },
            });

            if (existing) {
                await db.review.update({
                    where: { id: existing.id },
                    data: {
                        rating: review.rating,
                        text: review.text,
                        replyText: review.replyText,
                        isReplied: review.isReplied,
                        syncedAt: new Date(),
                    },
                });
                updated++;
            } else {
                await db.review.create({
                    data: {
                        organizationId: account.organizationId,
                        socialAccountId: account.id,
                        platformReviewId: review.platformReviewId,
                        authorName: review.authorName,
                        authorAvatar: review.authorAvatar,
                        rating: review.rating,
                        text: review.text,
                        replyText: review.replyText,
                        isReplied: review.isReplied,
                        platform: 'GOOGLE_BUSINESS',
                        reviewUrl: review.reviewUrl,
                        createdAt: new Date(review.createdAt),
                    },
                });
                added++;
            }
        }

        // Why (BUG-61): Prune reviews that were deleted upstream. If Google no longer
        // returns a review, it was removed and should not stay in the DB.
        // Guard: Skip pruning if the API returned zero reviews — this may indicate
        // a pagination issue or API error, not that all reviews were deleted.
        if (res.reviews.length > 0) {
            const livePlatformIds = new Set(res.reviews.map((r) => r.platformReviewId));
            const { count: pruned } = await db.review.deleteMany({
                where: {
                    socialAccountId: account.id,
                    platform: 'GOOGLE_BUSINESS',
                    platformReviewId: { notIn: [...livePlatformIds] },
                },
            });
            if (pruned > 0) {
                logger.info({ accountId: account.id, pruned }, 'Pruned stale Google reviews');
            }
        } else {
            logger.warn({ accountId: account.id }, 'Google API returned zero reviews — skipping prune to avoid data loss');
        }
    }

    if (account.platform === 'FACEBOOK') {
        const res = await withTokenRefreshRetry(account.id, async (accessToken) => {
            const result = await getFacebookPageReviews(accessToken, account.platformId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch Facebook reviews');
            }
            return result;
        });

        for (const review of res.data || []) {
            const existing = await db.review.findUnique({
                where: {
                    socialAccountId_platformReviewId: {
                        socialAccountId: account.id,
                        platformReviewId: review.platformReviewId,
                    },
                },
            });

            if (existing) {
                // Why: Only sync fields Facebook actually provides. The ratings
                // API doesn't expose reply data, so we preserve any replyText
                // and isReplied values already stored from in-app replies.
                await db.review.update({
                    where: { id: existing.id },
                    data: {
                        rating: review.rating,
                        text: review.text,
                        syncedAt: new Date(),
                    },
                });
                updated++;
            } else {
                await db.review.create({
                    data: {
                        organizationId: account.organizationId,
                        socialAccountId: account.id,
                        platformReviewId: review.platformReviewId,
                        authorName: review.authorName,
                        authorAvatar: review.authorAvatar,
                        rating: review.rating,
                        text: review.text,
                        isReplied: false,
                        platform: 'FACEBOOK',
                        reviewUrl: review.reviewUrl,
                        createdAt: new Date(review.createdAt),
                    },
                });
                added++;
            }
        }

        // Why (BUG-61): Same guard as Google — skip pruning if API returned zero reviews.
        const fbReviews = res.data || [];
        if (fbReviews.length > 0) {
            const liveFbIds = new Set(fbReviews.map((r) => r.platformReviewId));
            const { count: prunedFb } = await db.review.deleteMany({
                where: {
                    socialAccountId: account.id,
                    platform: 'FACEBOOK',
                    platformReviewId: { notIn: [...liveFbIds] },
                },
            });
            if (prunedFb > 0) {
                logger.info({ accountId: account.id, pruned: prunedFb }, 'Pruned stale Facebook reviews');
            }
        } else {
            logger.warn({ accountId: account.id }, 'Facebook API returned zero reviews — skipping prune to avoid data loss');
        }
    }

    logger.debug(
        { accountId: account.id, platform: account.platform, added, updated },
        'Account review sync complete',
    );

    return { added, updated };
}

