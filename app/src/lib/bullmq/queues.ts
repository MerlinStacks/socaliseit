/**
 * BullMQ Queue Definitions
 * Centralized queue configuration for all background jobs
 */

import { Queue, QueueOptions } from 'bullmq';
import { getBullMQConnection } from './connection';

/**
 * Creates queue options with required connection.
 * We use a function to ensure connection is always defined.
 */
function createQueueOptions(): QueueOptions {
    return {
        connection: getBullMQConnection(),
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
            removeOnComplete: {
                age: 24 * 60 * 60, // Keep completed jobs for 24 hours
                count: 1000, // Keep last 1000 completed jobs
            },
            removeOnFail: {
                age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
            },
        },
    };
}

// ============================================================================
// QUEUE DEFINITIONS
// ============================================================================

/**
 * Post Publishing Queue
 * Handles scheduled and immediate post publishing to social platforms.
 */
const baseOptions = createQueueOptions();

export const postPublishQueue = new Queue('post-publish', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 5, // More retries for critical publishing
    },
});

/**
 * Video Rendering Queue
 * Handles FFmpeg-based video rendering jobs (Remotion exports).
 */
export const videoRenderQueue = new Queue('video-render', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 2, // Fewer retries for long-running jobs
    },
});

/**
 * Analytics Sync Queue
 * Fetches platform analytics data periodically.
 */
export const analyticsSyncQueue = new Queue('analytics-sync', baseOptions);

/**
 * Email Digest Queue
 * Sends scheduled email digests to users.
 */
export const emailDigestQueue = new Queue('email-digest', baseOptions);

/**
 * Media Maintenance Queue
 * Handles thumbnail regeneration and cleanup tasks.
 */
export const mediaMaintenanceQueue = new Queue('media-maintenance', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 1, // Don't retry maintenance jobs
    },
});

// ============================================================================
// JOB DATA TYPES
// ============================================================================

/** Job data for post publishing */
export interface PostPublishJobData {
    postId: string;
    organizationId: string;
    platformIds: string[];
    scheduledAt?: string;
    isRetry?: boolean;
}

/** Job data for video rendering */
export interface VideoRenderJobData {
    projectId: string;
    organizationId: string;
    outputFormat: 'mp4' | 'webm';
    quality: 'draft' | 'high';
}

/** Job data for analytics sync */
export interface AnalyticsSyncJobData {
    organizationId: string;
    socialAccountId: string;
    syncType: 'full' | 'incremental';
}

/** Job data for email digest */
export interface EmailDigestJobData {
    organizationId: string;
    userId: string;
    digestType: 'daily' | 'weekly' | 'monthly';
}

/** Job data for thumbnail regeneration */
export interface ThumbnailRegenerationJobData {
    mediaId?: string;
    skipMissing?: boolean;
}

// ============================================================================
// QUEUE REGISTRY
// ============================================================================

/** All queues for graceful shutdown */
export const allQueues = [
    postPublishQueue,
    videoRenderQueue,
    analyticsSyncQueue,
    emailDigestQueue,
    mediaMaintenanceQueue,
];

/**
 * Schedule repeating analytics sync for a organization.
 * Runs every 6 hours to keep engagement metrics fresh.
 */
export async function scheduleWorkspaceAnalyticsSync(organizationId: string): Promise<void> {
    const jobId = `analytics-repeat-${organizationId}`;

    // Remove any existing repeating job for this workspace
    await analyticsSyncQueue.removeRepeatableByKey(jobId);

    // Add new repeating job
    await analyticsSyncQueue.add('scheduled-sync', {
        organizationId,
        socialAccountId: 'all',
        syncType: 'full',
    }, {
        repeat: {
            every: 6 * 60 * 60 * 1000, // Every 6 hours
        },
        jobId,
    });
}

/**
 * Schedule daily thumbnail regeneration.
 * Runs every 24 hours to regenerate missing video thumbnails.
 */
export async function scheduleThumbnailRegeneration(): Promise<void> {
    const jobId = 'thumbnail-regen-daily';

    // Remove any existing repeating job
    const existingJobs = await mediaMaintenanceQueue.getRepeatableJobs();
    for (const job of existingJobs) {
        if (job.id === jobId || job.name === 'regenerate-thumbnails') {
            await mediaMaintenanceQueue.removeRepeatableByKey(job.key);
        }
    }

    // Add new repeating job - runs every 24 hours
    await mediaMaintenanceQueue.add(
        'regenerate-thumbnails',
        { skipMissing: true },
        {
            repeat: {
                every: 24 * 60 * 60 * 1000, // Every 24 hours
            },
            jobId,
        }
    );
}

/**
 * Trigger immediate thumbnail regeneration.
 * Can be called from admin API to force regeneration.
 */
export async function triggerThumbnailRegeneration(
    mediaId?: string
): Promise<string> {
    const job = await mediaMaintenanceQueue.add(
        'regenerate-thumbnails',
        { mediaId, skipMissing: true },
        { jobId: mediaId ? `regen-${mediaId}` : `regen-manual-${Date.now()}` }
    );
    return job.id ?? 'unknown';
}

/**
 * Close all queue connections gracefully.
 * Should be called during application shutdown.
 */
export async function closeAllQueues(): Promise<void> {
    await Promise.all(allQueues.map((queue) => queue.close()));
}
