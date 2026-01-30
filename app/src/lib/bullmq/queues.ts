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

// ============================================================================
// JOB DATA TYPES
// ============================================================================

/** Job data for post publishing */
export interface PostPublishJobData {
    postId: string;
    workspaceId: string;
    platformIds: string[];
    scheduledAt?: string;
    isRetry?: boolean;
}

/** Job data for video rendering */
export interface VideoRenderJobData {
    projectId: string;
    workspaceId: string;
    outputFormat: 'mp4' | 'webm';
    quality: 'draft' | 'high';
}

/** Job data for analytics sync */
export interface AnalyticsSyncJobData {
    workspaceId: string;
    socialAccountId: string;
    syncType: 'full' | 'incremental';
}

/** Job data for email digest */
export interface EmailDigestJobData {
    workspaceId: string;
    userId: string;
    digestType: 'daily' | 'weekly' | 'monthly';
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
];

/**
 * Close all queue connections gracefully.
 * Should be called during application shutdown.
 */
export async function closeAllQueues(): Promise<void> {
    await Promise.all(allQueues.map((queue) => queue.close()));
}
