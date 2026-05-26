/**
 * Retry Strategy with Exponential Backoff
 *
 * Why: The publish pipeline had ad-hoc retry logic (one recursive call in
 * publishSinglePlatform for auth errors). This module provides a generic,
 * configurable retry wrapper with error classification so only transient
 * failures are retried — permanent errors (bad request, validation) fail fast.
 */

import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

/** Whether an error is worth retrying */
export type ErrorRetryability = 'retryable' | 'permanent';

/** Structured classification result */
export interface ClassifiedError {
    retryability: ErrorRetryability;
    category: 'timeout' | 'rate_limit' | 'server_error' | 'network' | 'auth' | 'validation' | 'unknown';
    /** Suggested delay override in ms (e.g. from Retry-After header) */
    suggestedDelayMs?: number;
}

/** Patterns that indicate the error is transient and worth retrying */
const RETRYABLE_PATTERNS: Array<{ pattern: RegExp; category: ClassifiedError['category'] }> = [
    { pattern: /timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT/i, category: 'timeout' },
    { pattern: /429|too many requests|rate limit|throttled|quota exceeded/i, category: 'rate_limit' },
    { pattern: /5\d{2}|internal server error|bad gateway|service unavailable|gateway timeout/i, category: 'server_error' },
    { pattern: /ECONNRESET|ECONNREFUSED|ENOTFOUND|ENETUNREACH|fetch failed|network/i, category: 'network' },
    { pattern: /temporarily unavailable|maintenance|try again/i, category: 'server_error' },
];

/** Patterns that indicate the error is permanent — retrying will not help */
const PERMANENT_PATTERNS: Array<{ pattern: RegExp; category: ClassifiedError['category'] }> = [
    // Why: Platform publish timeouts mean media was already uploaded and is
    // processing server-side. Retrying would re-upload, creating duplicates.
    // TikTok:
    { pattern: /video may still be processing/i, category: 'timeout' },
    { pattern: /video is still processing/i, category: 'timeout' },
    // Instagram:
    { pattern: /container processing timeout/i, category: 'timeout' },
    { pattern: /container still processing/i, category: 'timeout' },
    // Threads:
    { pattern: /video processing timed out/i, category: 'timeout' },
    { pattern: /media container processing timed out/i, category: 'timeout' },
    { pattern: /threads container still processing/i, category: 'timeout' },
    // Bluesky:
    { pattern: /video processing timed out after/i, category: 'timeout' },
    { pattern: /bluesky video still processing/i, category: 'timeout' },
    { pattern: /400|bad request|invalid request|invalid parameter|validation/i, category: 'validation' },
    { pattern: /401|403|unauthorized|forbidden|authorization error|token expired|invalid token|OAuthException/i, category: 'auth' },
    { pattern: /404|not found/i, category: 'validation' },
    { pattern: /duplicate|already exists|already published/i, category: 'validation' },
    { pattern: /unsupported|not supported|invalid format/i, category: 'validation' },
    { pattern: /only photo or video/i, category: 'validation' },
    { pattern: /blocked hashtag|banned|restricted|prohibited/i, category: 'validation' },
    { pattern: /caption too long|character limit|exceeds maximum/i, category: 'validation' },
    { pattern: /missing video|missing media|no media/i, category: 'validation' },
    { pattern: /unaudited_client|sandbox|private.account/i, category: 'validation' },
];

/**
 * Classify an error as retryable or permanent.
 *
 * @param error - Raw error from a platform API call
 * @returns Classification with retryability and category
 */
export function classifyError(error: unknown): ClassifiedError {
    // Why: If the error carries a pending platform publish ID, the media was
    // already uploaded and may be processing server-side. Retrying would
    // re-upload and create duplicate posts. Treat as permanent so withRetry
    // stops, the pending ID gets stored on the post record, and the next
    // BullMQ attempt polls status instead of re-uploading.
    if (error instanceof Error && (error as any).pendingPostId) {
        const pid = String((error as any).pendingPostId);
        if (pid.includes('_pending:')) {
            return { retryability: 'permanent', category: 'timeout' };
        }
    }

    // Why: The outer Promise.race publish timeout fires after 14 minutes.
    // By then the media upload has almost certainly reached the platform and
    // may be processing server-side. The generic "timed out" wording in the
    // error message matches the retryable timeout pattern below, which caused
    // withRetry to start a brand-new upload — creating duplicate posts.
    // Checking this flag before the pattern scan ensures publish timeouts are
    // always treated as permanent.
    if (error instanceof Error && (error as any).isPublishTimeout) {
        return { retryability: 'permanent', category: 'timeout' };
    }

    const message = error instanceof Error ? error.message : String(error);

    // Check permanent patterns first — they take priority so we don't
    // accidentally retry a 400 that also contains "try again" advice.
    for (const { pattern, category } of PERMANENT_PATTERNS) {
        if (pattern.test(message)) {
            return { retryability: 'permanent', category };
        }
    }

    for (const { pattern, category } of RETRYABLE_PATTERNS) {
        if (pattern.test(message)) {
            const result: ClassifiedError = { retryability: 'retryable', category };

            // Why: Extract Retry-After hint when available so the caller can
            // respect the platform's backoff instructions instead of guessing.
            if (category === 'rate_limit') {
                const match = message.match(/retry after (\d+)/i);
                if (match) {
                    result.suggestedDelayMs = parseInt(match[1], 10) * 1000;
                }
            }

            return result;
        }
    }

    // Why: Unknown errors default to retryable because silently dropping
    // a post is worse than one extra attempt.
    return { retryability: 'retryable', category: 'unknown' };
}

// ---------------------------------------------------------------------------
// Retry Configuration
// ---------------------------------------------------------------------------

/** Per-platform delay multipliers */
const PLATFORM_DELAY_MULTIPLIERS: Record<string, number> = {
    instagram: 2.0,  // Why: IG container processing adds natural latency
    tiktok: 1.5,
    youtube: 1.5,    // Why: YouTube video processing can be slow
    facebook: 1.0,
    linkedin: 1.0,
    pinterest: 1.0,
    bluesky: 1.0,
    threads: 1.0,
    google_business: 1.0,
};

export interface RetryOptions {
    /** Maximum number of attempts (including the first) */
    maxAttempts?: number;
    /** Base delay between retries in ms */
    baseDelayMs?: number;
    /** Maximum delay cap in ms */
    maxDelayMs?: number;
    /** Platform name for delay multiplier */
    platform?: string;
    /** Logger for retry attempt tracking */
    log?: typeof logger;
    /** Extra context fields for structured logging */
    logContext?: Record<string, unknown>;
    /** Called on each retry — useful for metrics/telemetry */
    onRetry?: (attempt: number, error: unknown, classification: ClassifiedError, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Pick<RetryOptions, 'maxAttempts' | 'baseDelayMs' | 'maxDelayMs'>> = {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 60_000,
};

// ---------------------------------------------------------------------------
// Core Retry Logic
// ---------------------------------------------------------------------------

/**
 * Execute an async operation with automatic retry for transient errors.
 *
 * Uses exponential backoff with jitter: delay = min(baseDelay × 2^attempt × platformMultiplier + jitter, maxDelay)
 *
 * @param operation - The async function to execute
 * @param options - Retry configuration
 * @returns The operation's return value
 * @throws The last error if all attempts are exhausted, or immediately if the error is permanent
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const {
        maxAttempts = DEFAULT_OPTIONS.maxAttempts,
        baseDelayMs = DEFAULT_OPTIONS.baseDelayMs,
        maxDelayMs = DEFAULT_OPTIONS.maxDelayMs,
        platform,
        log,
        logContext = {},
        onRetry,
    } = options;

    const platformMultiplier = platform ? (PLATFORM_DELAY_MULTIPLIERS[platform.toLowerCase()] ?? 1.0) : 1.0;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const classification = classifyError(error);

            // Permanent errors — fail immediately, no point retrying
            if (classification.retryability === 'permanent') {
                log?.warn(
                    { attempt, maxAttempts, category: classification.category, ...logContext },
                    `Permanent error — not retrying (${classification.category})`,
                );
                throw error;
            }

            // Last attempt — throw without waiting
            if (attempt >= maxAttempts) {
                log?.error(
                    { attempt, maxAttempts, category: classification.category, ...logContext },
                    `All ${maxAttempts} attempts exhausted`,
                );
                throw error;
            }

            // Calculate delay: exponential backoff with jitter
            const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1) * platformMultiplier;
            const jitter = Math.random() * baseDelayMs * 0.5; // Up to 50% of base delay
            const suggestedDelay = classification.suggestedDelayMs ?? 0;
            const delayMs = Math.min(Math.max(exponentialDelay + jitter, suggestedDelay), maxDelayMs);

            log?.warn(
                { attempt, maxAttempts, delayMs: Math.round(delayMs), category: classification.category, ...logContext },
                `Retryable error — attempt ${attempt}/${maxAttempts}, waiting ${Math.round(delayMs)}ms`,
            );

            onRetry?.(attempt, error, classification, delayMs);

            await sleep(delayMs);
        }
    }

    // TypeScript exhaustiveness — should never reach here
    throw lastError;
}

/** Promise-based sleep for backoff delays */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
