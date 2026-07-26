/**
 * Posts Sync Worker
 * Processes scheduled posts import jobs via BullMQ
 *
 * Why: Users want externally-published posts to appear in their calendar
 * automatically, without having to trigger a manual sync.
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { PostsSyncJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { syncWorkspacePosts } from '@/lib/services/posts-sync-service';

/**
 * Process a single posts sync job.
 * Imports recently-published posts from all connected platform accounts.
 */
async function processPostsSync(job: Job<PostsSyncJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'posts-sync');
    const { organizationId, daysSince } = job.data;

    log.info({ organizationId, daysSince }, 'Starting posts sync job');

    try {
        const summary = await syncWorkspacePosts(organizationId, daysSince);

        const logSummary = {
            totalAccounts: summary.totalAccounts,
            attemptedAccounts: summary.attemptedAccounts,
            unsupportedAccounts: summary.unsupportedAccounts,
            successfulAccounts: summary.successfulAccounts,
            failedAccounts: summary.failedAccounts,
            totalPostsAttempted: summary.totalPostsAttempted,
            totalPostsImported: summary.totalPostsImported,
            totalPostsUpdated: summary.totalPostsUpdated,
            totalPostsSkipped: summary.totalPostsSkipped,
            ...(summary.failedAccounts > 0 && {
                errors: summary.results
                    .filter((result) => !result.success)
                    .map((result) => `${result.platform}/${result.socialAccountId}: ${result.error || 'Unknown error'}`),
            }),
        };
        if (summary.failedAccounts > 0) {
            log.warn(logSummary, 'Posts sync job completed with errors');
        } else {
            log.info(logSummary, 'Posts sync job completed');
        }
    } catch (error) {
        log.error({ err: error }, 'Posts sync job failed');
        throw error; // Re-throw to trigger BullMQ retry
    }
}

/**
 * Create and start the posts sync worker.
 */
export function createPostsSyncWorker(): Worker<PostsSyncJobData> {
    const worker = new Worker<PostsSyncJobData>('posts-sync', processPostsSync, {
        connection: getBullMQConnection(),
        concurrency: 2,
        limiter: {
            max: 3, // Lower than engagement — post fetching is heavier per-call
            duration: 60000, // Per minute
        },
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'posts-sync');
        log.error({ err }, 'Posts sync job failed');
    });

    return worker;
}
