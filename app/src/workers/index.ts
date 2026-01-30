/**
 * Worker Process Entry Point
 * Initializes and runs all background job processors
 */

import { Worker } from 'bullmq';
import { logger } from '@/lib/logger';
import { closeRedisConnection } from '@/lib/bullmq/connection';
import { closeAllQueues } from '@/lib/bullmq/queues';
import { createPostPublisherWorker } from './post-publisher';

// Track all workers for graceful shutdown
const workers: Worker[] = [];

/**
 * Initialize all workers
 */
function initializeWorkers(): void {
    logger.info('Initializing workers...');

    // Post Publisher Worker
    const postPublisher = createPostPublisherWorker();
    workers.push(postPublisher);
    logger.info('Post publisher worker initialized');

    // TODO: Add more workers as needed
    // const videoRenderer = createVideoRendererWorker();
    // workers.push(videoRenderer);

    // const analyticsSyncer = createAnalyticsSyncWorker();
    // workers.push(analyticsSyncer);

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

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
        logger.error({ err: error }, 'Uncaught exception');
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
        logger.error({ reason }, 'Unhandled rejection');
        shutdown('unhandledRejection');
    });

    // Initialize workers
    initializeWorkers();

    logger.info('Worker process ready and listening for jobs');
}

// Start the worker process
main().catch((error) => {
    logger.error({ err: error }, 'Failed to start worker process');
    process.exit(1);
});
