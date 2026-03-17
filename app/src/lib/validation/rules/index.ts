/**
 * Validation Rules Index
 * Re-exports all validation rules as a unified array.
 *
 * Why: Provides single import point while keeping rules modularized.
 */

import { captionRules } from './caption-rules';
import { commonRules } from './common-rules';
import { hashtagRules } from './hashtag-rules';
import { imageRules } from './image-rules';
import { videoRules } from './video-rules';
import { pinterestRules } from './pinterest-rules';
import { tiktokRules } from './tiktok-rules';
import { youtubeRules } from './youtube-rules';
import { mediaRequirementRules } from './media-requirement-rules';

/**
 * All validation rules combined.
 * Export individual arrays for selective imports if needed.
 */
export const VALIDATION_RULES = [
    ...captionRules,
    ...hashtagRules,
    ...imageRules,
    ...videoRules,
    ...pinterestRules,
    ...tiktokRules,
    ...youtubeRules,
    ...commonRules,
    ...mediaRequirementRules,
];

export { captionRules, hashtagRules, imageRules, videoRules, pinterestRules, tiktokRules, youtubeRules, commonRules, mediaRequirementRules };

