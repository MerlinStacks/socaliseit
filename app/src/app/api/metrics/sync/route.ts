/**
 * Metrics Sync API Route
 * Triggers automated metrics synchronization
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncAllMetrics, getAggregatedMetrics } from '@/lib/services/metrics-sync';

/**
 * POST /api/metrics/sync
 * Trigger metrics sync for current workspace
 */
export async function POST() {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const results = await syncAllMetrics(session.user.currentWorkspaceId);

        const summary = {
            platforms: results.length,
            totalPostsUpdated: results.reduce((sum, r) => sum + r.postsUpdated, 0),
            byPlatform: results.map((r) => ({
                platform: r.platform,
                postsUpdated: r.postsUpdated,
                errorCount: r.errors.length,
            })),
            errors: results.flatMap((r) => r.errors),
        };

        return NextResponse.json({ success: true, summary });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * GET /api/metrics/sync
 * Get aggregated metrics for the workspace
 */
export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const metrics = await getAggregatedMetrics(
        session.user.currentWorkspaceId,
        startDate,
        endDate
    );

    return NextResponse.json({
        period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        metrics
    });
}
