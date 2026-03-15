/**
 * Engagement Sync Worker
 * Processes scheduled engagement sync jobs (comments, mentions, DMs) via BullMQ
 *
 * Why: DMs and comments need near-real-time ingestion so the unified inbox
 * stays current without requiring manual refreshes.
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { EngagementSyncJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { syncWorkspaceEngagement } from '@/lib/services/engagement-sync-service';

/**
 * Process a single engagement sync job.
 * Fetches comments, mentions, and DMs from all connected accounts.
 */
async function processEngagementSync(job: Job<EngagementSyncJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'engagement-sync');
    const { organizationId, daysSince } = job.data;

    log.info({ organizationId, daysSince }, 'Starting engagement sync job');

    try {
        const result = await syncWorkspaceEngagement(organizationId, daysSince);

        // Why: Reviews were previously only synced via the manual "Sync All" button.
        // Including them here ensures reviews arrive on the same 30-min schedule.
        let reviewsAdded = 0;
        let reviewsUpdated = 0;
        try {
            const { syncWorkspaceReviews } = await import('@/lib/services/review-sync-service');
            const reviewResult = await syncWorkspaceReviews(organizationId);
            reviewsAdded = reviewResult.reviewsAdded;
            reviewsUpdated = reviewResult.reviewsUpdated;
        } catch (reviewErr) {
            log.warn({ err: reviewErr }, 'Review sync failed (non-blocking)');
        }

        log.info({
            commentsAdded: result.commentsAdded,
            commentsUpdated: result.commentsUpdated,
            mentionsAdded: result.mentionsAdded,
            mentionsUpdated: result.mentionsUpdated,
            dmsAdded: result.dmsAdded,
            dmsUpdated: result.dmsUpdated,
            reviewsAdded,
            reviewsUpdated,
            postsScanned: result.postsScanned,
            accountsProcessed: result.accountsProcessed,
            errorCount: result.errors.length,
            // Why: Previously only errorCount was logged, making persistent failures invisible.
            ...(result.errors.length > 0 && {
                errors: result.errors.map((e) => `${e.platform}/${e.accountId}: ${e.error}`),
            }),
        }, 'Engagement sync job completed');
    } catch (error) {
        log.error({ err: error }, 'Engagement sync job failed');
        throw error; // Re-throw to trigger BullMQ retry
    }
}

/**
 * Create and start the engagement sync worker.
 */
export function createEngagementSyncWorker(): Worker<EngagementSyncJobData> {
    const worker = new Worker<EngagementSyncJobData>('engagement-sync', processEngagementSync, {
        connection: getBullMQConnection(),
        concurrency: 2,
        limiter: {
            max: 5, // Max 5 jobs per duration (rate limiting for platform APIs)
            duration: 60000, // Per minute
        },
    });

    worker.on('completed', (job) => {
        const log = createJobLogger(job.id || 'unknown', 'engagement-sync');
        log.info('Engagement sync job completed successfully');
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'engagement-sync');
        log.error({ err }, 'Engagement sync job failed');
    });

    return worker;
}
