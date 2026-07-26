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

    // Why: Process accounts in concurrent batches of 3 instead of sequentially.
    // Same pattern as engagement sync and posts sync.
    const BATCH_SIZE = 3;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
            batch.map(async (account) => {
                const accountResult = await syncAccountReviews(account);
                return { account, accountResult };
            })
        );

        for (const [idx, settled] of batchResults.entries()) {
            if (settled.status === 'fulfilled') {
                result.reviewsAdded += settled.value.accountResult.added;
                result.reviewsUpdated += settled.value.accountResult.updated;
                result.accountsProcessed++;
            } else {
                const account = batch[idx];
                const msg = settled.reason instanceof Error ? settled.reason.message : 'Unknown error';
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

type ExistingReview = {
    platformReviewId: string;
    authorName: string;
    authorAvatar: string | null;
    rating: number;
    text: string | null;
    replyText: string | null;
    isReplied: boolean;
    reviewUrl: string | null;
};

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

        const existingReviews = await db.review.findMany({
            where: {
                organizationId: account.organizationId,
                socialAccountId: account.id,
                platform: 'GOOGLE_BUSINESS',
            },
            select: {
                platformReviewId: true,
                authorName: true,
                authorAvatar: true,
                rating: true,
                text: true,
                replyText: true,
                isReplied: true,
                reviewUrl: true,
            },
        });
        const existingById = new Map(existingReviews.map((review) => [review.platformReviewId, review]));

        for (const review of res.reviews) {
            const existing = existingById.get(review.platformReviewId);
            await db.review.upsert({
                where: {
                    socialAccountId_platformReviewId: {
                        socialAccountId: account.id,
                        platformReviewId: review.platformReviewId,
                    },
                },
                update: {
                    authorName: review.authorName,
                    authorAvatar: review.authorAvatar,
                    rating: review.rating,
                    text: review.text,
                    replyText: review.replyText,
                    isReplied: review.isReplied,
                    reviewUrl: review.reviewUrl,
                    syncedAt: new Date(),
                },
                create: {
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

            if (!existing) {
                added++;
            } else if (googleReviewChanged(existing, review)) {
                updated++;
            }
        }

        if (res.complete) {
            const livePlatformIds = res.reviews.map((review) => review.platformReviewId);
            const { count: pruned } = await db.review.deleteMany({
                where: {
                    organizationId: account.organizationId,
                    socialAccountId: account.id,
                    platform: 'GOOGLE_BUSINESS',
                    ...(livePlatformIds.length > 0 && { platformReviewId: { notIn: livePlatformIds } }),
                },
            });
            if (pruned > 0) {
                logger.info({ accountId: account.id, pruned }, 'Pruned stale Google reviews');
            }
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

        const existingReviews = await db.review.findMany({
            where: {
                organizationId: account.organizationId,
                socialAccountId: account.id,
                platform: 'FACEBOOK',
            },
            select: {
                platformReviewId: true,
                authorName: true,
                authorAvatar: true,
                rating: true,
                text: true,
                replyText: true,
                isReplied: true,
                reviewUrl: true,
            },
        });
        const existingById = new Map(existingReviews.map((review) => [review.platformReviewId, review]));

        for (const review of res.data || []) {
            const existing = existingById.get(review.platformReviewId);
            await db.review.upsert({
                where: {
                    socialAccountId_platformReviewId: {
                        socialAccountId: account.id,
                        platformReviewId: review.platformReviewId,
                    },
                },
                update: {
                    // Why: Only sync fields Facebook actually provides. The ratings
                    // API doesn't expose reply data, so we preserve existing replyText/isReplied.
                    authorName: review.authorName,
                    authorAvatar: review.authorAvatar,
                    rating: review.rating,
                    text: review.text,
                    reviewUrl: review.reviewUrl,
                    syncedAt: new Date(),
                },
                create: {
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

            if (!existing) {
                added++;
            } else if (facebookReviewChanged(existing, review)) {
                updated++;
            }
        }

        const fbReviews = res.data || [];
        if (res.complete) {
            const liveFbIds = fbReviews.map((review) => review.platformReviewId);
            const { count: prunedFb } = await db.review.deleteMany({
                where: {
                    organizationId: account.organizationId,
                    socialAccountId: account.id,
                    platform: 'FACEBOOK',
                    ...(liveFbIds.length > 0 && { platformReviewId: { notIn: liveFbIds } }),
                },
            });
            if (prunedFb > 0) {
                logger.info({ accountId: account.id, pruned: prunedFb }, 'Pruned stale Facebook reviews');
            }
        }
    }

    logger.debug(
        { accountId: account.id, platform: account.platform, added, updated },
        'Account review sync complete',
    );

    return { added, updated };
}

function googleReviewChanged(
    existing: ExistingReview,
    review: Awaited<ReturnType<typeof getGoogleReviews>>['reviews'][number],
): boolean {
    return existing.authorName !== review.authorName
        || existing.authorAvatar !== review.authorAvatar
        || existing.rating !== review.rating
        || existing.text !== review.text
        || existing.replyText !== review.replyText
        || existing.isReplied !== review.isReplied
        || existing.reviewUrl !== review.reviewUrl;
}

function facebookReviewChanged(
    existing: ExistingReview,
    review: NonNullable<Awaited<ReturnType<typeof getFacebookPageReviews>>['data']>[number],
): boolean {
    return existing.authorName !== review.authorName
        || existing.authorAvatar !== review.authorAvatar
        || existing.rating !== review.rating
        || existing.text !== review.text
        || existing.reviewUrl !== review.reviewUrl;
}
