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

/**
 * Stale Post Cleanup Queue
 * Detects and resets posts stuck in PUBLISHING status.
 */
export const stalePostCleanupQueue = new Queue('stale-post-cleanup', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 1, // Single attempt for cleanup
    },
});

/**
 * Engagement Sync Queue
 * Fetches comments, mentions, and DMs from platform APIs periodically.
 */
export const engagementSyncQueue = new Queue('engagement-sync', baseOptions);

/**
 * Posts Sync Queue
 * Imports externally-published posts from platform APIs periodically.
 */
export const postsSyncQueue = new Queue('posts-sync', baseOptions);

/**
 * Notification Reminder Queue
 * Sends push notifications when non-auto-publish posts reach their scheduled time.
 */
export const notificationReminderQueue = new Queue('notification-reminder', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 3,
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

/** Job data for stale post cleanup */
export interface StalePostCleanupJobData {
    type: 'cleanup';
}

/** Job data for publish reminder notifications */
export interface NotificationReminderJobData {
    postId: string;
    organizationId: string;
    caption: string;
    platform: string;
}

/** Job data for engagement sync (comments, mentions, DMs) */
export interface EngagementSyncJobData {
    organizationId: string;
    /** Number of days back to scan for engagement */
    daysSince: number;
}

/** Job data for posts import */
export interface PostsSyncJobData {
    organizationId: string;
    /** Number of days back to import posts */
    daysSince: number;
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
    stalePostCleanupQueue,
    notificationReminderQueue,
    engagementSyncQueue,
    postsSyncQueue,
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
 * Schedule stale post cleanup.
 * Runs every 5 minutes to detect and reset stuck posts.
 */
export async function scheduleStalePostCleanup(): Promise<void> {
    const jobId = 'stale-post-cleanup-repeat';

    // Remove any existing repeating job
    const existingJobs = await stalePostCleanupQueue.getRepeatableJobs();
    for (const job of existingJobs) {
        if (job.id === jobId || job.name === 'cleanup') {
            await stalePostCleanupQueue.removeRepeatableByKey(job.key);
        }
    }

    // Add new repeating job - runs every 5 minutes
    await stalePostCleanupQueue.add(
        'cleanup',
        { type: 'cleanup' },
        {
            repeat: {
                every: 5 * 60 * 1000, // Every 5 minutes
            },
            jobId,
        }
    );
}

/**
 * Schedule repeating engagement sync for a workspace.
 * Runs every 15 minutes to keep DMs, comments, and mentions fresh.
 */
export async function scheduleWorkspaceEngagementSync(organizationId: string): Promise<void> {
    const jobId = `engagement-repeat-${organizationId}`;

    await engagementSyncQueue.removeRepeatableByKey(jobId);

    await engagementSyncQueue.add('scheduled-engagement-sync', {
        organizationId,
        daysSince: 7,
    }, {
        repeat: {
            every: 15 * 60 * 1000, // Every 15 minutes
        },
        jobId,
    });
}

/**
 * Schedule repeating posts import for a workspace.
 * Runs every 4 hours to import externally-published posts.
 */
export async function scheduleWorkspacePostsSync(organizationId: string): Promise<void> {
    const jobId = `posts-repeat-${organizationId}`;

    await postsSyncQueue.removeRepeatableByKey(jobId);

    await postsSyncQueue.add('scheduled-posts-sync', {
        organizationId,
        daysSince: 7,
    }, {
        repeat: {
            every: 4 * 60 * 60 * 1000, // Every 4 hours
        },
        jobId,
    });
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
