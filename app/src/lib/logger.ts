/**
 * Centralized Logger (Pino)
 * Structured JSON logging with context support
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Base logger instance.
 * In development, uses pino-pretty for readable output.
 * In production, outputs JSON for log aggregation.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    ...(isProduction
        ? {}
        : {
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            },
        }),
});

/**
 * Create a child logger with workspace context.
 * Use this in API routes after extracting the workspace.
 *
 * @param workspaceId - Current workspace ID
 * @param userId - Optional user ID for additional context
 */
export function createWorkspaceLogger(workspaceId: string, userId?: string) {
    return logger.child({
        workspaceId,
        ...(userId && { userId }),
    });
}

/**
 * Create a child logger for worker processes.
 *
 * @param workerName - Name of the worker (e.g., 'post-publisher')
 */
export function createWorkerLogger(workerName: string) {
    return logger.child({
        worker: workerName,
    });
}

/**
 * Create a child logger for a specific job.
 *
 * @param jobId - BullMQ job ID
 * @param queueName - Name of the queue
 */
export function createJobLogger(jobId: string, queueName: string) {
    return logger.child({
        jobId,
        queue: queueName,
    });
}
