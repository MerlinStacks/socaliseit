/**
 * Validation Module
 * Barrel file re-exporting all validation functionality.
 * 
 * Why: Single import point maintains backwards compatibility
 * while enabling modular internal structure.
 */

// Types
export type {
    ValidationRule,
    ValidationContext,
    MediaInfo,
    ValidationResult,
    AutoFixResult,
    CharacterStatus,
    CharacterCountResult,
    HashtagCountResult,
    MediaAspectResult,
} from './types';

// Limits
export { PLATFORM_LIMITS, BANNED_HASHTAGS } from './limits';

// Rules & Core Validators
export { validationRules, validatePost, getValidationSummary } from './rules';

// Inline Helpers
export { getCharacterStatus, getHashtagStatus, getMediaAspectStatus } from './helpers';

// Media Validation
export {
    validateMediaItem,
    getMediaValidationSummary,
    getPlatformDisplayName,
    type MediaValidationIssue,
} from './media-validation';
