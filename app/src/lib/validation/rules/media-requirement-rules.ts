/**
 * Media Requirement Validation Rules
 *
 * Why: TikTok and YouTube require video/media but previously only
 * failed at the API level with cryptic errors. This catches it
 * early in the validation panel.
 */

import type { ValidationRule } from '../types';

/** Platform-specific media requirement rules. */
export const mediaRequirementRules: ValidationRule[] = [
    {
        id: 'tiktok-media-required',
        platform: 'tiktok',
        type: 'video',
        check: (context) => {
            if (context.media.length === 0) {
                return {
                    status: 'error',
                    message: 'TikTok requires at least one video or image',
                };
            }
            return { status: 'pass', message: 'Media attached' };
        },
    },
    {
        id: 'youtube-media-required',
        platform: 'youtube',
        type: 'video',
        check: (context) => {
            const hasVideo = context.media.some(m => m.type === 'video');
            if (!hasVideo) {
                return {
                    status: 'error',
                    message: 'YouTube requires a video file',
                };
            }
            return { status: 'pass', message: 'Video attached' };
        },
    },
];
