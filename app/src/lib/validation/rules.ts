/**
 * Validation Rules
 * Platform-specific validation rules for social media posts.
 * 
 * Why: Centralizes all validation logic in one place while keeping
 * it separate from types, limits, and helper functions.
 */

import type { ValidationRule, ValidationContext, ValidationResult } from './types';
import { PLATFORM_LIMITS, POST_TYPE_VIDEO_LIMITS, BANNED_HASHTAGS } from './limits';

/**
 * All validation rules for pre-publish checks.
 */
export const validationRules: ValidationRule[] = [
    // ==========================================================================
    // Caption Length Rules
    // ==========================================================================
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

    // ==========================================================================
    // Hashtag Rules
    // ==========================================================================
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

    // ==========================================================================
    // Image Rules
    // ==========================================================================
    {
        id: 'image-aspect-instagram',
        platform: 'instagram',
        type: 'image',
        check: (ctx) => {
            const images = ctx.media.filter((m) => m.type === 'image');
            if (images.length === 0) return { status: 'pass', message: 'No images to validate' };

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

    // ==========================================================================
    // Video Rules - Comprehensive Validation
    // ==========================================================================

    // Instagram Story video validation
    {
        id: 'video-instagram-story',
        platform: 'instagram',
        type: 'video',
        postTypes: ['story'],
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = POST_TYPE_VIDEO_LIMITS.instagram.story;

            for (const video of videos) {
                // Duration check
                if (video.duration && video.duration < limits.minDuration) {
                    return {
                        status: 'error',
                        message: `Story video too short (${video.duration}s, min: ${limits.minDuration}s)`,
                    };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return {
                        status: 'error',
                        message: `Story video too long (${video.duration}s, max: ${limits.maxDuration}s)`,
                    };
                }
                // Size check
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    const maxMB = Math.round(limits.maxSize / (1024 * 1024));
                    return {
                        status: 'error',
                        message: `Story video too large (${sizeMB}MB, max: ${maxMB}MB)`,
                    };
                }
                // Aspect ratio check
                if (video.width && video.height) {
                    const ratio = video.width / video.height;
                    const isVertical = ratio < 0.7; // Roughly 9:16
                    if (!isVertical) {
                        return {
                            status: 'warning',
                            message: `Story video should be vertical (9:16). Current: ${video.width}x${video.height}`,
                        };
                    }
                }
                // Format check
                if (video.format && !(limits.formats as readonly string[]).includes(video.format.toLowerCase())) {
                    return {
                        status: 'error',
                        message: `Story video format not supported: ${video.format}. Use MP4 or MOV`,
                    };
                }
            }
            return { status: 'pass', message: 'Story video valid' };
        },
    },

    // Instagram Reel video validation
    {
        id: 'video-instagram-reel',
        platform: 'instagram',
        type: 'video',
        postTypes: ['reel'],
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = POST_TYPE_VIDEO_LIMITS.instagram.reel;

            for (const video of videos) {
                if (video.duration && video.duration < limits.minDuration) {
                    return {
                        status: 'error',
                        message: `Reel too short (${video.duration}s, min: ${limits.minDuration}s)`,
                    };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return {
                        status: 'error',
                        message: `Reel too long (${video.duration}s, max: ${limits.maxDuration}s)`,
                    };
                }
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    const maxMB = Math.round(limits.maxSize / (1024 * 1024));
                    return {
                        status: 'error',
                        message: `Reel too large (${sizeMB}MB, max: ${maxMB}MB)`,
                    };
                }
                if (video.width && video.height) {
                    const ratio = video.width / video.height;
                    if (ratio > 0.7) {
                        return {
                            status: 'warning',
                            message: `Reel should be vertical (9:16). Current: ${video.width}x${video.height}`,
                        };
                    }
                }
                if (video.format && !(limits.formats as readonly string[]).includes(video.format.toLowerCase())) {
                    return {
                        status: 'error',
                        message: `Reel format not supported: ${video.format}. Use MP4 or MOV`,
                    };
                }
            }
            return { status: 'pass', message: 'Reel video valid' };
        },
    },

    // Facebook Story video validation
    {
        id: 'video-facebook-story',
        platform: 'facebook',
        type: 'video',
        postTypes: ['story'],
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = POST_TYPE_VIDEO_LIMITS.facebook.story;

            for (const video of videos) {
                if (video.duration && video.duration < limits.minDuration) {
                    return {
                        status: 'error',
                        message: `Facebook Story too short (${video.duration}s, min: ${limits.minDuration}s)`,
                    };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return {
                        status: 'error',
                        message: `Facebook Story too long (${video.duration}s, max: ${limits.maxDuration}s)`,
                    };
                }
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    const maxMB = Math.round(limits.maxSize / (1024 * 1024));
                    return {
                        status: 'error',
                        message: `Facebook Story too large (${sizeMB}MB, max: ${maxMB}MB)`,
                    };
                }
                if (video.width && video.height && video.width / video.height > 0.7) {
                    return {
                        status: 'warning',
                        message: `Facebook Story should be vertical (9:16)`,
                    };
                }
            }
            return { status: 'pass', message: 'Facebook Story video valid' };
        },
    },

    // Facebook Reel video validation
    {
        id: 'video-facebook-reel',
        platform: 'facebook',
        type: 'video',
        postTypes: ['reel'],
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = POST_TYPE_VIDEO_LIMITS.facebook.reel;

            for (const video of videos) {
                if (video.duration && video.duration < limits.minDuration) {
                    return { status: 'error', message: `Facebook Reel too short (${video.duration}s, min: ${limits.minDuration}s)` };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return { status: 'error', message: `Facebook Reel too long (${video.duration}s, max: ${limits.maxDuration}s)` };
                }
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    return { status: 'error', message: `Facebook Reel too large (${sizeMB}MB, max: 100MB)` };
                }
            }
            return { status: 'pass', message: 'Facebook Reel video valid' };
        },
    },

    // TikTok video validation
    {
        id: 'video-tiktok',
        platform: 'tiktok',
        type: 'video',
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = PLATFORM_LIMITS.tiktok.video;

            for (const video of videos) {
                if (video.duration && video.duration < limits.minDuration) {
                    return { status: 'error', message: `TikTok video too short (${video.duration}s, min: ${limits.minDuration}s)` };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return { status: 'error', message: `TikTok video too long (${video.duration}s, max: ${limits.maxDuration}s)` };
                }
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    return { status: 'error', message: `TikTok video too large (${sizeMB}MB, max: 287MB)` };
                }
                if (video.width && video.height && video.width / video.height > 0.7) {
                    return { status: 'warning', message: 'TikTok videos perform best in vertical (9:16) format' };
                }
            }
            return { status: 'pass', message: 'TikTok video valid' };
        },
    },

    // YouTube Shorts validation
    {
        id: 'video-youtube-short',
        platform: 'youtube',
        type: 'video',
        postTypes: ['short'],
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = POST_TYPE_VIDEO_LIMITS.youtube.short;

            for (const video of videos) {
                if (video.duration && video.duration > limits.maxDuration) {
                    return { status: 'error', message: `YouTube Short too long (${video.duration}s, max: ${limits.maxDuration}s)` };
                }
                if (video.width && video.height && video.width / video.height > 0.7) {
                    return { status: 'warning', message: 'YouTube Shorts should be vertical (9:16)' };
                }
            }
            return { status: 'pass', message: 'YouTube Short valid' };
        },
    },

    // LinkedIn video validation
    {
        id: 'video-linkedin',
        platform: 'linkedin',
        type: 'video',
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = PLATFORM_LIMITS.linkedin.video;

            for (const video of videos) {
                if (video.duration && video.duration > limits.maxDuration) {
                    return { status: 'error', message: `LinkedIn video too long (${video.duration}s, max: ${limits.maxDuration}s)` };
                }
                if (video.size && video.size > limits.maxSize) {
                    const sizeGB = (video.size / (1024 * 1024 * 1024)).toFixed(1);
                    return { status: 'error', message: `LinkedIn video too large (${sizeGB}GB, max: 5GB)` };
                }
            }
            return { status: 'pass', message: 'LinkedIn video valid' };
        },
    },

    // Twitter/X video validation
    {
        id: 'video-twitter',
        platform: 'twitter',
        type: 'video',
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = PLATFORM_LIMITS.twitter.video;

            for (const video of videos) {
                if (video.duration && video.duration > limits.maxDuration) {
                    return { status: 'error', message: `Twitter video too long (${video.duration}s, max: ${limits.maxDuration}s)` };
                }
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    return { status: 'error', message: `Twitter video too large (${sizeMB}MB, max: 512MB)` };
                }
            }
            return { status: 'pass', message: 'Twitter video valid' };
        },
    },

    // Google Business video validation
    {
        id: 'video-google-business',
        platform: 'google_business',
        type: 'video',
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = PLATFORM_LIMITS.google_business.video;

            for (const video of videos) {
                if (video.duration && video.duration < limits.minDuration) {
                    return { status: 'error', message: `Google Business video too short (${video.duration}s, min: ${limits.minDuration}s)` };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return { status: 'error', message: `Google Business video too long (${video.duration}s, max: ${limits.maxDuration}s)` };
                }
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    return { status: 'error', message: `Google Business video too large (${sizeMB}MB, max: 75MB)` };
                }
            }
            return { status: 'pass', message: 'Google Business video valid' };
        },
    },
];

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
