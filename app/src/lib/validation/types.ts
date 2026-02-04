/**
 * Validation Engine Types
 * Core type definitions for the pre-publish validation system.
 * 
 * Why: Centralizes types to enable type-safe consumption
 * across rules, limits, and helper modules without circular deps.
 */

/**
 * Validation rule definition for platform-specific checks.
 */
export interface ValidationRule {
    id: string;
    platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'pinterest' | 'linkedin' | 'bluesky' | 'twitter' | 'google_business' | 'all';
    type: 'caption' | 'image' | 'video' | 'hashtag' | 'mention' | 'link' | 'postType';
    postTypes?: string[]; // Optional: Only apply to these post types
    check: (context: ValidationContext) => ValidationResult;
    autoFix?: (context: ValidationContext) => AutoFixResult | null;
}

/**
 * Context passed to validation rules containing post data.
 */
export interface ValidationContext {
    caption: string;
    hashtags: string[];
    mentions: string[];
    media: MediaInfo[];
    platforms: string[];
    postTypes?: Record<string, string>; // platform -> postType
    scheduledAt?: Date;
}

/**
 * Media file information for validation.
 */
export interface MediaInfo {
    id: string;
    type: 'image' | 'video';
    width: number;
    height: number;
    size: number; // bytes
    duration?: number; // seconds for video
    mimeType: string;
    format?: string; // file extension (mp4, mov, jpg, etc.)
}

/**
 * Result from a validation check.
 */
export interface ValidationResult {
    status: 'pass' | 'warning' | 'error';
    message: string;
    details?: string;
    canAutoFix?: boolean;
}

/**
 * Result from auto-fix attempt.
 */
export interface AutoFixResult {
    fixed: boolean;
    message: string;
    newValue?: unknown;
}

/**
 * Status for inline validation feedback.
 */
export type CharacterStatus = 'ok' | 'warning' | 'error';

/**
 * Character count result for real-time feedback.
 */
export interface CharacterCountResult {
    count: number;
    limit: number;
    recommended?: number;
    status: CharacterStatus;
    remaining: number;
    percentage: number;
}

/**
 * Hashtag count result for inline feedback.
 */
export interface HashtagCountResult {
    count: number;
    limit: number;
    recommended?: number;
    status: CharacterStatus;
    message?: string;
}

/**
 * Media aspect ratio validation result.
 */
export interface MediaAspectResult {
    ratio: number;
    ratioString: string;
    status: CharacterStatus;
    message: string;
    isOptimal: boolean;
}
