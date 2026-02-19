/**
 * Pre-Publish Media Validation
 * 
 * Why: Buffer and Vista Social validate media against platform constraints
 * BEFORE attempting to publish, giving users actionable errors rather than
 * opaque platform API failures. This utility checks file size, dimensions,
 * duration, and format against the constraints defined in platform-config.ts.
 * 
 * Can be used both server-side (in the orchestrator) and client-side (in the composer).
 */

import { PLATFORM_SPECS, type Platform, type PostType, type MediaConstraints } from '@/lib/platform-config';

export interface MediaValidationItem {
    type: 'image' | 'video';
    /** File size in bytes */
    size: number;
    /** Width in pixels (images and videos) */
    width?: number;
    /** Height in pixels */
    height?: number;
    /** Duration in seconds (videos only) */
    duration?: number;
    /** MIME type */
    mimeType?: string;
    /** Original filename for error messages */
    filename?: string;
}

export interface ValidationError {
    field: string;
    message: string;
    /** Current value */
    actual: string | number;
    /** Maximum/minimum allowed */
    limit: string | number;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: string[];
}

/**
 * Validate media items against platform constraints before publishing.
 * Returns actionable errors that can be displayed to the user.
 */
export function validateMediaForPlatform(
    media: MediaValidationItem[],
    platform: Platform,
    postType: PostType,
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    const spec = PLATFORM_SPECS[platform];
    if (!spec) {
        return { valid: true, errors: [], warnings: ['Unknown platform, skipping validation'] };
    }

    const constraints = spec.mediaConstraints?.[postType];
    if (!constraints) {
        return { valid: true, errors: [], warnings: [] };
    }

    // Check total media count
    if (media.length > constraints.maxFiles) {
        errors.push({
            field: 'mediaCount',
            message: `${spec.name} allows at most ${constraints.maxFiles} media item(s) for ${postType} posts`,
            actual: media.length,
            limit: constraints.maxFiles,
        });
    }

    for (let i = 0; i < media.length; i++) {
        const item = media[i];
        const label = item.filename || `Media ${i + 1}`;

        if (item.type === 'image' && constraints.image) {
            validateImage(item, constraints.image, label, spec.name, errors, warnings);
        }

        if (item.type === 'video' && constraints.video) {
            validateVideo(item, constraints.video, label, spec.name, errors, warnings);
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

function validateImage(
    item: MediaValidationItem,
    constraints: NonNullable<MediaConstraints['image']>,
    label: string,
    platformName: string,
    errors: ValidationError[],
    warnings: string[],
) {
    // File size
    if (item.size > constraints.maxSize) {
        const maxMB = Math.round(constraints.maxSize / (1024 * 1024));
        const actualMB = (item.size / (1024 * 1024)).toFixed(1);
        errors.push({
            field: 'imageSize',
            message: `"${label}" is ${actualMB}MB — ${platformName} limit is ${maxMB}MB`,
            actual: Number(actualMB),
            limit: maxMB,
        });
    }

    // Width too small
    if (item.width && constraints.minWidth && item.width < constraints.minWidth) {
        errors.push({
            field: 'imageWidth',
            message: `"${label}" is ${item.width}px wide — ${platformName} requires at least ${constraints.minWidth}px`,
            actual: item.width,
            limit: constraints.minWidth,
        });
    }

    // Width too large (warning only — auto-resize can handle this)
    if (item.width && constraints.maxWidth && item.width > constraints.maxWidth) {
        warnings.push(
            `"${label}" is ${item.width}px wide (${platformName} recommends max ${constraints.maxWidth}px) — will be auto-resized`,
        );
    }

    // Format check
    if (item.mimeType && constraints.formats.length > 0) {
        const allowed = constraints.formats.map(f => f.toLowerCase());
        if (!allowed.some(f => item.mimeType!.toLowerCase().includes(f))) {
            errors.push({
                field: 'imageFormat',
                message: `"${label}" format (${item.mimeType}) is not supported by ${platformName}. Allowed: ${constraints.formats.join(', ')}`,
                actual: item.mimeType,
                limit: constraints.formats.join(', '),
            });
        }
    }
}

function validateVideo(
    item: MediaValidationItem,
    constraints: NonNullable<MediaConstraints['video']>,
    label: string,
    platformName: string,
    errors: ValidationError[],
    warnings: string[],
) {
    // File size
    if (item.size > constraints.maxSize) {
        const maxMB = Math.round(constraints.maxSize / (1024 * 1024));
        const actualMB = (item.size / (1024 * 1024)).toFixed(1);
        errors.push({
            field: 'videoSize',
            message: `"${label}" is ${actualMB}MB — ${platformName} limit is ${maxMB}MB`,
            actual: Number(actualMB),
            limit: maxMB,
        });
    }

    // Duration too short
    if (item.duration != null && constraints.minDuration && item.duration < constraints.minDuration) {
        errors.push({
            field: 'videoDuration',
            message: `"${label}" is ${item.duration}s — ${platformName} requires at least ${constraints.minDuration}s`,
            actual: item.duration,
            limit: constraints.minDuration,
        });
    }

    // Duration too long
    if (item.duration != null && constraints.maxDuration && item.duration > constraints.maxDuration) {
        const maxMin = constraints.maxDuration >= 60
            ? `${Math.floor(constraints.maxDuration / 60)}m${constraints.maxDuration % 60 ? ` ${constraints.maxDuration % 60}s` : ''}`
            : `${constraints.maxDuration}s`;
        const actualMin = item.duration >= 60
            ? `${Math.floor(item.duration / 60)}m ${Math.round(item.duration % 60)}s`
            : `${Math.round(item.duration)}s`;
        errors.push({
            field: 'videoDuration',
            message: `"${label}" is ${actualMin} — ${platformName} limit is ${maxMin}`,
            actual: item.duration,
            limit: constraints.maxDuration,
        });
    }

    // Resolution check
    if (item.width && constraints.maxWidth && item.width > constraints.maxWidth) {
        warnings.push(
            `"${label}" is ${item.width}px wide (${platformName} max ${constraints.maxWidth}px) — will be transcoded`,
        );
    }

    // Format check
    if (item.mimeType && constraints.formats.length > 0) {
        const allowed = constraints.formats.map(f => f.toLowerCase());
        if (!allowed.some(f => item.mimeType!.toLowerCase().includes(f))) {
            errors.push({
                field: 'videoFormat',
                message: `"${label}" format (${item.mimeType}) is not supported by ${platformName}. Allowed: ${constraints.formats.join(', ')}`,
                actual: item.mimeType,
                limit: constraints.formats.join(', '),
            });
        }
    }
}
