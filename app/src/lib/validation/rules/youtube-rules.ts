/**
 * YouTube Validation Rules
 *
 * Why: YouTube requires a video title for uploads. The UI marks it as
 * required but previously didn't enforce it at the validation level.
 * While the backend falls back to the caption, this creates a poor UX
 * where a video could be published with an auto-truncated caption as title.
 */

import type { ValidationRule } from '../types';

/** All YouTube-specific validation rules. */
export const youtubeRules: ValidationRule[] = [
    {
        id: 'youtube-title-required',
        platform: 'youtube',
        type: 'postType',
        check: (context) => {
            const videoTitle = context.platformSettings?.youtube?.videoTitle;
            if (!videoTitle || (typeof videoTitle === 'string' && videoTitle.trim().length === 0)) {
                return {
                    status: 'error',
                    message: 'Enter a video title before publishing to YouTube',
                };
            }
            return { status: 'pass', message: 'Video title provided' };
        },
    },
    {
        id: 'youtube-tags-limit',
        platform: 'youtube',
        type: 'postType',
        check: (context) => {
            const videoTags = context.platformSettings?.youtube?.videoTags;
            if (!videoTags || !Array.isArray(videoTags) || videoTags.length === 0) {
                return { status: 'pass', message: 'No tags' };
            }
            const totalChars = (videoTags as string[]).join(',').length;
            if (totalChars > 500) {
                return {
                    status: 'error',
                    message: `YouTube tags exceed 500 character limit (${totalChars}/500)`,
                };
            }
            if (totalChars > 400) {
                return {
                    status: 'warning',
                    message: `YouTube tags approaching limit (${totalChars}/500)`,
                };
            }
            return { status: 'pass', message: `Tags within limit (${totalChars}/500)` };
        },
    },
];
