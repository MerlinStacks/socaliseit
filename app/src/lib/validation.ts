/**
 * Pre-Publish Validation Engine
 * Platform-specific validation rules for social media posts
 */

export interface ValidationRule {
    id: string;
    platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'pinterest' | 'linkedin' | 'bluesky' | 'all';
    type: 'caption' | 'image' | 'video' | 'hashtag' | 'mention' | 'link' | 'postType';
    postTypes?: string[]; // Optional: Only apply to these post types
    check: (context: ValidationContext) => ValidationResult;
    autoFix?: (context: ValidationContext) => AutoFixResult | null;
}

export interface ValidationContext {
    caption: string;
    hashtags: string[];
    mentions: string[];
    media: MediaInfo[];
    platforms: string[];
    postTypes?: Record<string, string>; // platform -> postType
    scheduledAt?: Date;
}

export interface MediaInfo {
    id: string;
    type: 'image' | 'video';
    width: number;
    height: number;
    size: number; // bytes
    duration?: number; // seconds for video
    mimeType: string;
}

export interface ValidationResult {
    status: 'pass' | 'warning' | 'error';
    message: string;
    details?: string;
    canAutoFix?: boolean;
}

export interface AutoFixResult {
    fixed: boolean;
    message: string;
    newValue?: unknown;
}

// Platform limits
export const PLATFORM_LIMITS = {
    instagram: {
        caption: { max: 2200, recommended: 125 },
        hashtags: { max: 30, recommended: 5 },
        image: {
            minWidth: 320,
            maxWidth: 1440,
            aspectRatios: ['1:1', '1.91:1', '4:5'],
            maxSize: 30 * 1024 * 1024, // 30MB
            formats: ['jpg', 'jpeg', 'png'],
        },
        video: {
            minDuration: 3,
            maxDuration: 60, // Reels: 90s
            maxSize: 100 * 1024 * 1024, // 100MB
            formats: ['mp4', 'mov'],
        },
    },
    tiktok: {
        caption: { max: 2200, recommended: 150 },
        hashtags: { max: 100, recommended: 5 },
        video: {
            minDuration: 1,
            maxDuration: 600, // 10 minutes
            aspectRatios: ['9:16'],
            maxSize: 287 * 1024 * 1024, // 287MB
            formats: ['mp4', 'mov', 'webm'],
        },
    },
    youtube: {
        title: { max: 100 },
        description: { max: 5000 },
        video: {
            maxDuration: 12 * 60 * 60, // 12 hours
            maxSize: 256 * 1024 * 1024 * 1024, // 256GB
            formats: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm'],
        },
    },
    facebook: {
        caption: { max: 63206 },
        hashtags: { max: 30, recommended: 3 },
        image: {
            minWidth: 600,
            maxWidth: 2048,
            maxSize: 4 * 1024 * 1024, // 4MB
            formats: ['jpg', 'jpeg', 'png', 'gif'],
        },
        video: {
            maxDuration: 240 * 60, // 4 hours
            maxSize: 10 * 1024 * 1024 * 1024, // 10GB
        },
    },
    pinterest: {
        description: { max: 500 },
        image: {
            aspectRatios: ['2:3'],
            minWidth: 600,
            formats: ['jpg', 'jpeg', 'png'],
        },
    },
    linkedin: {
        caption: { max: 3000, recommended: 150 },
        hashtags: { max: 5, recommended: 3 },
        image: {
            minWidth: 552,
            maxWidth: 2048,
            maxSize: 8 * 1024 * 1024, // 8MB
            formats: ['jpg', 'jpeg', 'png', 'gif'],
        },
        video: {
            maxDuration: 10 * 60, // 10 minutes
            maxSize: 5 * 1024 * 1024 * 1024, // 5GB
        },
    },
    bluesky: {
        caption: { max: 300 },
        hashtags: { max: 0 }, // Bluesky doesn't use traditional hashtags
        image: {
            maxFiles: 4,
            maxSize: 1 * 1024 * 1024, // 1MB
            formats: ['jpg', 'jpeg', 'png', 'webp'],
        },
    },
    twitter: {
        caption: { max: 280, recommended: 100 },
        hashtags: { max: 10, recommended: 2 },
        image: {
            maxFiles: 4,
            maxSize: 5 * 1024 * 1024, // 5MB
            formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        },
        video: {
            maxDuration: 140, // 2:20
            maxSize: 512 * 1024 * 1024, // 512MB
            formats: ['mp4', 'mov'],
        },
    },
    google_business: {
        caption: { max: 1500 },
        image: {
            minWidth: 400,
            maxWidth: 4096,
            maxSize: 5 * 1024 * 1024, // 5MB
            formats: ['jpg', 'jpeg', 'png'],
        },
        video: {
            minDuration: 1,
            maxDuration: 30,
            maxSize: 75 * 1024 * 1024, // 75MB
            formats: ['mp4', 'mov'],
        },
    },
} as const;

// Banned hashtags (sample - would be much larger in production)
export const BANNED_HASHTAGS = new Set([
    'followforfollow', 'f4f', 'like4like', 'l4l', 'follow4follow',
    // Add more banned/shadowbanned hashtags
]);

/**
 * Validation rules for all platforms
 */
export const validationRules: ValidationRule[] = [
    // Caption length
    {
        id: 'caption-length-instagram',
        platform: 'instagram',
        type: 'caption',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.instagram.caption.max;
            const length = ctx.caption.length;
            if (length > limit) {
                return {
                    status: 'error',
                    message: `Caption too long (${length}/${limit})`,
                    details: `Remove ${length - limit} characters`,
                    canAutoFix: true,
                };
            }
            if (length > PLATFORM_LIMITS.instagram.caption.recommended) {
                return {
                    status: 'warning',
                    message: `Caption may be too long for engagement (${length}/${PLATFORM_LIMITS.instagram.caption.recommended} recommended)`,
                };
            }
            return { status: 'pass', message: `Caption length (${length}/${limit})` };
        },
        autoFix: (ctx) => {
            const limit = PLATFORM_LIMITS.instagram.caption.max;
            if (ctx.caption.length > limit) {
                return {
                    fixed: true,
                    message: 'Caption truncated to fit limit',
                    newValue: ctx.caption.slice(0, limit - 3) + '...',
                };
            }
            return null;
        },
    },

    // Hashtag count
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

    // Banned hashtags
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

    // Image aspect ratio
    {
        id: 'image-aspect-instagram',
        platform: 'instagram',
        type: 'image',
        check: (ctx) => {
            const images = ctx.media.filter((m) => m.type === 'image');
            if (images.length === 0) return { status: 'pass', message: 'No images to validate' };

            const allowedRatios = PLATFORM_LIMITS.instagram.image.aspectRatios;
            const issues: string[] = [];

            images.forEach((img) => {
                const ratio = img.width / img.height;
                const isSquare = Math.abs(ratio - 1) < 0.01;
                const isLandscape = Math.abs(ratio - 1.91) < 0.1;
                const isPortrait = Math.abs(ratio - 0.8) < 0.1;

                if (!isSquare && !isLandscape && !isPortrait) {
                    issues.push(`${img.id}: aspect ratio ${ratio.toFixed(2)} not optimal`);
                }
            });

            if (issues.length > 0) {
                return {
                    status: 'warning',
                    message: 'Image aspect ratio may be cropped',
                    details: issues.join(', '),
                    canAutoFix: false,
                };
            }

            return { status: 'pass', message: 'Image aspect ratio (1:1)' };
        },
    },

    // Image resolution
    {
        id: 'image-resolution-instagram',
        platform: 'instagram',
        type: 'image',
        check: (ctx) => {
            const images = ctx.media.filter((m) => m.type === 'image');
            if (images.length === 0) return { status: 'pass', message: 'No images to validate' };

            const minWidth = PLATFORM_LIMITS.instagram.image.minWidth;
            const recommended = 1440;

            for (const img of images) {
                if (img.width < minWidth) {
                    return {
                        status: 'error',
                        message: `Image too small (${img.width}px, min: ${minWidth}px)`,
                        canAutoFix: false,
                    };
                }
                if (img.width < recommended) {
                    return {
                        status: 'warning',
                        message: `Image resolution ${img.width}px (recommended: ${recommended}px)`,
                        canAutoFix: true,
                    };
                }
            }

            return { status: 'pass', message: 'Image resolution optimal' };
        },
    },

    // Video duration
    {
        id: 'video-duration-tiktok',
        platform: 'tiktok',
        type: 'video',
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = PLATFORM_LIMITS.tiktok.video;

            for (const video of videos) {
                if (video.duration && video.duration < limits.minDuration) {
                    return {
                        status: 'error',
                        message: `Video too short (${video.duration}s, min: ${limits.minDuration}s)`,
                    };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return {
                        status: 'error',
                        message: `Video too long (${video.duration}s, max: ${limits.maxDuration}s)`,
                        canAutoFix: true,
                    };
                }
            }

            return { status: 'pass', message: 'Video duration within limits' };
        },
    },

    // LinkedIn caption length
    {
        id: 'caption-length-linkedin',
        platform: 'linkedin',
        type: 'caption',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.linkedin.caption.max;
            const length = ctx.caption.length;
            if (length > limit) {
                return {
                    status: 'error',
                    message: `Caption too long (${length}/${limit})`,
                    details: `Remove ${length - limit} characters`,
                    canAutoFix: true,
                };
            }
            if (length > PLATFORM_LIMITS.linkedin.caption.recommended) {
                return {
                    status: 'warning',
                    message: `Caption may be too long for engagement`,
                };
            }
            return { status: 'pass', message: `Caption length (${length}/${limit})` };
        },
    },

    // LinkedIn hashtag limit (strict)
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

    // Bluesky caption length
    {
        id: 'caption-length-bluesky',
        platform: 'bluesky',
        type: 'caption',
        check: (ctx) => {
            const limit = PLATFORM_LIMITS.bluesky.caption.max;
            const length = ctx.caption.length;
            if (length > limit) {
                return {
                    status: 'error',
                    message: `Bluesky has ${limit} character limit (found ${length})`,
                    details: `Remove ${length - limit} characters`,
                    canAutoFix: true,
                };
            }
            return { status: 'pass', message: `Caption length (${length}/${limit})` };
        },
    },

    // Bluesky image count
    {
        id: 'image-count-bluesky',
        platform: 'bluesky',
        type: 'image',
        check: (ctx) => {
            const images = ctx.media.filter((m) => m.type === 'image');
            const maxFiles = PLATFORM_LIMITS.bluesky.image.maxFiles || 4;
            if (images.length > maxFiles) {
                return {
                    status: 'error',
                    message: `Bluesky allows max ${maxFiles} images (found ${images.length})`,
                };
            }
            return { status: 'pass', message: `Images (${images.length}/${maxFiles})` };
        },
    },

    // Reel/Short video duration check
    {
        id: 'video-duration-reel',
        platform: 'instagram',
        type: 'video',
        postTypes: ['reel'],
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            for (const video of videos) {
                if (video.duration && video.duration > 90) {
                    return {
                        status: 'error',
                        message: `Reel too long (${video.duration}s, max: 90s)`,
                    };
                }
                if (video.duration && video.duration < 3) {
                    return {
                        status: 'error',
                        message: `Reel too short (${video.duration}s, min: 3s)`,
                    };
                }
            }
            return { status: 'pass', message: 'Reel duration valid' };
        },
    },

    // Story video duration check
    {
        id: 'video-duration-story',
        platform: 'instagram',
        type: 'video',
        postTypes: ['story'],
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            for (const video of videos) {
                if (video.duration && video.duration > 15) {
                    return {
                        status: 'warning',
                        message: `Story video is long (${video.duration}s, recommended max: 15s)`,
                        details: 'Story videos over 15s may be split',
                    };
                }
            }
            return { status: 'pass', message: 'Story duration valid' };
        },
    },

    // Carousel media count
    {
        id: 'carousel-count-instagram',
        platform: 'instagram',
        type: 'image',
        postTypes: ['carousel'],
        check: (ctx) => {
            const mediaCount = ctx.media.length;
            if (mediaCount < 2) {
                return {
                    status: 'warning',
                    message: 'Carousels should have at least 2 items',
                };
            }
            if (mediaCount > 10) {
                return {
                    status: 'error',
                    message: `Instagram carousels allow max 10 items (found ${mediaCount})`,
                };
            }
            return { status: 'pass', message: `Carousel items (${mediaCount}/10)` };
        },
    },
];

/**
 * Run all applicable validation rules
 */
export function validatePost(context: ValidationContext): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const rule of validationRules) {
        // Check if rule applies to any of the selected platforms
        if (rule.platform !== 'all' && !context.platforms.includes(rule.platform)) {
            continue;
        }

        const result = rule.check(context);
        results.set(rule.id, result);
    }

    return results;
}

/**
 * Get validation summary
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

// ============================================================================
// Inline Validation Helpers
// ============================================================================

export type CharacterStatus = 'ok' | 'warning' | 'error';

export interface CharacterCountResult {
    count: number;
    limit: number;
    recommended?: number;
    status: CharacterStatus;
    remaining: number;
    percentage: number;
}

/**
 * Get real-time character count status for a specific platform
 * Why: Provides immediate feedback as user types, showing progress toward limits
 */
export function getCharacterStatus(
    text: string,
    platform: keyof typeof PLATFORM_LIMITS
): CharacterCountResult {
    const limits = PLATFORM_LIMITS[platform];
    if (!('caption' in limits)) {
        // Platform doesn't have caption limits (e.g., some video-only platforms)
        return {
            count: text.length,
            limit: Infinity,
            status: 'ok',
            remaining: Infinity,
            percentage: 0,
        };
    }

    const { max, recommended } = limits.caption as { max: number; recommended?: number };
    const count = text.length;
    const remaining = max - count;
    const percentage = (count / max) * 100;

    let status: CharacterStatus = 'ok';
    if (count > max) {
        status = 'error';
    } else if (recommended && count > recommended) {
        status = 'warning';
    } else if (percentage > 80) {
        status = 'warning';
    }

    return {
        count,
        limit: max,
        recommended,
        status,
        remaining,
        percentage: Math.min(percentage, 100),
    };
}

export interface HashtagCountResult {
    count: number;
    limit: number;
    recommended?: number;
    status: CharacterStatus;
    message?: string;
}

/**
 * Get hashtag count status with platform-specific warnings
 * Why: Different platforms have different hashtag limits and best practices
 */
export function getHashtagStatus(
    hashtags: string[],
    platform: keyof typeof PLATFORM_LIMITS
): HashtagCountResult {
    const limits = PLATFORM_LIMITS[platform];
    if (!('hashtags' in limits)) {
        return { count: hashtags.length, limit: Infinity, status: 'ok' };
    }

    const { max, recommended } = limits.hashtags as { max: number; recommended?: number };
    const count = hashtags.length;

    let status: CharacterStatus = 'ok';
    let message: string | undefined;

    if (count > max) {
        status = 'error';
        message = `Max ${max} hashtags allowed`;
    } else if (recommended && count > recommended) {
        status = 'warning';
        message = `${recommended} hashtags recommended for best engagement`;
    } else if (max > 0 && count > max * 0.8) {
        status = 'warning';
        message = `Approaching limit of ${max}`;
    }

    return { count, limit: max, recommended, status, message };
}

export interface MediaAspectResult {
    ratio: number;
    ratioString: string;
    status: CharacterStatus;
    message: string;
    isOptimal: boolean;
}

/**
 * Validate image/video aspect ratio for a platform before upload completes
 * Why: Catch dimension issues early to save users from failed uploads
 */
export function getMediaAspectStatus(
    width: number,
    height: number,
    platform: keyof typeof PLATFORM_LIMITS,
    mediaType: 'image' | 'video' = 'image'
): MediaAspectResult {
    const limits = PLATFORM_LIMITS[platform];
    const ratio = width / height;
    const ratioString = formatAspectRatio(ratio);

    // Default result for platforms without aspect limits
    const defaultResult: MediaAspectResult = {
        ratio,
        ratioString,
        status: 'ok',
        message: `Aspect ratio: ${ratioString}`,
        isOptimal: true,
    };

    if (platform === 'instagram') {
        // Instagram optimal ratios: 1:1 (square), 1.91:1 (landscape), 4:5 (portrait)
        const isSquare = Math.abs(ratio - 1) < 0.05;
        const isLandscape = Math.abs(ratio - 1.91) < 0.15;
        const isPortrait = Math.abs(ratio - 0.8) < 0.1;

        if (isSquare || isLandscape || isPortrait) {
            return { ...defaultResult, message: `Optimal: ${ratioString}` };
        }
        return {
            ratio,
            ratioString,
            status: 'warning',
            message: `${ratioString} may be cropped. Use 1:1, 4:5, or 1.91:1`,
            isOptimal: false,
        };
    }

    if (platform === 'tiktok') {
        // TikTok optimal: 9:16 (vertical)
        const isVertical = Math.abs(ratio - 0.5625) < 0.05;
        if (isVertical) {
            return { ...defaultResult, message: `Optimal: ${ratioString} (9:16)` };
        }
        return {
            ratio,
            ratioString,
            status: 'warning',
            message: `${ratioString} not optimal. Use 9:16 for TikTok`,
            isOptimal: false,
        };
    }

    if (platform === 'pinterest') {
        // Pinterest optimal: 2:3 (tall)
        const isTall = Math.abs(ratio - 0.667) < 0.1;
        if (isTall) {
            return { ...defaultResult, message: `Optimal: ${ratioString} (2:3)` };
        }
        return {
            ratio,
            ratioString,
            status: 'warning',
            message: `${ratioString} not optimal. Use 2:3 for Pinterest`,
            isOptimal: false,
        };
    }

    return defaultResult;
}

/**
 * Format aspect ratio as human-readable string
 */
function formatAspectRatio(ratio: number): string {
    if (Math.abs(ratio - 1) < 0.05) return '1:1';
    if (Math.abs(ratio - 1.91) < 0.1) return '1.91:1';
    if (Math.abs(ratio - 0.8) < 0.05) return '4:5';
    if (Math.abs(ratio - 0.5625) < 0.05) return '9:16';
    if (Math.abs(ratio - 1.778) < 0.05) return '16:9';
    if (Math.abs(ratio - 0.667) < 0.05) return '2:3';
    return `${ratio.toFixed(2)}:1`;
}
