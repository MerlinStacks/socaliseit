/**
 * API Error Handling Utilities
 * Centralizes fetch error parsing, user-friendly translation, and toast display
 */

import { toast } from '@/components/ui/toast';
import { getUserFriendlyError } from '@/lib/error-messages';

export class ApiResponseError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiResponseError';
        this.status = status;
    }
}

export function throwApiResponseError(response: Response, fallback = 'Request failed'): never {
    throw new ApiResponseError(fallback, response.status);
}

/**
 * Parse a failed API response and show a user-friendly toast.
 * Uses getUserFriendlyError to translate raw errors into plain English
 * with actionable suggestions.
 *
 * @example
 * const res = await fetch('/api/posts', { method: 'POST', body });
 * if (!res.ok) return handleApiError(res, 'Failed to create post');
 */
export async function handleApiError(
    response: Response,
    fallback = 'Something went wrong'
): Promise<string> {
    let rawMessage = fallback;
    try {
        const body = await response.json();
        rawMessage = body.error || body.message || fallback;
    } catch {
        // Response body wasn't JSON — use fallback
    }

    // Translate raw error into user-friendly language
    const friendly = getUserFriendlyError(rawMessage);

    // Pick toast type based on category/status
    const type = response.status === 429 || friendly.category === 'rate_limit'
        ? 'warning'
        : response.status === 401 || response.status === 403 || friendly.category === 'auth'
            ? 'warning'
            : 'error';

    // Show toast with friendly message + actionable suggestion
    toast(type, friendly.message, friendly.suggestion);

    return friendly.message;
}

/**
 * Show a user-friendly error toast from any caught error.
 * Useful in catch blocks where you don't have a Response object.
 *
 * @example
 * try { await doSomething(); }
 * catch (err) { showErrorToast(err); }
 */
export function showErrorToast(error: unknown, fallbackTitle?: string) {
    const friendly = getUserFriendlyError(error);
    toast('error', fallbackTitle || friendly.message, friendly.suggestion);
}

/**
 * Wrap a fetch call with automatic error handling.
 * Parses the response, shows a user-friendly toast on failure, and throws.
 *
 * @example
 * const data = await apiFetch('/api/accounts');
 */
export async function apiFetch<T = unknown>(
    url: string,
    options?: RequestInit,
    errorFallback?: string
): Promise<T> {
    const response = await fetch(url, options);

    if (!response.ok) {
        const msg = await handleApiError(response, errorFallback);
        throw new ApiResponseError(msg, response.status);
    }

    return response.json();
}
