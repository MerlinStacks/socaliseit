/**
 * Review Reply API
 * POST /api/reviews/reply — Send a reply to a Google Business or Facebook review
 *
 * Why: Routes reply to the correct platform API based on the review's platform,
 * then updates the local Review record with the reply text.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { replyToGoogleReview } from '@/lib/platform-api/google-business-reviews';
import { replyToFacebookReview } from '@/lib/platform-api/facebook-api';
import { withTokenRefreshRetry } from '@/lib/services/token-service';

const RequestSchema = z.object({
    /** Database ID of the Review record */
    reviewId: z.string().min(1),
    /** Reply text to post */
    text: z.string().min(1).max(4096),
});

export async function POST(request: NextRequest) {
    let reviewDbId: string | null = null;
    let reviewPlatform: string | null = null;
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;

        const body = await request.json();
        const data = RequestSchema.parse(body);

        // Fetch the review with its social account
        const review = await db.review.findFirst({
            where: { id: data.reviewId, organizationId },
            include: { socialAccount: true },
        });

        if (!review) {
            return NextResponse.json({ error: 'Review not found' }, { status: 404 });
        }

        reviewDbId = review.id;
        reviewPlatform = review.platform;
        const { socialAccount } = review;

        // Route to the correct platform API with automatic token refresh
        if (review.platform === 'GOOGLE_BUSINESS') {
            await withTokenRefreshRetry(socialAccount.id, async (accessToken) => {
                const result = await replyToGoogleReview(
                    accessToken,
                    socialAccount.platformId,
                    review.platformReviewId,
                    data.text,
                );
                if (!result.success) {
                    // Why: Attach statusCode so the outer catch can distinguish 404 from other failures
                    const err = new Error(result.error || 'Failed to reply on Google');
                    (err as Error & { statusCode?: number }).statusCode = result.statusCode;
                    throw err;
                }
                return result;
            });
        } else if (review.platform === 'FACEBOOK') {
            await withTokenRefreshRetry(socialAccount.id, async (accessToken) => {
                const result = await replyToFacebookReview(
                    accessToken,
                    review.platformReviewId,
                    data.text,
                );
                if (!result.success) {
                    // Why: Attach statusCode so the outer catch can distinguish 404 from other failures
                    const err = new Error(result.error || 'Failed to reply on Facebook');
                    (err as Error & { statusCode?: number }).statusCode = result.errorCode
                        ? parseInt(result.errorCode, 10)
                        : undefined;
                    throw err;
                }
                return result;
            });
        } else {
            return NextResponse.json(
                { error: `Review replies not supported for ${review.platform}` },
                { status: 400 },
            );
        }

        // Update the local record
        await db.review.update({
            where: { id: review.id },
            data: {
                replyText: data.text,
                isReplied: true,
            },
        });

        logger.info(
            { reviewId: review.id, platform: review.platform },
            'Review reply posted successfully',
        );

        return NextResponse.json({
            success: true,
            data: { reviewId: review.id },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request', details: error.issues },
                { status: 400 },
            );
        }

        // Why: When the platform returns 404, the review was deleted upstream.
        // Clean up the stale record so the user doesn't keep retrying.
        const statusCode = (error as Error & { statusCode?: number }).statusCode;
        if (statusCode === 404 && reviewDbId) {
            await db.review.delete({ where: { id: reviewDbId } }).catch(() => {
                // Why: Silently ignore if already deleted (race condition)
            });
            logger.info({ reviewId: reviewDbId }, 'Deleted stale review after platform 404');
            const platformLabel = reviewPlatform === 'FACEBOOK' ? 'Facebook' : 'Google';
            return NextResponse.json(
                { error: `This review no longer exists on ${platformLabel} and has been removed.` },
                { status: 404 },
            );
        }

        const message = error instanceof Error ? error.message : 'Failed to send reply';
        logger.error({ error }, 'Review reply error');
        return NextResponse.json(
            { error: message },
            { status: 500 },
        );
    }
}
