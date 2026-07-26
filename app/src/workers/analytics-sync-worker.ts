/**
 * Analytics Sync Worker
 * Processes scheduled analytics sync jobs via BullMQ
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { AnalyticsSyncJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { syncPlatformAnalytics, syncPostAnalytics } from '@/lib/services/platform-analytics-sync';
import { computeDailySnapshots } from '@/lib/services/snapshot-aggregator';

/**
 * Process an analytics sync job.
 * Fetches metrics from all connected platform APIs and stores in database.
 */
async function processAnalyticsSync(job: Job<AnalyticsSyncJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'analytics-sync');
    const { organizationId, syncType } = job.data;

    log.info({ organizationId, syncType }, 'Starting analytics sync job');

    try {
        // Sync account-level analytics (followers, reach, etc.)
        log.info('Syncing account-level analytics...');
        const accountResults = await syncPlatformAnalytics(organizationId);
        log.info(
            { synced: accountResults.accountsSynced, skipped: accountResults.accountsSkipped, errors: accountResults.errors.length },
            'Account analytics sync complete'
        );

        // Sync post-level analytics (likes, comments, shares)
        log.info('Syncing post-level analytics...');
        const postResults = await syncPostAnalytics(organizationId);

        const postSuccess = postResults.filter(r => r.success).length;
        const postSkipped = postResults.filter(r => r.skipped).length;
        const failedPosts = postResults.filter(r => !r.success && !r.skipped);
        const postFailed = failedPosts.length;

        // Why (BUG-FIX): Previously only logged aggregate counts, making it
        // impossible to diagnose which posts consistently failed analytics sync.
        if (postFailed > 0) {
            log.warn({ failedPosts: failedPosts.map(r => ({ id: r.id, platform: r.platform, error: r.error })) }, `${postFailed} posts failed analytics sync`);
        }

        log.info({ total: postResults.length, success: postSuccess, skipped: postSkipped, failed: postFailed }, 'Post analytics sync complete');

        // Why: Pre-compute daily aggregates so the analytics page reads fast
        log.info('Computing daily snapshots...');
        let snapshotCount = 0;
        let snapshotError: string | undefined;
        try {
            snapshotCount = await computeDailySnapshots(organizationId);
            log.info({ snapshotCount }, 'Daily snapshots computed');
        } catch (error) {
            snapshotError = error instanceof Error ? error.message : 'Unknown snapshot error';
            log.error({ err: error }, 'Daily snapshot computation failed after analytics sync');
        }

        const hasPartialFailures = postFailed > 0 || accountResults.errors.length > 0 || Boolean(snapshotError);

        log.info({
            accounts: {
                total: accountResults.accountsSynced + accountResults.accountsSkipped + accountResults.errors.length,
                synced: accountResults.accountsSynced,
                skipped: accountResults.accountsSkipped,
                failed: accountResults.errors.length,
            },
            posts: { total: postResults.length, success: postSuccess, skipped: postSkipped, failed: postFailed },
            snapshots: { computed: snapshotCount, error: snapshotError },
        }, hasPartialFailures
            ? 'Analytics sync job completed with partial failures'
            : 'Analytics sync job completed');

    } catch (error) {
        log.error({ err: error }, 'Analytics sync job failed');
        throw error; // Re-throw to trigger BullMQ retry
    }
}

/**
 * Create and start the analytics sync worker.
 */
export function createAnalyticsSyncWorker(): Worker<AnalyticsSyncJobData> {
    const worker = new Worker<AnalyticsSyncJobData>('analytics-sync', processAnalyticsSync, {
        connection: getBullMQConnection(),
        concurrency: 2, // Process up to 2 workspaces concurrently
        limiter: {
            max: 5, // Max 5 jobs per duration (rate limiting for platform APIs)
            duration: 60000, // Per minute
        },
    });

    worker.on('completed', (job) => {
        const log = createJobLogger(job.id || 'unknown', 'analytics-sync');
        log.info('Analytics sync worker finished processing job');
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'analytics-sync');
        log.error({ err }, 'Analytics sync job failed');
    });

    return worker;
}
