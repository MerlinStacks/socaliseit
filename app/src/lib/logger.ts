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
    serializers: {
        /**
         * Pino's built-in serializer only handles the `err` key.
         * Our codebase uses `{ error }` everywhere, so we add a custom
         * serializer to prevent Error objects rendering as `{}`.
         */
        error: (val: unknown) => {
            if (val instanceof Error) {
                return {
                    message: val.message,
                    stack: val.stack,
                    ...(('code' in val) && { code: (val as Error & { code?: string }).code }),
                };
            }
            return val;
        },
    },
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
 * Use this in API routes after extracting the organization.
 *
 * @param organizationId - Current workspace ID
 * @param userId - Optional user ID for additional context
 */
export function createWorkspaceLogger(organizationId: string, userId?: string) {
    return logger.child({
        organizationId,
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
 * Create a child logger for API route handlers.
 * Use this at the top of each route handler for structured request logging.
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Route path (e.g., '/api/accounts')
 */
export function createRouteLogger(method: string, path: string) {
    return logger.child({
        route: path,
        method,
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
