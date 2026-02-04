/**
 * Media Validation Helper
 * Per-item validation for media files against platform requirements.
 * 
 * Why: Enables showing validation issues directly on each media item
 * in the composer, rather than only in the global validation panel.
 */

import type { MediaInfo } from './types';
import { PLATFORM_LIMITS, POST_TYPE_VIDEO_LIMITS } from './limits';

/**
 * Single validation issue for a media item.
 */
export interface MediaValidationIssue {
    platform: string;
    severity: 'error' | 'warning';
    message: string;
    /** 
     * Type of issue for future auto-fix categorization
     * TODO: Use this for auto-fix scripts
     */
    fixType?: 'duration' | 'size' | 'aspect' | 'format';
}

/**
 * Validate a single media item against all selected platforms.
 * Returns array of issues grouped by platform and severity.
 */
export function validateMediaItem(
    media: MediaInfo,
    platforms: string[],
    postTypes: Record<string, string> = {}
): MediaValidationIssue[] {
    const issues: MediaValidationIssue[] = [];

    for (const platform of platforms) {
        const postType = postTypes[platform] || 'feed';
        const platformIssues = validateForPlatform(media, platform, postType);
        issues.push(...platformIssues);
    }

    return issues;
}

/**
 * Validate media against a specific platform's requirements.
 */
function validateForPlatform(
    media: MediaInfo,
    platform: string,
    postType: string
): MediaValidationIssue[] {
    const issues: MediaValidationIssue[] = [];

    if (media.type === 'video') {
        issues.push(...validateVideo(media, platform, postType));
    } else {
        issues.push(...validateImage(media, platform));
    }

    return issues;
}

/**
 * Validate video against platform limits.
 */
function validateVideo(
    video: MediaInfo,
    platform: string,
    postType: string
): MediaValidationIssue[] {
    const issues: MediaValidationIssue[] = [];

    // Get post-type specific limits if available
    const postTypeLimits = getPostTypeVideoLimits(platform, postType);
    const platformLimits = getPlatformVideoLimits(platform);
    const limits = postTypeLimits || platformLimits;

    if (!limits) return issues;

    // Duration checks
    if (video.duration) {
        if (limits.minDuration && video.duration < limits.minDuration) {
            issues.push({
                platform,
                severity: 'error',
                message: `Video too short (${video.duration}s, min: ${limits.minDuration}s)`,
                fixType: 'duration',
            });
        }
        if (limits.maxDuration && video.duration > limits.maxDuration) {
            issues.push({
                platform,
                severity: 'error',
                message: `Video too long (${Math.round(video.duration)}s, max: ${limits.maxDuration}s)`,
                fixType: 'duration',
            });
        }
    }

    // Size checks
    if (video.size && limits.maxSize && video.size > limits.maxSize) {
        const sizeMB = Math.round(video.size / (1024 * 1024));
        const maxMB = Math.round(limits.maxSize / (1024 * 1024));
        issues.push({
            platform,
            severity: 'error',
            message: `Video too large (${sizeMB}MB, max: ${maxMB}MB)`,
            fixType: 'size',
        });
    }

    // Aspect ratio checks
    if (video.width && video.height) {
        const ratio = video.width / video.height;
        const aspectIssue = checkAspectRatio(ratio, platform, postType);
        if (aspectIssue) {
            issues.push({ platform, ...aspectIssue, fixType: 'aspect' });
        }
    }

    // Format checks
    if (video.format && limits.formats) {
        const formats = limits.formats as readonly string[];
        if (!formats.includes(video.format.toLowerCase())) {
            issues.push({
                platform,
                severity: 'error',
                message: `Format not supported: ${video.format}. Use ${formats.join(', ').toUpperCase()}`,
                fixType: 'format',
            });
        }
    }

    return issues;
}

/**
 * Validate image against platform limits.
 */
function validateImage(
    image: MediaInfo,
    platform: string
): MediaValidationIssue[] {
    const issues: MediaValidationIssue[] = [];
    const limits = getPlatformImageLimits(platform);

    if (!limits) return issues;

    // Size checks
    if (image.size && limits.maxSize && image.size > limits.maxSize) {
        const sizeMB = (image.size / (1024 * 1024)).toFixed(1);
        const maxMB = Math.round(limits.maxSize / (1024 * 1024));
        issues.push({
            platform,
            severity: 'error',
            message: `Image too large (${sizeMB}MB, max: ${maxMB}MB)`,
            fixType: 'size',
        });
    }

    // Resolution checks
    if (image.width && limits.minWidth && image.width < limits.minWidth) {
        issues.push({
            platform,
            severity: 'error',
            message: `Image too small (${image.width}px, min: ${limits.minWidth}px)`,
        });
    }

    // Format checks
    if (image.format && limits.formats) {
        const formats = limits.formats as readonly string[];
        if (!formats.includes(image.format.toLowerCase())) {
            issues.push({
                platform,
                severity: 'error',
                message: `Format not supported: ${image.format}`,
                fixType: 'format',
            });
        }
    }

    return issues;
}

/**
 * Check aspect ratio requirements based on platform and post type.
 */
function checkAspectRatio(
    ratio: number,
    platform: string,
    postType: string
): { severity: 'error' | 'warning'; message: string } | null {
    // Vertical check for stories/reels/shorts
    const needsVertical = ['story', 'reel', 'short'].includes(postType) ||
        platform === 'tiktok';

    if (needsVertical && ratio > 0.7) {
        const isStrict = ['story', 'reel'].includes(postType);
        return {
            severity: isStrict ? 'warning' : 'warning',
            message: `Should be vertical (9:16). Current: ${ratio.toFixed(2)}:1`,
        };
    }

    // Instagram feed specific ratio check
    if (platform === 'instagram' && postType === 'feed') {
        if (ratio < 0.8 || ratio > 1.92) {
            return {
                severity: 'error',
                message: `Aspect ratio not supported (${ratio.toFixed(2)}:1). Use 4:5 to 1.91:1, or switch to Reel for vertical.`,
            };
        }
    }

    return null;
}

// =============================================================================
// Limit Getters
// =============================================================================

function getPostTypeVideoLimits(platform: string, postType: string) {
    const platformLimits = POST_TYPE_VIDEO_LIMITS[platform as keyof typeof POST_TYPE_VIDEO_LIMITS];
    if (!platformLimits) return null;
    return platformLimits[postType as keyof typeof platformLimits] || null;
}

function getPlatformVideoLimits(platform: string) {
    const limits = PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS];
    return limits?.video || null;
}

function getPlatformImageLimits(platform: string) {
    const limits = PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS];
    return limits?.image || null;
}

// =============================================================================
// Summary Helpers
// =============================================================================

/**
 * Get a summary of issues for display.
 */
export function getMediaValidationSummary(issues: MediaValidationIssue[]): {
    errorCount: number;
    warningCount: number;
    platforms: string[];
} {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const platforms = [...new Set(issues.map(i => i.platform))];

    return {
        errorCount: errors.length,
        warningCount: warnings.length,
        platforms,
    };
}

/**
 * Get display-friendly platform name.
 */
export function getPlatformDisplayName(platform: string): string {
    const names: Record<string, string> = {
        instagram: 'Instagram',
        facebook: 'Facebook',
        tiktok: 'TikTok',
        youtube: 'YouTube',
        linkedin: 'LinkedIn',
        twitter: 'Twitter/X',
        bluesky: 'Bluesky',
        pinterest: 'Pinterest',
        google_business: 'Google Business',
    };
    return names[platform] || platform;
}
