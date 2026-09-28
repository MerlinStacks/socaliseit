/**
 * Fetch with Timeout Utility
 *
 * Why: External platform APIs (TikTok, Meta, etc.) can hang indefinitely.
 * This wrapper adds configurable timeouts to prevent worker stalls using
 * the modern AbortSignal.timeout() pattern.
 */

import { logger } from '@/lib/logger';

/** Default timeout for read/query operations (10 seconds) */
export const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

/** Default timeout for write/upload operations (60 seconds) */
export const DEFAULT_WRITE_TIMEOUT_MS = 60_000;

/** Extended timeout for large file uploads (5 minutes) */
export const UPLOAD_TIMEOUT_MS = 300_000;

export interface FetchWithTimeoutOptions extends RequestInit {
    /** Timeout in milliseconds. Defaults to DEFAULT_QUERY_TIMEOUT_MS for GET, DEFAULT_WRITE_TIMEOUT_MS for others */
    timeoutMs?: number;
    /** Optional context for logging (e.g., platform name, operation) */
    logContext?: Record<string, unknown>;
}

/**
 * Fetch wrapper with automatic timeout and logging.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options plus optional timeoutMs
 * @returns Response promise
 * @throws Error with 'TimeoutError' name if timeout exceeded
 */
export async function fetchWithTimeout(
    url: string,
    options: FetchWithTimeoutOptions = {}
): Promise<Response> {
    const {
        timeoutMs,
        logContext = {},
        signal: existingSignal,
        ...fetchOptions
    } = options;

    // Determine default timeout based on method
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const defaultTimeout = method === 'GET' ? DEFAULT_QUERY_TIMEOUT_MS : DEFAULT_WRITE_TIMEOUT_MS;
    const effectiveTimeout = timeoutMs ?? defaultTimeout;

    // Native composition handles already-aborted callers and keeps the timeout
    // active while the response body is consumed, without leaking listeners.
    const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
    const signal = existingSignal ? AbortSignal.any([existingSignal, timeoutSignal]) : timeoutSignal;

    try {
        return await fetch(url, { ...fetchOptions, signal });
    } catch (error) {
        // Enhance timeout errors with context
        if (error instanceof Error && error.name === 'TimeoutError') {
            logger.warn(
                { url, timeoutMs: effectiveTimeout, ...logContext },
                'Fetch request timed out'
            );
            const timeoutError = new Error(`Request timed out after ${effectiveTimeout}ms: ${url}`);
            timeoutError.name = 'TimeoutError';
            throw timeoutError;
        }

        // Log abort errors
        if (error instanceof Error && error.name === 'AbortError') {
            logger.warn(
                { url, ...logContext },
                'Fetch request aborted'
            );
        }

        throw error;
    }
}

/**
 * Convenience wrapper for platform API calls with automatic retry context.
 *
 * @param platform - Platform name for logging
 * @param operation - Operation name for logging
 * @param url - The URL to fetch
 * @param options - Fetch options
 */
export async function platformFetch(
    platform: string,
    operation: string,
    url: string,
    options: FetchWithTimeoutOptions = {}
): Promise<Response> {
    return fetchWithTimeout(url, {
        ...options,
        logContext: { platform, operation, ...options.logContext },
    });
}
