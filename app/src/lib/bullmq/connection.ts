/**
 * Redis Connection Singleton
 * Shared connection for BullMQ queues and rate limiting
 */

import Redis from 'ioredis';
import { logger } from '@/lib/logger';

/** Redis connection options derived from environment */
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let connection: Redis | null = null;

/**
 * Get the shared Redis connection instance.
 * Creates a new connection if one doesn't exist.
 */
export function getRedisConnection(): Redis {
    if (!connection) {
        connection = new Redis(REDIS_URL, {
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: false,
            retryStrategy: (times) => {
                if (times > 10) {
                    logger.error({ times }, 'Redis connection failed after max retries');
                    return null; // Stop retrying
                }
                return Math.min(times * 100, 3000); // Exponential backoff, max 3s
            },
        });

        connection.on('connect', () => {
            logger.info('Redis connection established');
        });

        connection.on('error', (err) => {
            logger.error({ err }, 'Redis connection error');
        });

        connection.on('close', () => {
            logger.warn('Redis connection closed');
        });
    }

    return connection;
}

/**
 * Close the Redis connection gracefully.
 * Should be called during application shutdown.
 */
export async function closeRedisConnection(): Promise<void> {
    if (connection) {
        await connection.quit();
        connection = null;
        logger.info('Redis connection closed gracefully');
    }
}

/**
 * Get connection options for BullMQ (uses existing connection).
 * BullMQ requires specific connection configuration.
 */
export function getBullMQConnection() {
    return getRedisConnection();
}
