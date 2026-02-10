/**
 * Error Sanitization for API Responses
 * 
 * Why: Many routes return error.message directly to clients, which can leak
 * internal details (DB errors, file paths, API keys, stack traces).
 * This helper maps known error types to safe messages and redacts unknown ones.
 */

/**
 * Converts an unknown error into a safe, user-facing message.
 * In development, returns the original message for debugging.
 * In production, maps known errors to safe messages and redacts unknown ones.
 */
export function sanitizeError(error: unknown, fallback = 'An unexpected error occurred'): string {
    if (process.env.NODE_ENV === 'development') {
        return error instanceof Error ? error.message : fallback;
    }

    if (!(error instanceof Error)) {
        return fallback;
    }

    const msg = error.message;

    // Known safe messages that are already user-friendly
    const safePatterns: Array<{ pattern: RegExp; response: string }> = [
        // Auth/permission errors
        { pattern: /unauthorized|not authenticated|forbidden/i, response: 'Unauthorized' },
        { pattern: /not found/i, response: 'Resource not found' },

        // Validation errors
        { pattern: /required|invalid|must be|expected/i, response: msg }, // User input errors are safe to return
        { pattern: /too (large|big|long|many)/i, response: msg },
        { pattern: /already exists|duplicate|unique constraint/i, response: 'This item already exists' },

        // Rate limiting
        { pattern: /rate limit/i, response: msg },

        // Platform-specific (safe to surface)
        { pattern: /token.*expired|token.*invalid/i, response: 'Authentication token has expired. Please reconnect your account.' },
        { pattern: /quota|limit exceeded/i, response: 'API quota exceeded. Please try again later.' },
    ];

    for (const { pattern, response } of safePatterns) {
        if (pattern.test(msg)) {
            return response;
        }
    }

    // Default: redact the message in production
    return fallback;
}
