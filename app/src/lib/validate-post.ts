/**
 * Post Content Validation
 * Server-side validation using PLATFORM_SPECS
 * 
 * Why: Provides server-side validation of content before publishing,
 * ensuring platform-specific limits are enforced even if client-side
 * validation is bypassed.
 */

import { PLATFORM_SPECS, type Platform } from './platform-config';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface ValidatePostContentOptions {
    caption?: string;
    title?: string;
    description?: string;
    mediaCount?: number;
}

/**
 * Validate post content against platform-specific limits.
 * Returns validation errors and warnings.
 */
export function validatePostContent(
    platform: Platform,
    content: ValidatePostContentOptions
): ValidationResult {
    const spec = PLATFORM_SPECS[platform];
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!spec) {
        errors.push(`Unknown platform: ${platform}`);
        return { valid: false, errors, warnings };
    }

    // Check caption length
    if (content.caption) {
        const captionLimit = spec.characterLimits.caption.max;
        if (content.caption.length > captionLimit) {
            errors.push(
                `Caption exceeds ${spec.name} limit of ${captionLimit.toLocaleString()} characters (current: ${content.caption.length.toLocaleString()})`
            );
        } else if (spec.characterLimits.caption.recommended && content.caption.length > spec.characterLimits.caption.recommended) {
            warnings.push(
                `Caption exceeds recommended length of ${spec.characterLimits.caption.recommended.toLocaleString()} characters for ${spec.name}`
            );
        }
    }

    // Check title length if applicable
    if (content.title && spec.characterLimits.title) {
        if (content.title.length > spec.characterLimits.title.max) {
            errors.push(
                `Title exceeds ${spec.name} limit of ${spec.characterLimits.title.max} characters (current: ${content.title.length})`
            );
        }
    }

    // Check description length if applicable
    if (content.description && spec.characterLimits.description) {
        if (content.description.length > spec.characterLimits.description.max) {
            errors.push(
                `Description exceeds ${spec.name} limit of ${spec.characterLimits.description.max} characters`
            );
        }
    }

    // Check media count - uses general mediaConstraints
    if (content.mediaCount !== undefined) {
        const mediaLimit = spec.mediaConstraints?.feed?.maxFiles || 10;
        if (content.mediaCount > mediaLimit) {
            errors.push(
                `Too many media files for ${spec.name} (max: ${mediaLimit}, provided: ${content.mediaCount})`
            );
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Validate multiple platforms at once.
 * Returns combined results keyed by platform.
 */
export function validatePostForPlatforms(
    platforms: Platform[],
    content: ValidatePostContentOptions
): Record<Platform, ValidationResult> {
    const results: Partial<Record<Platform, ValidationResult>> = {};

    for (const platform of platforms) {
        results[platform] = validatePostContent(platform, content);
    }

    return results as Record<Platform, ValidationResult>;
}

/**
 * Check if content is valid for all specified platforms.
 */
export function isValidForAllPlatforms(
    platforms: Platform[],
    content: ValidatePostContentOptions
): boolean {
    return platforms.every(platform => validatePostContent(platform, content).valid);
}

/**
 * Get the most restrictive character limit across multiple platforms.
 * Useful for showing a single limit when posting to multiple platforms.
 */
export function getMostRestrictiveCaptionLimit(platforms: Platform[]): number {
    if (platforms.length === 0) return 2200; // Default Instagram limit

    return Math.min(
        ...platforms.map(p => PLATFORM_SPECS[p]?.characterLimits.caption.max || 2200)
    );
}
