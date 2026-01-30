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
