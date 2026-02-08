/**
 * Worker Process Entry Point
 * Initializes and runs all background job processors
 */

import { Worker } from 'bullmq';
import { logger } from '@/lib/logger';
import { closeRedisConnection } from '@/lib/bullmq/connection';
import { closeAllQueues, scheduleThumbnailRegeneration, scheduleStalePostCleanup } from '@/lib/bullmq/queues';
import { createPostPublisherWorker } from './post-publisher';
import { createThumbnailRegenerationWorker } from './thumbnail-regeneration';
import { createStalePostCleanupWorker } from './stale-post-cleanup';

// Track all workers for graceful shutdown
const workers: Worker[] = [];

/**
 * Initialize all workers
 */
async function initializeWorkers(): Promise<void> {
    logger.info('Initializing workers...');

    // Post Publisher Worker
    const postPublisher = createPostPublisherWorker();
    workers.push(postPublisher);
    logger.info('Post publisher worker initialized');

    // Thumbnail Regeneration Worker
    const thumbnailWorker = createThumbnailRegenerationWorker();
    workers.push(thumbnailWorker);
    logger.info('Thumbnail regeneration worker initialized');

    // Stale Post Cleanup Worker
    const staleCleanupWorker = createStalePostCleanupWorker();
    workers.push(staleCleanupWorker);
    logger.info('Stale post cleanup worker initialized');

    // Schedule daily thumbnail regeneration job
    await scheduleThumbnailRegeneration();
    logger.info('Daily thumbnail regeneration scheduled (every 24 hours)');

    // Schedule stale post cleanup job
    await scheduleStalePostCleanup();
    logger.info('Stale post cleanup scheduled (every 5 minutes)');

    logger.info({ workerCount: workers.length }, 'All workers initialized');
}


/**
 * Gracefully shutdown all workers and connections
 */
async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Received shutdown signal, closing workers...');

    try {
        // Close all workers
        await Promise.all(workers.map((worker) => worker.close()));
        logger.info('All workers closed');

        // Close queues
        await closeAllQueues();
        logger.info('All queues closed');

        // Close Redis connection
        await closeRedisConnection();
        logger.info('Redis connection closed');

        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
    }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    logger.info('='.repeat(50));
    logger.info('SocialiseIT Worker Process Starting');
    logger.info('='.repeat(50));

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors - LOG SYNCHRONOUSLY so errors are always visible
    // Why: pino logger is async, so errors can be lost if process exits before flush.
    // Using process.stderr.write() guarantees the error message reaches the logs.
    process.on('uncaughtException', (error) => {
        const timestamp = new Date().toISOString();
        const stack = error?.stack || error?.message || String(error);
        process.stderr.write(`\n[${timestamp}] UNCAUGHT EXCEPTION (non-fatal, worker continues):\n${stack}\n\n`);
        logger.error({ err: error }, 'Uncaught exception (non-fatal)');
        // Don't exit - BullMQ handles job-level failures.
        // Exiting kills ALL in-flight jobs across all workers.
    });

    process.on('unhandledRejection', (reason) => {
        const timestamp = new Date().toISOString();
        const detail = reason instanceof Error ? reason.stack : JSON.stringify(reason);
        process.stderr.write(`\n[${timestamp}] UNHANDLED REJECTION (non-fatal, worker continues):\n${detail}\n\n`);
        logger.error({ reason }, 'Unhandled rejection (non-fatal)');
        // Don't exit - BullMQ handles job-level retries.
    });

    // Always log when the process exits (catches OOM kills, signals, etc.)
    process.on('exit', (code) => {
        process.stderr.write(`[${new Date().toISOString()}] Worker process exiting with code: ${code}\n`);
    });

    // Initialize workers
    await initializeWorkers();

    logger.info('Worker process ready and listening for jobs');
}

// Start the worker process
main().catch((error) => {
    logger.error({ err: error }, 'Failed to start worker process');
    process.exit(1);
});
