/**
 * Video Validation Rules
 * Platform-specific video duration, size, and format validation.
 *
 * Why: Ensures videos meet platform requirements for successful upload.
 */

import type { ValidationRule } from '../types';
import { PLATFORM_LIMITS, POST_TYPE_VIDEO_LIMITS } from '../limits';

/**
 * Video validation rules for all platforms and post types.
 */
export const videoRules: ValidationRule[] = [
    // Instagram Feed video validation
    {
        id: 'video-instagram',
        platform: 'instagram',
        type: 'video',
        postTypes: ['feed'],
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            const limits = PLATFORM_LIMITS.instagram.video;

            for (const video of videos) {
                if (video.duration && video.duration < limits.minDuration) {
                    return { status: 'error', message: `Video too short (${video.duration}s, min: ${limits.minDuration}s)` };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return { status: 'error', message: `Video too long (${video.duration}s, max: ${limits.maxDuration}s)` };
                }
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    const maxMB = Math.round(limits.maxSize / (1024 * 1024));
                    return { status: 'error', message: `Video too large (${sizeMB}MB, max: ${maxMB}MB)` };
                }
                if (video.width && video.height) {
                    const ratio = video.width / video.height;
                    // Feed supports 4:5 (0.8) to 1.91:1 (1.91)
                    if (ratio < 0.8 || ratio > 1.92) {
                        return {
                            status: 'error',
                            message: `Feed video aspect ratio not supported. Use 4:5 to 1.91:1. For 9:16 vertical videos, switch to Reel.`,
                        };
                    }
                }
            }
            return { status: 'pass', message: 'Feed video valid' };
        },
    },

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
                if (video.size && video.size > limits.maxSize) {
                    const sizeMB = Math.round(video.size / (1024 * 1024));
                    const maxMB = Math.round(limits.maxSize / (1024 * 1024));
                    return {
                        status: 'error',
                        message: `Story video too large (${sizeMB}MB, max: ${maxMB}MB)`,
                    };
                }
                if (video.width && video.height) {
                    const ratio = video.width / video.height;
                    const isVertical = ratio < 0.7;
                    if (!isVertical) {
                        return {
                            status: 'warning',
                            message: `Story video should be vertical (9:16). Current: ${video.width}x${video.height}`,
                        };
                    }
                }
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

    // TikTok duration-only rule for API
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
                    return { status: 'error', message: `TikTok video too short (${video.duration}s, min: ${limits.minDuration}s)` };
                }
                if (video.duration && video.duration > limits.maxDuration) {
                    return { status: 'error', message: `TikTok video too long (${video.duration}s, max: ${limits.maxDuration}s)` };
                }
            }
            return { status: 'pass', message: 'TikTok video duration valid' };
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

    // Google Business video rejection
    // Why: Google My Business local posts only accept photos, not videos.
    {
        id: 'video-google-business',
        platform: 'google_business',
        type: 'video',
        check: (ctx) => {
            const videos = ctx.media.filter((m) => m.type === 'video');
            if (videos.length === 0) return { status: 'pass', message: 'No videos to validate' };

            return {
                status: 'error',
                message: 'Google Business only supports photos. Please remove the video.',
            };
        },
    },
];
