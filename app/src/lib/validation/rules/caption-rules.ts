/**
 * Caption Validation Rules
 * Platform-specific caption length validation.
 *
 * Why: Ensures captions fit platform requirements before publish.
 */

import type { ValidationRule } from '../types';
import { PLATFORM_LIMITS } from '../limits';

/**
 * Caption length validation rules for all platforms.
 */
export const captionRules: ValidationRule[] = [
    {
        id: 'caption-length-instagram',
        platform: 'instagram',
        type: 'caption',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.instagram.caption.max;
            const length = ctx.caption.length;
            if (length > limit) {
                return {
                    status: 'error',
                    message: `Caption too long (${length}/${limit})`,
                    details: `Remove ${length - limit} characters`,
                    canAutoFix: true,
                };
            }
            if (length > PLATFORM_LIMITS.instagram.caption.recommended) {
                return {
                    status: 'warning',
                    message: `Caption may be too long for engagement (${length}/${PLATFORM_LIMITS.instagram.caption.recommended} recommended)`,
                };
            }
            return { status: 'pass', message: `Caption length (${length}/${limit})` };
        },
        autoFix: (ctx) => {
            const limit = PLATFORM_LIMITS.instagram.caption.max;
            if (ctx.caption.length > limit) {
                return {
                    fixed: true,
                    message: 'Caption truncated to fit limit',
                    newValue: ctx.caption.slice(0, limit - 3) + '...',
                };
            }
            return null;
        },
    },

    {
        id: 'caption-length-linkedin',
        platform: 'linkedin',
        type: 'caption',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.linkedin.caption.max;
            const length = ctx.caption.length;
            if (length > limit) {
                return {
                    status: 'error',
                    message: `Caption too long (${length}/${limit})`,
                    details: `Remove ${length - limit} characters`,
                    canAutoFix: true,
                };
            }
            if (length > PLATFORM_LIMITS.linkedin.caption.recommended) {
                return {
                    status: 'warning',
                    message: `Caption may be too long for engagement`,
                };
            }
            return { status: 'pass', message: `Caption length (${length}/${limit})` };
        },
    },

    {
        id: 'caption-length-bluesky',
        platform: 'bluesky',
        type: 'caption',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.bluesky.caption.max;
            const length = ctx.caption.length;
            if (length > limit) {
                return {
                    status: 'error',
                    message: `Bluesky has ${limit} character limit (found ${length})`,
                    details: `Remove ${length - limit} characters`,
                    canAutoFix: true,
                };
            }
            return { status: 'pass', message: `Caption length (${length}/${limit})` };
        },
    },

    {
        id: 'caption-length-twitter',
        platform: 'twitter',
        type: 'caption',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.twitter.caption.max;
            const baseLength = ctx.caption.length;

            // Twitter wraps all URLs to 23 characters regardless of actual URL length
            const urlPattern = /https?:\/\/[^\s]+/g;
            const urls = ctx.caption.match(urlPattern) || [];
            const urlCharsInCaption = urls.reduce((sum, url) => sum + url.length, 0);
            const twitterUrlCount = urls.length;

            // Effective length = base length - actual URL chars + (23 * URL count)
            const effectiveLength = baseLength - urlCharsInCaption + (twitterUrlCount * 23);

            if (effectiveLength > limit) {
                return {
                    status: 'error',
                    message: `Tweet too long (${effectiveLength}/${limit} with URL expansion)`,
                    details: `Remove ${effectiveLength - limit} characters. Each URL counts as 23 chars.`,
                    canAutoFix: true,
                };
            }
            if (baseLength > limit) {
                return {
                    status: 'warning',
                    message: `Caption appears long but URLs will compress (${effectiveLength}/${limit})`,
                };
            }
            if (effectiveLength > PLATFORM_LIMITS.twitter.caption.recommended) {
                return {
                    status: 'warning',
                    message: `Tweet may be too long for engagement (${effectiveLength}/${PLATFORM_LIMITS.twitter.caption.recommended} recommended)`,
                };
            }
            return { status: 'pass', message: `Tweet length (${effectiveLength}/${limit})` };
        },
        autoFix: (ctx) => {
            const limit = PLATFORM_LIMITS.twitter.caption.max;
            if (ctx.caption.length > limit) {
                return {
                    fixed: true,
                    message: 'Caption truncated to fit Twitter limit',
                    newValue: ctx.caption.slice(0, limit - 3) + '...',
                };
            }
            return null;
        },
    },
];
