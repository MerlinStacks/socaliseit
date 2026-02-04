/**
 * Platform Content Limits
 * Maximum and recommended values for each social platform.
 * 
 * Why: Centralizes platform constraints for validation rules
 * and inline UI helpers. Easy to update when platforms change limits.
 */

/**
 * Platform content limits - caption, hashtag, image, and video constraints.
 */
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

/**
 * Post-type specific video limits (override platform defaults)
 * Why: Stories and Reels have stricter requirements than regular videos
 */
export const POST_TYPE_VIDEO_LIMITS = {
    instagram: {
        story: {
            minDuration: 3,
            maxDuration: 60,
            maxSize: 100 * 1024 * 1024, // 100MB
            aspectRatio: '9:16',
            formats: ['mp4', 'mov'],
        },
        reel: {
            minDuration: 3,
            maxDuration: 90,
            maxSize: 100 * 1024 * 1024, // 100MB
            aspectRatio: '9:16',
            formats: ['mp4', 'mov'],
        },
    },
    facebook: {
        story: {
            minDuration: 3,
            maxDuration: 60,
            maxSize: 100 * 1024 * 1024, // 100MB
            aspectRatio: '9:16',
            formats: ['mp4', 'mov'],
        },
        reel: {
            minDuration: 3,
            maxDuration: 60,
            maxSize: 100 * 1024 * 1024, // 100MB
            aspectRatio: '9:16',
            formats: ['mp4', 'mov'],
        },
    },
    tiktok: {
        post: {
            minDuration: 1,
            maxDuration: 600, // 10 min
            maxSize: 287 * 1024 * 1024, // 287MB
            aspectRatio: '9:16',
            formats: ['mp4', 'mov', 'webm'],
        },
    },
    youtube: {
        short: {
            minDuration: 1,
            maxDuration: 60,
            maxSize: 256 * 1024 * 1024, // 256MB for shorts
            aspectRatio: '9:16',
            formats: ['mp4', 'mov'],
        },
    },
} as const;

/**
 * Banned hashtags that may cause shadowban or reduced reach.
 */
export const BANNED_HASHTAGS = new Set([
    'followforfollow', 'f4f', 'like4like', 'l4l', 'follow4follow',
    // Add more banned/shadowbanned hashtags
]);
