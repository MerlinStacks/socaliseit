/**
 * Engagement Sync Worker
 * Processes scheduled engagement sync jobs (comments, mentions, DMs) via BullMQ
 *
 * Why: DMs and comments need near-real-time ingestion so the unified inbox
 * stays current without requiring manual refreshes.
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection, getRedisConnection } from '@/lib/bullmq/connection';
import { EngagementSyncJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { syncWorkspaceEngagement } from '@/lib/services/engagement-sync-service';

/**
 * Redis keys for adaptive sync backoff.
 * Why: After several consecutive empty syncs, we skip every other run to halve
 * API calls for inactive orgs. Keys expire after 24h so orgs always resume
 * full-rate polling after a day of inactivity (in case new accounts are added).
 */
const EMPTY_CYCLE_KEY = (orgId: string) => `sync:empty-cycles:${orgId}`;
const SKIP_NEXT_KEY = (orgId: string) => `sync:skip-next:${orgId}`;
const BACKOFF_THRESHOLD = 3; // Consecutive empty syncs before backing off
const EMPTY_KEY_TTL = 24 * 60 * 60; // 24 hours in seconds
const SKIP_KEY_TTL = 90 * 60;        // 90 minutes (3× the 30-min sync interval)

/**
 * Process a single engagement sync job.
 * Fetches comments, mentions, and DMs from all connected accounts.
 */
export async function processEngagementSync(job: Job<EngagementSyncJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'engagement-sync');
    const { organizationId, daysSince } = job.data;

    const redis = getRedisConnection();

    // Adaptive backoff: skip every other run for orgs with no recent activity
    const emptyCycles = parseInt(await redis.get(EMPTY_CYCLE_KEY(organizationId)) ?? '0', 10);
    if (emptyCycles >= BACKOFF_THRESHOLD) {
        const skipNext = await redis.get(SKIP_NEXT_KEY(organizationId));
        if (skipNext) {
            await redis.del(SKIP_NEXT_KEY(organizationId));
            log.debug({ organizationId, emptyCycles }, 'Engagement sync skipped due to inactivity backoff');
            return;
        }
        // Mark next run to be skipped
        await redis.set(SKIP_NEXT_KEY(organizationId), '1', 'EX', SKIP_KEY_TTL);
    }

    log.info({ organizationId, daysSince }, 'Starting engagement sync job');

    try {
        const result = await syncWorkspaceEngagement(organizationId, daysSince);

        // Why: Reviews were previously only synced via the manual "Sync All" button.
        // Including them here ensures reviews arrive on the same 30-min schedule.
        let reviewsAdded = 0;
        let reviewsUpdated = 0;
        const reviewErrors: string[] = [];
        try {
            const { syncWorkspaceReviews } = await import('@/lib/services/review-sync-service');
            const reviewResult = await syncWorkspaceReviews(organizationId);
            reviewsAdded = reviewResult.reviewsAdded;
            reviewsUpdated = reviewResult.reviewsUpdated;
            reviewErrors.push(...reviewResult.errors.map(
                (error) => `${error.platform}/${error.accountId}: ${error.error}`
            ));
        } catch (reviewErr) {
            reviewErrors.push(reviewErr instanceof Error ? reviewErr.message : 'Review sync failed');
        }

        // Update adaptive backoff counter
        const hasNewItems = result.commentsAdded + result.mentionsAdded + result.dmsAdded + reviewsAdded > 0;
        const engagementErrors = result.errors.map((e) => `${e.platform}/${e.accountId}: ${e.error}`);
        const errors = [...engagementErrors, ...reviewErrors.map((error) => `REVIEW: ${error}`)];
        let emptyCycleCount = emptyCycles;
        if (hasNewItems) {
            // Activity found — reset backoff so we return to full 30-min polling
            await redis.del(EMPTY_CYCLE_KEY(organizationId));
            await redis.del(SKIP_NEXT_KEY(organizationId));
            emptyCycleCount = 0;
        } else if (errors.length === 0) {
            // No new items — increment counter toward backoff threshold
            const newEmptyCycles = await redis.incr(EMPTY_CYCLE_KEY(organizationId));
            // Set the 24h window once. Renewing it on every empty run prevents expiry forever.
            if (newEmptyCycles === 1) {
                await redis.expire(EMPTY_CYCLE_KEY(organizationId), EMPTY_KEY_TTL);
            }
            emptyCycleCount = newEmptyCycles;
        } else {
            // A failed run does not prove inactivity and breaks the consecutive-empty streak.
            await redis.del(EMPTY_CYCLE_KEY(organizationId));
            await redis.del(SKIP_NEXT_KEY(organizationId));
            emptyCycleCount = 0;
        }

        const summary = {
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
            errorCount: errors.length,
            emptyCycleCount,
            ...(errors.length > 0 && { errors }),
        };
        if (errors.length > 0) {
            log.warn(summary, 'Engagement sync job completed with errors');
        } else {
            log.info(summary, 'Engagement sync job completed');
        }
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

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'engagement-sync');
        log.error({ err }, 'Engagement sync job failed');
    });

    return worker;
}
