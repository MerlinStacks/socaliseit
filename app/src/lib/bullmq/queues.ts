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
        attempts: 3, // Why: 5 retries × 5min timeout = 25+ min loops; 3 is sufficient for transient failures
        backoff: {
            type: 'exponential',
            delay: 30000, // Why: 30s (not 1s) gives platforms time to recover between retries
        },
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

/**
 * Token Refresh Queue
 * Proactively refreshes OAuth tokens before they expire.
 * Why: Prevents publish failures caused by expired tokens between user sessions.
 */
export const tokenRefreshQueue = new Queue('token-refresh', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 1, // Why: Sweep is idempotent — next run catches any missed accounts
    },
});

/**
 * Video Transcode Queue
 * Handles async H.264 transcoding of uploaded videos with progress reporting.
 * Why: Moved from synchronous upload-time transcoding so uploads return instantly.
 */
export const videoTranscodeQueue = new Queue('video-transcode', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 2, // Fewer retries for long-running FFmpeg jobs
        backoff: {
            type: 'exponential',
            delay: 10000, // 10s between retries
        },
    },
});

/**
 * Seb Proactive Queue
 * Generates daily AI coaching reports for organizations.
 */
export const sebProactiveQueue = new Queue('seb-proactive', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 1, // Expensive AI jobs should not retry aggressively.
    },
});

/**
 * Social Listening Crawler Queue
 * Crawls first-party configured RSS/sitemap/page sources periodically.
 */
export const socialListeningCrawlerQueue = new Queue('social-listening-crawler', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
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
    /** Number of times publishing was delayed while media transcode completed */
    transcodeWaitAttempts?: number;
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

/** Job data for proactive token refresh sweep */
export interface TokenRefreshJobData {
    type: 'sweep';
}

/** Job data for async video transcoding */
export interface VideoTranscodeJobData {
    mediaId: string;
    inputPath: string;
    outputDir: string;
    preset: string;
    organizationId: string;
    /** Total duration in seconds, needed for progress calculation */
    duration: number;
    /** Force MP4 output for incompatible containers such as QuickTime MOV */
    forceTranscode?: boolean;
}

/** Job data for Seb proactive report refresh */
export interface SebProactiveJobData {
    type: 'daily-refresh' | 'generate-report';
    organizationId?: string;
    userId?: string;
    reportId?: string;
    trigger?: 'PROACTIVE' | 'MANUAL';
}

/** Job data for social listening crawler */
export interface SocialListeningCrawlerJobData {
    organizationId: string;
}

// ============================================================================
// QUEUE REGISTRY
// ============================================================================

/** All queues for graceful shutdown */
export const allQueues = [
    postPublishQueue,
    analyticsSyncQueue,
    emailDigestQueue,
    mediaMaintenanceQueue,
    stalePostCleanupQueue,
    notificationReminderQueue,
    engagementSyncQueue,
    postsSyncQueue,
    tokenRefreshQueue,
    videoTranscodeQueue,
    sebProactiveQueue,
    socialListeningCrawlerQueue,
];

/**
 * Schedule repeating analytics sync for a organization.
 * Runs every 6 hours to keep engagement metrics fresh.
 */
export async function scheduleWorkspaceAnalyticsSync(organizationId: string): Promise<void> {
    const jobId = `analytics-repeat-${organizationId}`;

    // Why: removeRepeatableByKey expects the internal BullMQ key, not the custom jobId.
    // We must iterate repeatable jobs to find the matching key for proper cleanup.
    const existingJobs = await analyticsSyncQueue.getRepeatableJobs();
    for (const job of existingJobs) {
        if (job.id === jobId || job.name === 'scheduled-sync') {
            await analyticsSyncQueue.removeRepeatableByKey(job.key);
        }
    }

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
 * Runs every 30 minutes to keep DMs, comments, and mentions fresh.
 */
export async function scheduleWorkspaceEngagementSync(organizationId: string): Promise<void> {
    const jobId = `engagement-repeat-${organizationId}`;

    // Why: removeRepeatableByKey expects the internal BullMQ key, not the custom jobId.
    // We must iterate repeatable jobs to find the matching key for proper cleanup.
    const existingJobs = await engagementSyncQueue.getRepeatableJobs();
    for (const job of existingJobs) {
        if (job.id === jobId || job.name === 'scheduled-engagement-sync') {
            await engagementSyncQueue.removeRepeatableByKey(job.key);
        }
    }

    await engagementSyncQueue.add('scheduled-engagement-sync', {
        organizationId,
        daysSince: 7,
    }, {
        repeat: {
            every: 30 * 60 * 1000, // Every 30 minutes
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

    // Why: removeRepeatableByKey expects the internal BullMQ key, not the custom jobId.
    // We must iterate repeatable jobs to find the matching key for proper cleanup.
    const existingJobs = await postsSyncQueue.getRepeatableJobs();
    for (const job of existingJobs) {
        if (job.id === jobId || job.name === 'scheduled-posts-sync') {
            await postsSyncQueue.removeRepeatableByKey(job.key);
        }
    }

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
 * Schedule repeating social listening crawler sync for a workspace.
 * Runs every 20 minutes to approximate a first-party listening stream.
 */
export async function scheduleWorkspaceSocialListeningCrawler(organizationId: string): Promise<void> {
    const jobId = `listening-crawler-repeat-${organizationId}`;

    const existingJobs = await socialListeningCrawlerQueue.getRepeatableJobs();
    for (const job of existingJobs) {
        if (job.id === jobId || job.name === 'scheduled-crawl') {
            await socialListeningCrawlerQueue.removeRepeatableByKey(job.key);
        }
    }

    await socialListeningCrawlerQueue.add('scheduled-crawl', { organizationId }, {
        repeat: { every: 20 * 60 * 1000 },
        jobId,
    });
}

/**
 * Schedule proactive token refresh sweep.
 * Runs every 30 minutes to refresh tokens approaching expiry.
 */
export async function scheduleTokenRefreshSweep(): Promise<void> {
    const jobId = 'token-refresh-sweep-repeat';

    const existingJobs = await tokenRefreshQueue.getRepeatableJobs();
    for (const job of existingJobs) {
        if (job.id === jobId || job.name === 'sweep') {
            await tokenRefreshQueue.removeRepeatableByKey(job.key);
        }
    }

    await tokenRefreshQueue.add('sweep', { type: 'sweep' }, {
        repeat: {
            every: 30 * 60 * 1000, // Every 30 minutes
        },
        jobId,
    });
}

/**
 * Schedule Seb's proactive daily report sweep.
 */
export async function scheduleSebProactiveRefresh(): Promise<void> {
    const jobId = 'seb-proactive-daily';

    const existingJobs = await sebProactiveQueue.getRepeatableJobs();
    for (const job of existingJobs) {
        if (job.id === jobId || job.name === 'daily-refresh') {
            await sebProactiveQueue.removeRepeatableByKey(job.key);
        }
    }

    await sebProactiveQueue.add('daily-refresh', { type: 'daily-refresh' }, {
        repeat: {
            every: 24 * 60 * 60 * 1000,
        },
        jobId,
    });
}

export async function enqueueSebReportGeneration(data: Required<Pick<SebProactiveJobData, 'organizationId' | 'reportId'>> & Pick<SebProactiveJobData, 'userId' | 'trigger'>): Promise<string> {
    const job = await sebProactiveQueue.add('generate-report', {
        type: 'generate-report',
        organizationId: data.organizationId,
        userId: data.userId,
        reportId: data.reportId,
        trigger: data.trigger ?? 'MANUAL',
    }, {
        jobId: `seb-report-${data.reportId}`,
    });

    return job.id ?? 'unknown';
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

/**
 * Idempotently ensure engagement sync and posts sync are scheduled for an org.
 * Why: Sync jobs are only created at worker boot. If an org is created or its
 * first account is connected after boot, the org never gets scheduled.
 * BullMQ's repeatable-job pattern deduplicates, so calling this multiple times is safe.
 */
export async function ensureOrgSyncScheduled(organizationId: string): Promise<void> {
    try {
        await scheduleWorkspaceEngagementSync(organizationId);
        await scheduleWorkspacePostsSync(organizationId);
        await scheduleWorkspaceSocialListeningCrawler(organizationId);
    } catch (error) {
        // Non-critical — next worker restart will pick it up
        const { logger } = await import('@/lib/logger');
        logger.warn({ error, organizationId }, 'Failed to schedule org sync (non-critical)');
    }
}
