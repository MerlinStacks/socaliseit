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

    // Create abort signal with timeout
    // If an existing signal was provided, combine them
    let signal: AbortSignal;

    if (existingSignal) {
        // Combine existing signal with timeout signal
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(new Error('Timeout')), effectiveTimeout);

        existingSignal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            controller.abort(existingSignal.reason);
        });

        signal = controller.signal;

        // Why (BUG-37): Clear the timer after fetch completes to prevent leaks.
        // The original code never cleared timeoutId on normal completion,
        // keeping the controller reference alive until the timer fired.
        try {
            return await fetch(url, { ...fetchOptions, signal });
        } catch (error) {
            // Re-throw after clearing — caught by the outer catch
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    } else {
        signal = AbortSignal.timeout(effectiveTimeout);
    }

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
