/**
 * Validation Rules
 * Platform-specific validation rules for social media posts.
 *
 * Why: Centralizes all validation logic in one place while keeping
 * it separate from types, limits, and helper functions.
 *
 * Note: Rules are now modularized in ./rules/ directory.
 * This file re-exports the combined rules and core validation functions.
 */

import type { ValidationContext, ValidationResult } from './types';
import { captionRules } from './rules/caption-rules';
import { hashtagRules } from './rules/hashtag-rules';
import { imageRules } from './rules/image-rules';
import { videoRules } from './rules/video-rules';

/**
 * All validation rules for pre-publish checks.
 * Combined from modular rule files.
 */
export const validationRules = [
    ...captionRules,
    ...hashtagRules,
    ...imageRules,
    ...videoRules,
];

// Re-export individual rule arrays for selective imports
export { captionRules, hashtagRules, imageRules, videoRules };

// =============================================================================
// Core Validation Functions
// =============================================================================

/**
 * Run all applicable validation rules for the given context.
 */
export function validatePost(context: ValidationContext): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const rule of validationRules) {
        // Check if rule applies to any of the selected platforms
        if (rule.platform !== 'all' && !context.platforms.includes(rule.platform)) {
            continue;
        }

        // Check if rule applies to the specific post type
        if (rule.postTypes && rule.platform !== 'all') {
            const postTypes = context.postTypes;
            if (postTypes) {
                const currentPostType = postTypes[rule.platform];
                if (currentPostType && !rule.postTypes.includes(currentPostType)) {
                    continue;
                }
            }
        }

        const result = rule.check(context);
        results.set(rule.id, result);
    }

    return results;
}

/**
 * Get validation summary with counts and publish eligibility.
 */
export function getValidationSummary(results: Map<string, ValidationResult>): {
    errors: number;
    warnings: number;
    passed: number;
    canPublish: boolean;
} {
    let errors = 0;
    let warnings = 0;
    let passed = 0;

    results.forEach((result) => {
        switch (result.status) {
            case 'error':
                errors++;
                break;
            case 'warning':
                warnings++;
                break;
            case 'pass':
                passed++;
                break;
        }
    });

    return {
        errors,
        warnings,
        passed,
        canPublish: errors === 0,
    };
}
