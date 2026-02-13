/**
 * User-Friendly Error Message Translator
 * Converts technical API errors into plain English explanations
 * 
 * Why: Users shouldn't see cryptic error codes - they need actionable advice
 */

export interface UserFriendlyError {
    /** Short, plain-English explanation of what went wrong */
    message: string;
    /** Actionable suggestion for fixing the issue */
    suggestion: string;
    /** Error category for routing/handling */
    category: 'auth' | 'media' | 'content' | 'rate_limit' | 'platform' | 'network' | 'unknown';
}

/**
 * Patterns to match against raw error messages/codes
 */
const ERROR_PATTERNS: Array<{
    pattern: RegExp | string[];
    result: UserFriendlyError;
}> = [
        // ============= AUTHENTICATION ERRORS =============
        {
            pattern: [
                'token expired',
                'invalid token',
                'access_token',
                'OAuthException',
                'Invalid OAuth',
                'authorization required',
                'not authorized',
                'session expired',
                'invalid_grant',
                'token_expired',
                '401',
                'unauthorized',
                'invalid authentication credentials',
                'authentication credential',
            ],
            result: {
                message: 'Your account connection has expired',
                suggestion: 'Reconnect your social account in Settings → Accounts',
                category: 'auth',
            },
        },
        {
            pattern: ['permission denied', 'insufficient permissions', 'missing scope', 'requires permission'],
            result: {
                message: 'Missing permissions for this action',
                suggestion: 'Reconnect your account and approve all requested permissions',
                category: 'auth',
            },
        },

        // ============= MEDIA ERRORS =============
        {
            pattern: ['video too long', 'duration exceeds', 'max duration', 'exceeds maximum duration'],
            result: {
                message: 'Your video is too long for this platform',
                suggestion: 'Trim the video to meet the platform\'s length limits',
                category: 'media',
            },
        },
        {
            pattern: ['video too short', 'minimum duration', 'too short'],
            result: {
                message: 'Your video is too short',
                suggestion: 'The video needs to be a bit longer for this platform',
                category: 'media',
            },
        },
        {
            pattern: ['file too large', 'exceeds size limit', 'file size', 'too large', 'max size'],
            result: {
                message: 'Your file is too large to upload',
                suggestion: 'Compress or resize your media before posting',
                category: 'media',
            },
        },
        {
            pattern: ['unsupported format', 'invalid format', 'format not supported', 'invalid media', 'unsupported media type'],
            result: {
                message: 'This file format isn\'t supported',
                suggestion: 'Convert to a supported format (JPG, PNG for images; MP4 for videos)',
                category: 'media',
            },
        },
        {
            pattern: ['aspect ratio', 'invalid dimensions', 'wrong size', 'image dimensions'],
            result: {
                message: 'Image dimensions don\'t meet requirements',
                suggestion: 'Resize your image to fit the platform\'s aspect ratio requirements',
                category: 'media',
            },
        },
        {
            pattern: ['upload failed', 'failed to upload', 'upload error', 'could not upload'],
            result: {
                message: 'Media upload failed',
                suggestion: 'Try uploading again, or check your file isn\'t corrupted',
                category: 'media',
            },
        },
        {
            pattern: ['media not ready', 'processing', 'still processing', 'container in progress'],
            result: {
                message: 'Media is still being processed',
                suggestion: 'Wait a moment and try publishing again',
                category: 'media',
            },
        },

        // ============= CONTENT ERRORS =============
        {
            pattern: ['caption too long', 'text too long', 'character limit', 'exceeds character'],
            result: {
                message: 'Your caption is too long',
                suggestion: 'Shorten your caption to fit within the platform\'s limit',
                category: 'content',
            },
        },
        {
            pattern: ['blocked hashtag', 'banned hashtag', 'restricted hashtag', 'prohibited hashtag'],
            result: {
                message: 'Your post contains a blocked hashtag',
                suggestion: 'Remove or replace the flagged hashtag',
                category: 'content',
            },
        },
        {
            pattern: ['spam', 'looks like spam', 'flagged as spam', 'spam detection'],
            result: {
                message: 'Post flagged as potential spam',
                suggestion: 'Vary your content and avoid posting too frequently',
                category: 'content',
            },
        },
        {
            pattern: ['community guidelines', 'policy violation', 'violates guidelines', 'content policy'],
            result: {
                message: 'Content may violate platform guidelines',
                suggestion: 'Review and adjust your content to meet platform policies',
                category: 'content',
            },
        },
        {
            pattern: ['duplicate content', 'already posted', 'duplicate post', 'identical content'],
            result: {
                message: 'This content has already been posted',
                suggestion: 'Make your post unique or wait before reposting similar content',
                category: 'content',
            },
        },

        // ============= RATE LIMIT ERRORS =============
        {
            pattern: ['rate limit', 'too many requests', 'throttled', 'slow down', '429', 'quota exceeded'],
            result: {
                message: 'Posting too quickly',
                suggestion: 'Wait a few minutes before trying again',
                category: 'rate_limit',
            },
        },
        {
            pattern: ['daily limit', 'reached limit', 'posting limit', 'maximum posts'],
            result: {
                message: 'You\'ve reached the daily posting limit',
                suggestion: 'Wait until tomorrow to post more content',
                category: 'rate_limit',
            },
        },

        // ============= PLATFORM ERRORS =============
        {
            pattern: ['account suspended', 'account disabled', 'account banned', 'account restricted'],
            result: {
                message: 'This account is restricted or suspended',
                suggestion: 'Check your platform account status directly',
                category: 'platform',
            },
        },
        {
            pattern: ['page not found', 'user not found', 'account not found', 'profile not found'],
            result: {
                message: 'Account no longer accessible',
                suggestion: 'Verify your account still exists and reconnect it',
                category: 'platform',
            },
        },
        {
            pattern: ['unavailable', 'service unavailable', 'temporarily unavailable', '503', 'maintenance'],
            result: {
                message: 'Platform is temporarily unavailable',
                suggestion: 'The platform is having issues - try again in a few minutes',
                category: 'platform',
            },
        },
        {
            pattern: ['internal error', '500', 'server error', 'internal server'],
            result: {
                message: 'Platform experienced an error',
                suggestion: 'This is a temporary issue - try publishing again shortly',
                category: 'platform',
            },
        },
        {
            pattern: ['board not found', 'invalid board', 'board does not exist'],
            result: {
                message: 'Selected Pinterest board not found',
                suggestion: 'Select a different board or create a new one',
                category: 'platform',
            },
        },

        // ============= NETWORK ERRORS =============
        {
            pattern: ['timeout', 'timed out', 'connection timeout', 'request timeout'],
            result: {
                message: 'Connection timed out',
                suggestion: 'Check your internet connection and try again',
                category: 'network',
            },
        },
        {
            pattern: ['network error', 'connection failed', 'connection refused', 'ECONNREFUSED'],
            result: {
                message: 'Network connection issue',
                suggestion: 'Check your internet connection and try again',
                category: 'network',
            },
        },
    ];

/**
 * Convert a raw error into a user-friendly message
 */
export function getUserFriendlyError(rawError: string | Error | unknown): UserFriendlyError {
    // Extract error message from various formats
    let errorText = '';

    if (typeof rawError === 'string') {
        errorText = rawError;
    } else if (rawError instanceof Error) {
        errorText = rawError.message;
    } else if (rawError && typeof rawError === 'object') {
        // Handle API error responses
        const obj = rawError as Record<string, unknown>;
        errorText = String(
            obj.message || obj.error || obj.error_message ||
            obj.error_description || obj.details || JSON.stringify(obj)
        );
    }

    const lowerError = errorText.toLowerCase();

    // Find matching pattern
    for (const { pattern, result } of ERROR_PATTERNS) {
        if (Array.isArray(pattern)) {
            // String array - check if any match
            if (pattern.some(p => lowerError.includes(p.toLowerCase()))) {
                return result;
            }
        } else {
            // Regex pattern
            if (pattern.test(lowerError)) {
                return result;
            }
        }
    }

    // Default fallback
    return {
        message: 'Something went wrong while publishing',
        suggestion: 'Try again, or contact support if the problem persists',
        category: 'unknown',
    };
}

/**
 * Get a one-line notification-friendly summary
 */
export function getNotificationErrorSummary(rawError: string | Error | unknown): string {
    const friendly = getUserFriendlyError(rawError);
    return `${friendly.message}. ${friendly.suggestion}`;
}
