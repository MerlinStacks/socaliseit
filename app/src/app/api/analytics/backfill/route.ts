/**
 * Analytics Backfill API Route
 * Computes DailyAnalyticsSnapshot rows from historical data.
 *
 * Why: Existing PostAnalytics and PlatformAnalytics rows predate the snapshot
 * system. This endpoint retroactively builds the daily aggregates so the
 * analytics page shows complete historical trends from day one.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { backfillSnapshots } from '@/lib/services/snapshot-aggregator';
import { logger } from '@/lib/logger';

/**
 * POST /api/analytics/backfill
 * Trigger snapshot backfill for current workspace.
 *
 * Query params:
 * - days: Number of days to backfill (default 90, max 365)
 */
export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const days = Math.min(
        parseInt(searchParams.get('days') || '90', 10) || 90,
        365
    );

    try {
        logger.info({ organizationId, days }, 'Starting analytics backfill');

        const result = await backfillSnapshots(organizationId, days);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error({ error, organizationId }, 'Analytics backfill failed');
        const message = error instanceof Error ? error.message : 'Backfill failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
