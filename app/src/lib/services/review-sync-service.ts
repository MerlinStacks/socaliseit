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
 */
async function syncAccountReviews(
    account: SocialAccount,
): Promise<AccountReviewResult> {
    let added = 0;
    let updated = 0;

    if (account.platform === 'GOOGLE_BUSINESS') {
        const res = await getGoogleReviews(account.accessToken, account.platformId);

        if (!res.success) {
            throw new Error(res.error || 'Failed to fetch Google reviews');
        }

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
    }

    if (account.platform === 'FACEBOOK') {
        const res = await getFacebookPageReviews(account.accessToken, account.platformId);

        if (!res.success) {
            throw new Error(res.error || 'Failed to fetch Facebook reviews');
        }

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
                        isReplied: review.isReplied,
                        platform: 'FACEBOOK',
                        reviewUrl: review.reviewUrl,
                        createdAt: new Date(review.createdAt),
                    },
                });
                added++;
            }
        }
    }

    logger.debug(
        { accountId: account.id, platform: account.platform, added, updated },
        'Account review sync complete',
    );

    return { added, updated };
}
