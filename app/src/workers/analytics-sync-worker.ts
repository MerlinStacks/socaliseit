/**
 * Analytics Sync Worker
 * Processes scheduled analytics sync jobs via BullMQ
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { AnalyticsSyncJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { syncWorkspaceAnalytics, syncRecentPostsAnalytics } from '@/lib/platform-api/analytics-sync';

/**
 * Process an analytics sync job.
 * Fetches metrics from all connected platform APIs and stores in database.
 */
async function processAnalyticsSync(job: Job<AnalyticsSyncJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'analytics-sync');
    const { workspaceId, syncType } = job.data;

    log.info({ workspaceId, syncType }, 'Starting analytics sync job');

    try {
        // Sync account-level analytics (followers, reach, etc.)
        log.info('Syncing account-level analytics...');
        const accountResults = await syncWorkspaceAnalytics(workspaceId);

        const accountSuccess = accountResults.filter(r => r.success).length;
        const accountFailed = accountResults.filter(r => !r.success).length;
        log.info({ success: accountSuccess, failed: accountFailed }, 'Account analytics sync complete');

        // Sync post-level analytics (likes, comments, shares)
        log.info('Syncing post-level analytics...');
        const postResults = await syncRecentPostsAnalytics(workspaceId);

        const postSuccess = postResults.filter(r => r?.success).length;
        const postFailed = postResults.filter(r => r && !r.success).length;
        log.info({ success: postSuccess, failed: postFailed }, 'Post analytics sync complete');

        log.info({
            accounts: { success: accountSuccess, failed: accountFailed },
            posts: { success: postSuccess, failed: postFailed }
        }, 'Analytics sync job completed');

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
        log.info('Analytics sync job completed successfully');
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'analytics-sync');
        log.error({ err }, 'Analytics sync job failed');
    });

    return worker;
}
