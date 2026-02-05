'use client';

/**
 * useRetry Hook
 * Automatic retry with exponential backoff for failed API calls
 * Why: Improves reliability without user intervention
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface RetryConfig {
    /** Maximum number of retry attempts */
    maxRetries?: number;
    /** Initial delay in ms before first retry */
    initialDelay?: number;
    /** Maximum delay cap in ms */
    maxDelay?: number;
    /** Backoff multiplier (e.g., 2 = double delay each retry) */
    backoffFactor?: number;
    /** Callback when retry starts */
    onRetry?: (attempt: number, delay: number) => void;
    /** Callback when all retries exhausted */
    onExhausted?: (error: Error) => void;
}

interface RetryState {
    isRetrying: boolean;
    attempt: number;
    nextRetryIn: number | null;
    lastError: Error | null;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    backoffFactor: number
): number {
    const exponentialDelay = initialDelay * Math.pow(backoffFactor, attempt);
    const cappedDelay = Math.min(exponentialDelay, maxDelay);
    // Add jitter (±25%) to prevent thundering herd
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(cappedDelay + jitter);
}

/**
 * Hook for automatic retry with exponential backoff
 */
export function useRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = {}
) {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 30000,
        backoffFactor = 2,
        onRetry,
        onExhausted,
    } = config;

    const [state, setState] = useState<RetryState>({
        isRetrying: false,
        attempt: 0,
        nextRetryIn: null,
        lastError: null,
    });

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const abortRef = useRef(false);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            abortRef.current = true;
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    const execute = useCallback(async (): Promise<T> => {
        abortRef.current = false;
        setState({ isRetrying: false, attempt: 0, nextRetryIn: null, lastError: null });

        let lastError: Error;
        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                const result = await fn();
                setState({ isRetrying: false, attempt: 0, nextRetryIn: null, lastError: null });
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (abortRef.current) {
                    throw lastError;
                }

                if (attempt < maxRetries) {
                    const delay = calculateDelay(attempt, initialDelay, maxDelay, backoffFactor);
                    onRetry?.(attempt + 1, delay);

                    setState({
                        isRetrying: true,
                        attempt: attempt + 1,
                        nextRetryIn: delay,
                        lastError,
                    });

                    // Wait before retry
                    await new Promise<void>((resolve) => {
                        timerRef.current = setTimeout(resolve, delay);
                    });

                    attempt++;
                } else {
                    break;
                }
            }
        }

        onExhausted?.(lastError!);
        setState({
            isRetrying: false,
            attempt: maxRetries,
            nextRetryIn: null,
            lastError: lastError!,
        });
        throw lastError!;
    }, [fn, maxRetries, initialDelay, maxDelay, backoffFactor, onRetry, onExhausted]);

    const cancel = useCallback(() => {
        abortRef.current = true;
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        setState(prev => ({ ...prev, isRetrying: false, nextRetryIn: null }));
    }, []);

    return {
        execute,
        cancel,
        ...state,
    };
}

/**
 * Simple wrapper for fetch with retry
 */
export async function fetchWithRetry(
    url: string,
    options?: RequestInit,
    retryConfig?: RetryConfig
): Promise<Response> {
    const config = {
        maxRetries: 3,
        initialDelay: 1000,
        ...retryConfig,
    };

    let lastError: Error;
    let attempt = 0;

    while (attempt <= config.maxRetries) {
        try {
            const response = await fetch(url, options);
            if (!response.ok && response.status >= 500) {
                // Retry on server errors
                throw new Error(`Server error: ${response.status}`);
            }
            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < config.maxRetries) {
                const delay = calculateDelay(
                    attempt,
                    config.initialDelay,
                    config.maxDelay || 30000,
                    config.backoffFactor || 2
                );
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
            } else {
                break;
            }
        }
    }

    throw lastError!;
}
