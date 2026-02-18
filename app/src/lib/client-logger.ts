/**
 * Client Logger
 * Lightweight structured logger for 'use client' components.
 *
 * Why: The pino-based `@/lib/logger` uses Node.js APIs and cannot
 * be imported in client components. This wrapper provides the same
 * ergonomic API (`logger.error({ ctx }, msg)`) while routing through
 * `console.*` under the hood — acceptable in client bundles since
 * these calls run in the user's browser, not in production servers.
 *
 * In production, a future enhancement can forward these to a
 * remote telemetry endpoint (e.g., Sentry, LogRocket).
 */

type LogContext = Record<string, unknown>;

/**
 * Structured client-side logger.
 * Usage: `clientLogger.error({ userId }, 'Failed to fetch')`.
 */
export const clientLogger = {
    /** Informational messages */
    info(ctx: LogContext | string, msg?: string) {
        if (typeof ctx === 'string') {
            // eslint-disable-next-line no-console
            console.info(`[INFO] ${ctx}`);
        } else {
            // eslint-disable-next-line no-console
            console.info(`[INFO] ${msg}`, ctx);
        }
    },

    /** Warnings */
    warn(ctx: LogContext | string, msg?: string) {
        if (typeof ctx === 'string') {
            // eslint-disable-next-line no-console
            console.warn(`[WARN] ${ctx}`);
        } else {
            // eslint-disable-next-line no-console
            console.warn(`[WARN] ${msg}`, ctx);
        }
    },

    /** Errors */
    error(ctx: LogContext | string, msg?: string) {
        if (typeof ctx === 'string') {
            // eslint-disable-next-line no-console
            console.error(`[ERROR] ${ctx}`);
        } else {
            // eslint-disable-next-line no-console
            console.error(`[ERROR] ${msg}`, ctx);
        }
    },

    /** Debug (only in development) */
    debug(ctx: LogContext | string, msg?: string) {
        if (process.env.NODE_ENV !== 'production') {
            if (typeof ctx === 'string') {
                // eslint-disable-next-line no-console
                console.debug(`[DEBUG] ${ctx}`);
            } else {
                // eslint-disable-next-line no-console
                console.debug(`[DEBUG] ${msg}`, ctx);
            }
        }
    },
};
