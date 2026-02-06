/**
 * Hashtag Validation Rules
 * Platform-specific hashtag count and banned hashtag detection.
 *
 * Why: Prevents shadowbans and ensures hashtag limits are respected.
 */

import type { ValidationRule } from '../types';
import { PLATFORM_LIMITS, BANNED_HASHTAGS } from '../limits';

/**
 * Hashtag validation rules for all platforms.
 */
export const hashtagRules: ValidationRule[] = [
    {
        id: 'hashtag-count-instagram',
        platform: 'instagram',
        type: 'hashtag',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.instagram.hashtags.max;
            const count = ctx.hashtags.length;
            if (count > limit) {
                return {
                    status: 'error',
                    message: `Too many hashtags (${count}/${limit})`,
                    canAutoFix: true,
                };
            }
            return { status: 'pass', message: `Hashtags (${count}/${limit})` };
        },
        autoFix: (ctx) => {
            const limit = PLATFORM_LIMITS.instagram.hashtags.max;
            if (ctx.hashtags.length > limit) {
                return {
                    fixed: true,
                    message: `Removed ${ctx.hashtags.length - limit} hashtags`,
                    newValue: ctx.hashtags.slice(0, limit),
                };
            }
            return null;
        },
    },

    {
        id: 'hashtag-count-linkedin',
        platform: 'linkedin',
        type: 'hashtag',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.linkedin.hashtags.max;
            const count = ctx.hashtags.length;
            if (count > limit) {
                return {
                    status: 'error',
                    message: `LinkedIn allows max ${limit} hashtags (found ${count})`,
                    details: 'Using too many hashtags on LinkedIn reduces engagement',
                    canAutoFix: true,
                };
            }
            return { status: 'pass', message: `Hashtags (${count}/${limit})` };
        },
    },

    {
        id: 'banned-hashtags',
        platform: 'all',
        type: 'hashtag',
        check: (ctx) => {
            const banned = ctx.hashtags.filter((h) =>
                BANNED_HASHTAGS.has(h.toLowerCase().replace('#', ''))
            );
            if (banned.length > 0) {
                return {
                    status: 'error',
                    message: `Banned hashtags detected: ${banned.join(', ')}`,
                    details: 'These hashtags may result in shadowban',
                    canAutoFix: true,
                };
            }
            return { status: 'pass', message: 'No banned hashtags' };
        },
        autoFix: (ctx) => {
            const banned = ctx.hashtags.filter((h) =>
                BANNED_HASHTAGS.has(h.toLowerCase().replace('#', ''))
            );
            if (banned.length > 0) {
                return {
                    fixed: true,
                    message: `Removed ${banned.length} banned hashtags`,
                    newValue: ctx.hashtags.filter(
                        (h) => !BANNED_HASHTAGS.has(h.toLowerCase().replace('#', ''))
                    ),
                };
            }
            return null;
        },
    },
];
