/**
 * Review Sync API
 * POST /api/reviews/sync — Triggers review sync from Google Business & Facebook
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncWorkspaceReviews } from '@/lib/services/review-sync-service';
import { logger } from '@/lib/logger';

export async function POST() {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;

        logger.info({ organizationId }, 'Review sync requested');

        const result = await syncWorkspaceReviews(organizationId);

        return NextResponse.json({
            success: true,
            data: {
                reviewsAdded: result.reviewsAdded,
                reviewsUpdated: result.reviewsUpdated,
                accountsProcessed: result.accountsProcessed,
                errorCount: result.errors.length,
                errors: result.errors.slice(0, 5),
            },
        });
    } catch (error) {
        logger.error({ error }, 'Review sync failed');

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Sync failed' },
            { status: 500 },
        );
    }
}
