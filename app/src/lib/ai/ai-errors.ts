/**
 * AI Error Types and Handling
 * 
 * Custom error classes for AI service failures.
 * Provides structured error handling for OpenRouter and similar APIs.
 * 
 * Why: AI services can fail in various ways (rate limits, malformed responses,
 * network errors) and each requires different handling in the UI.
 */

/**
 * Base error class for AI-related errors
 */
export class AIError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly retryable: boolean = false,
        public readonly retryAfterMs?: number
    ) {
        super(message);
        this.name = 'AIError';
    }
}

/**
 * Rate limit exceeded error
 * Includes retry-after information when available
 */
export class RateLimitError extends AIError {
    constructor(
        message: string = 'AI service rate limit exceeded',
        retryAfterMs?: number
    ) {
        super(message, 'RATE_LIMIT', true, retryAfterMs);
        this.name = 'RateLimitError';
    }

    static fromHeaders(headers: Headers): RateLimitError {
        const retryAfter = headers.get('retry-after');
        const retryAfterMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : 60000; // Default 1 minute

        return new RateLimitError(
            'AI service rate limit exceeded. Please try again later.',
            retryAfterMs
        );
    }
}

/**
 * Malformed response error - AI returned invalid JSON or unexpected format
 */
export class MalformedResponseError extends AIError {
    constructor(
        message: string = 'AI service returned an invalid response',
        public readonly rawResponse?: string
    ) {
        super(message, 'MALFORMED_RESPONSE', true);
        this.name = 'MalformedResponseError';
    }
}

/**
 * Content filter error - AI refused to generate content
 */
export class ContentFilterError extends AIError {
    constructor(message: string = 'Content was blocked by AI safety filters') {
        super(message, 'CONTENT_FILTER', false);
        this.name = 'ContentFilterError';
    }
}

/**
 * Service unavailable error - AI service is down or unreachable
 */
export class ServiceUnavailableError extends AIError {
    constructor(message: string = 'AI service is temporarily unavailable') {
        super(message, 'SERVICE_UNAVAILABLE', true, 30000);
        this.name = 'ServiceUnavailableError';
    }
}

/**
 * Parse AI response safely with fallback handling
 * 
 * @param responseText - Raw response text from AI
 * @returns Parsed JSON object
 * @throws MalformedResponseError if parsing fails
 */
export function parseAIResponse<T>(responseText: string): T {
    try {
        // Try standard JSON parse first
        return JSON.parse(responseText);
    } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch {
                // Fall through to error
            }
        }

        // Try to find raw JSON object/array in response
        const objectMatch = responseText.match(/\{[\s\S]*\}/);
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);
        const jsonContent = objectMatch?.[0] || arrayMatch?.[0];

        if (jsonContent) {
            try {
                return JSON.parse(jsonContent);
            } catch {
                // Fall through to error
            }
        }

        throw new MalformedResponseError(
            'Failed to parse AI response as JSON',
            responseText.slice(0, 500) // Include first 500 chars for debugging
        );
    }
}

/**
 * Handle HTTP response errors from AI services
 * 
 * @param response - Fetch Response object
 * @throws Appropriate AIError subclass based on status code
 */
export async function handleAIResponseError(response: Response): Promise<never> {
    const status = response.status;

    if (status === 429) {
        throw RateLimitError.fromHeaders(response.headers);
    }

    if (status === 503 || status === 502 || status === 504) {
        throw new ServiceUnavailableError();
    }

    // Try to get error message from response body
    let errorMessage = `AI request failed with status ${status}`;
    try {
        const body = await response.json();
        errorMessage = body.error?.message || body.message || errorMessage;
    } catch {
        // Ignore JSON parse errors
    }

    throw new AIError(errorMessage, `HTTP_${status}`, status >= 500);
}

/**
 * User-friendly error messages for display
 */
export function getAIErrorMessage(error: unknown): string {
    if (error instanceof RateLimitError) {
        const minutes = Math.ceil((error.retryAfterMs || 60000) / 60000);
        return `AI service is busy. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;
    }

    if (error instanceof MalformedResponseError) {
        return 'AI generated an unexpected response. Please try again.';
    }

    if (error instanceof ContentFilterError) {
        return 'Content was blocked by safety filters. Please revise your request.';
    }

    if (error instanceof ServiceUnavailableError) {
        return 'AI service is temporarily unavailable. Please try again shortly.';
    }

    if (error instanceof AIError) {
        return error.message;
    }

    return 'An unexpected error occurred with the AI service.';
}
