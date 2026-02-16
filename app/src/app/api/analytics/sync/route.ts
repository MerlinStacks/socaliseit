/**
 * Analytics Sync API Route
 * Triggers manual analytics synchronization
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncPlatformAnalytics, syncPostAnalytics } from '@/lib/services/platform-analytics-sync';
import { analyticsSyncQueue } from '@/lib/bullmq/queues';
import { logger } from '@/lib/logger';

/**
 * POST /api/analytics/sync
 * Trigger analytics sync for current workspace
 * 
 * Query params:
 * - async=true: Queue job for background processing (default)
 * - async=false: Run sync synchronously (slower but immediate results)
 */
export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const runAsync = searchParams.get('async') !== 'false';

    try {
        if (runAsync) {
            // Queue job for background processing
            const job = await analyticsSyncQueue.add('manual-sync', {
                organizationId,
                socialAccountId: 'all',
                syncType: 'full',
            }, {
                jobId: `manual-${organizationId}-${Date.now()}`,
            });

            logger.info({ organizationId, jobId: job.id }, 'Analytics sync job queued');

            return NextResponse.json({
                success: true,
                message: 'Analytics sync started',
                jobId: job.id,
            });
        } else {
            // Run synchronously (for testing/debugging)
            logger.info({ organizationId }, 'Running synchronous analytics sync');

            const accountResults = await syncPlatformAnalytics(organizationId);
            const postResults = await syncPostAnalytics(organizationId);

            const summary = {
                accounts: {
                    total: accountResults.accountsSynced + accountResults.accountsSkipped + accountResults.errors.length,
                    success: accountResults.accountsSynced,
                    failed: accountResults.errors.length,
                    errors: accountResults.errors.map(e => ({
                        platform: e.platform,
                        error: e.error,
                    })),
                },
                posts: {
                    total: postResults.length,
                    success: postResults.filter(r => r.success).length,
                    failed: postResults.filter(r => !r.success).length,
                },
            };

            logger.info({ organizationId, summary }, 'Synchronous analytics sync complete');

            return NextResponse.json({
                success: true,
                summary,
            });
        }
    } catch (error) {
        logger.error({ error, organizationId }, 'Analytics sync failed');
        const message = error instanceof Error ? error.message : 'Sync failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * GET /api/analytics/sync
 * Get sync status for current workspace
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    try {
        // Check for recent jobs in the queue
        const jobs = await analyticsSyncQueue.getJobs(['active', 'waiting', 'completed', 'failed']);
        const workspaceJobs = jobs.filter(j => j.data?.organizationId === organizationId);

        const recentJob = workspaceJobs[0];
        const status = recentJob
            ? await recentJob.getState()
            : null;

        return NextResponse.json({
            hasActiveSync: status === 'active' || status === 'waiting',
            lastSyncJobId: recentJob?.id || null,
            lastSyncStatus: status,
            lastSyncTime: recentJob?.finishedOn
                ? new Date(recentJob.finishedOn).toISOString()
                : null,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to get sync status');
        return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
    }
}
