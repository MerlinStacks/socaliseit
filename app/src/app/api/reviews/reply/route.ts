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

const RequestSchema = z.object({
    /** Database ID of the Review record */
    reviewId: z.string().min(1),
    /** Reply text to post */
    text: z.string().min(1).max(4096),
});

export async function POST(request: NextRequest) {
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

        const { socialAccount } = review;

        // Route to the correct platform API
        if (review.platform === 'GOOGLE_BUSINESS') {
            const result = await replyToGoogleReview(
                socialAccount.accessToken,
                socialAccount.platformId,
                review.platformReviewId,
                data.text,
            );

            if (!result.success) {
                return NextResponse.json(
                    { error: result.error || 'Failed to reply on Google' },
                    { status: 500 },
                );
            }
        } else if (review.platform === 'FACEBOOK') {
            const result = await replyToFacebookReview(
                socialAccount.accessToken,
                review.platformReviewId,
                data.text,
            );

            if (!result.success) {
                return NextResponse.json(
                    { error: result.error || 'Failed to reply on Facebook' },
                    { status: 500 },
                );
            }
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

        logger.error({ error }, 'Review reply error');
        return NextResponse.json(
            { error: 'Failed to send reply' },
            { status: 500 },
        );
    }
}
