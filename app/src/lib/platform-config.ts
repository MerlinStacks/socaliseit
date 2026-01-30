/**
 * Platform Configuration System
 * Centralized specs for all social platforms including limits, post types, and constraints
 */

// Re-export Platform type from database schema for consistency
export type Platform =
    | 'instagram'
    | 'tiktok'
    | 'youtube'
    | 'facebook'
    | 'pinterest'
    | 'linkedin'
    | 'bluesky'
    | 'google_business';

export type PostType =
    | 'feed'
    | 'reel'
    | 'story'
    | 'carousel'
    | 'pin'
    | 'video'
    | 'article'
    | 'thread';

export interface CharacterLimits {
    caption: { max: number; recommended?: number };
    title?: { max: number };
    description?: { max: number };
    firstComment?: { max: number };
}

export interface MediaConstraints {
    maxFiles: number;
    image?: {
        minWidth: number;
        maxWidth: number;
        aspectRatios: string[];
        maxSize: number; // bytes
        formats: string[];
    };
    video?: {
        minDuration: number; // seconds
        maxDuration: number;
        maxSize: number;
        formats: string[];
        minWidth?: number;
        maxWidth?: number;
    };
}

export interface CallToAction {
    id: string;
    label: string;
}

export interface PlatformSpec {
    id: Platform;
    name: string;
    color: string;
    icon: string;
    characterLimits: CharacterLimits;
    supportedPostTypes: PostType[];
    mediaConstraints: Partial<Record<PostType, MediaConstraints>>;
    callToActions?: CallToAction[];
    hashtagLimit?: number;
    mentionLimit?: number;
    features: {
        scheduledPublishing: boolean;
        firstComment: boolean;
        locationTagging: boolean;
        productTagging: boolean;
        altText: boolean;
    };
}

/**
 * Comprehensive platform specifications
 * Why: Centralizes all platform-specific constraints to ensure consistent validation
 * and UI behavior across the application
 */
export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
    instagram: {
        id: 'instagram',
        name: 'Instagram',
        color: '#E4405F',
        icon: 'instagram',
        characterLimits: {
            caption: { max: 2200, recommended: 125 },
            firstComment: { max: 2200 },
        },
        supportedPostTypes: ['feed', 'reel', 'story', 'carousel'],
        hashtagLimit: 30,
        mentionLimit: 20,
        callToActions: [
            { id: 'learn_more', label: 'Learn More' },
            { id: 'shop_now', label: 'Shop Now' },
            { id: 'sign_up', label: 'Sign Up' },
            { id: 'contact_us', label: 'Contact Us' },
            { id: 'book_now', label: 'Book Now' },
            { id: 'watch_more', label: 'Watch More' },
        ],
        mediaConstraints: {
            feed: {
                maxFiles: 1,
                image: {
                    minWidth: 320,
                    maxWidth: 1440,
                    aspectRatios: ['1:1', '4:5', '1.91:1'],
                    maxSize: 8 * 1024 * 1024, // 8MB
                    formats: ['jpg', 'jpeg', 'png'],
                },
            },
            carousel: {
                maxFiles: 10,
                image: {
                    minWidth: 320,
                    maxWidth: 1440,
                    aspectRatios: ['1:1', '4:5'],
                    maxSize: 8 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png'],
                },
                video: {
                    minDuration: 3,
                    maxDuration: 60,
                    maxSize: 100 * 1024 * 1024, // 100MB
                    formats: ['mp4', 'mov'],
                },
            },
            reel: {
                maxFiles: 1,
                video: {
                    minDuration: 3,
                    maxDuration: 90,
                    maxSize: 1024 * 1024 * 1024, // 1GB
                    formats: ['mp4', 'mov'],
                    minWidth: 500,
                    maxWidth: 1920,
                },
            },
            story: {
                maxFiles: 1,
                image: {
                    minWidth: 600,
                    maxWidth: 1080,
                    aspectRatios: ['9:16'],
                    maxSize: 8 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png'],
                },
                video: {
                    minDuration: 1,
                    maxDuration: 15,
                    maxSize: 100 * 1024 * 1024,
                    formats: ['mp4', 'mov'],
                },
            },
        },
        features: {
            scheduledPublishing: true,
            firstComment: true,
            locationTagging: true,
            productTagging: true,
            altText: true,
        },
    },

    tiktok: {
        id: 'tiktok',
        name: 'TikTok',
        color: '#000000',
        icon: 'tiktok',
        characterLimits: {
            caption: { max: 2200, recommended: 150 },
        },
        supportedPostTypes: ['feed', 'carousel'],
        hashtagLimit: 100,
        callToActions: [
            { id: 'learn_more', label: 'Learn More' },
            { id: 'shop_now', label: 'Shop Now' },
            { id: 'sign_up', label: 'Sign Up' },
        ],
        mediaConstraints: {
            feed: {
                maxFiles: 1,
                video: {
                    minDuration: 3,
                    maxDuration: 600, // 10 minutes
                    maxSize: 4 * 1024 * 1024 * 1024, // 4GB
                    formats: ['mp4', 'mov', 'webm'],
                    minWidth: 720,
                    maxWidth: 1920,
                },
            },
            carousel: {
                maxFiles: 35,
                image: {
                    minWidth: 720,
                    maxWidth: 1920,
                    aspectRatios: ['9:16', '1:1'],
                    maxSize: 20 * 1024 * 1024, // 20MB
                    formats: ['jpg', 'jpeg', 'png', 'webp'],
                },
            },
        },
        features: {
            scheduledPublishing: true,
            firstComment: false,
            locationTagging: true,
            productTagging: true,
            altText: false,
        },
    },

    youtube: {
        id: 'youtube',
        name: 'YouTube',
        color: '#FF0000',
        icon: 'youtube',
        characterLimits: {
            caption: { max: 5000 },
            title: { max: 100 },
            description: { max: 5000 },
        },
        supportedPostTypes: ['video', 'reel'], // Shorts = reel
        hashtagLimit: 15,
        callToActions: [
            { id: 'subscribe', label: 'Subscribe' },
            { id: 'learn_more', label: 'Learn More' },
        ],
        mediaConstraints: {
            video: {
                maxFiles: 1,
                video: {
                    minDuration: 1,
                    maxDuration: 12 * 60 * 60, // 12 hours
                    maxSize: 256 * 1024 * 1024 * 1024, // 256GB
                    formats: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm', 'mkv'],
                },
            },
            reel: {
                maxFiles: 1,
                video: {
                    minDuration: 15,
                    maxDuration: 60,
                    maxSize: 256 * 1024 * 1024 * 1024,
                    formats: ['mp4', 'mov'],
                    minWidth: 1080,
                    maxWidth: 1920,
                },
            },
        },
        features: {
            scheduledPublishing: true,
            firstComment: false,
            locationTagging: false,
            productTagging: true,
            altText: false,
        },
    },

    facebook: {
        id: 'facebook',
        name: 'Facebook',
        color: '#1877F2',
        icon: 'facebook',
        characterLimits: {
            caption: { max: 63206 },
        },
        supportedPostTypes: ['feed', 'reel', 'story', 'carousel'],
        hashtagLimit: 30,
        callToActions: [
            { id: 'learn_more', label: 'Learn More' },
            { id: 'shop_now', label: 'Shop Now' },
            { id: 'sign_up', label: 'Sign Up' },
            { id: 'contact_us', label: 'Contact Us' },
            { id: 'book_now', label: 'Book Now' },
            { id: 'download', label: 'Download' },
            { id: 'get_offer', label: 'Get Offer' },
        ],
        mediaConstraints: {
            feed: {
                maxFiles: 1,
                image: {
                    minWidth: 600,
                    maxWidth: 2048,
                    aspectRatios: ['1:1', '4:5', '16:9', '1.91:1'],
                    maxSize: 4 * 1024 * 1024, // 4MB
                    formats: ['jpg', 'jpeg', 'png', 'gif'],
                },
                video: {
                    minDuration: 1,
                    maxDuration: 240 * 60, // 240 minutes
                    maxSize: 4 * 1024 * 1024 * 1024, // 4GB
                    formats: ['mp4', 'mov'],
                },
            },
            carousel: {
                maxFiles: 10,
                image: {
                    minWidth: 600,
                    maxWidth: 2048,
                    aspectRatios: ['1:1'],
                    maxSize: 4 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png'],
                },
            },
            reel: {
                maxFiles: 1,
                video: {
                    minDuration: 3,
                    maxDuration: 90,
                    maxSize: 1024 * 1024 * 1024,
                    formats: ['mp4', 'mov'],
                },
            },
            story: {
                maxFiles: 1,
                image: {
                    minWidth: 500,
                    maxWidth: 1080,
                    aspectRatios: ['9:16'],
                    maxSize: 4 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png'],
                },
                video: {
                    minDuration: 1,
                    maxDuration: 20,
                    maxSize: 100 * 1024 * 1024,
                    formats: ['mp4', 'mov'],
                },
            },
        },
        features: {
            scheduledPublishing: true,
            firstComment: false,
            locationTagging: true,
            productTagging: true,
            altText: true,
        },
    },

    pinterest: {
        id: 'pinterest',
        name: 'Pinterest',
        color: '#BD081C',
        icon: 'pinterest',
        characterLimits: {
            caption: { max: 500 },
            title: { max: 100 },
        },
        supportedPostTypes: ['pin', 'carousel'],
        hashtagLimit: 20,
        mediaConstraints: {
            pin: {
                maxFiles: 1,
                image: {
                    minWidth: 600,
                    maxWidth: 2000,
                    aspectRatios: ['2:3', '1:1'],
                    maxSize: 20 * 1024 * 1024, // 20MB
                    formats: ['jpg', 'jpeg', 'png'],
                },
                video: {
                    minDuration: 4,
                    maxDuration: 15 * 60, // 15 minutes
                    maxSize: 2 * 1024 * 1024 * 1024, // 2GB
                    formats: ['mp4', 'mov'],
                },
            },
            carousel: {
                maxFiles: 5,
                image: {
                    minWidth: 600,
                    maxWidth: 2000,
                    aspectRatios: ['1:1', '2:3'],
                    maxSize: 20 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png'],
                },
            },
        },
        features: {
            scheduledPublishing: true,
            firstComment: false,
            locationTagging: false,
            productTagging: true,
            altText: true,
        },
    },

    linkedin: {
        id: 'linkedin',
        name: 'LinkedIn',
        color: '#0A66C2',
        icon: 'linkedin',
        characterLimits: {
            caption: { max: 3000, recommended: 150 },
            title: { max: 200 },
        },
        supportedPostTypes: ['feed', 'carousel', 'video', 'article'],
        hashtagLimit: 5,
        callToActions: [
            { id: 'apply_now', label: 'Apply Now' },
            { id: 'learn_more', label: 'Learn More' },
            { id: 'sign_up', label: 'Sign Up' },
            { id: 'download', label: 'Download' },
            { id: 'register', label: 'Register' },
            { id: 'get_quote', label: 'Get Quote' },
        ],
        mediaConstraints: {
            feed: {
                maxFiles: 1,
                image: {
                    minWidth: 552,
                    maxWidth: 2048,
                    aspectRatios: ['1:1', '1.91:1', '4:5'],
                    maxSize: 8 * 1024 * 1024, // 8MB
                    formats: ['jpg', 'jpeg', 'png', 'gif'],
                },
                video: {
                    minDuration: 3,
                    maxDuration: 10 * 60, // 10 minutes
                    maxSize: 5 * 1024 * 1024 * 1024, // 5GB
                    formats: ['mp4', 'mov'],
                },
            },
            carousel: {
                maxFiles: 20,
                image: {
                    minWidth: 552,
                    maxWidth: 2048,
                    aspectRatios: ['1:1', '1.91:1'],
                    maxSize: 8 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png', 'pdf'],
                },
            },
            video: {
                maxFiles: 1,
                video: {
                    minDuration: 3,
                    maxDuration: 10 * 60,
                    maxSize: 5 * 1024 * 1024 * 1024,
                    formats: ['mp4', 'mov'],
                },
            },
            article: {
                maxFiles: 1,
                image: {
                    minWidth: 744,
                    maxWidth: 2048,
                    aspectRatios: ['1.91:1'],
                    maxSize: 8 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png'],
                },
            },
        },
        features: {
            scheduledPublishing: true,
            firstComment: false,
            locationTagging: false,
            productTagging: false,
            altText: true,
        },
    },

    bluesky: {
        id: 'bluesky',
        name: 'Bluesky',
        color: '#0085FF',
        icon: 'bluesky',
        characterLimits: {
            caption: { max: 300 },
        },
        supportedPostTypes: ['feed', 'thread'],
        hashtagLimit: 0, // Bluesky doesn't use traditional hashtags
        mediaConstraints: {
            feed: {
                maxFiles: 4,
                image: {
                    minWidth: 100,
                    maxWidth: 4096,
                    aspectRatios: ['any'],
                    maxSize: 1 * 1024 * 1024, // 1MB
                    formats: ['jpg', 'jpeg', 'png', 'webp'],
                },
            },
            thread: {
                maxFiles: 4,
                image: {
                    minWidth: 100,
                    maxWidth: 4096,
                    aspectRatios: ['any'],
                    maxSize: 1 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png', 'webp'],
                },
            },
        },
        features: {
            scheduledPublishing: true,
            firstComment: false,
            locationTagging: false,
            productTagging: false,
            altText: true,
        },
    },

    google_business: {
        id: 'google_business',
        name: 'Google Business',
        color: '#4285F4',
        icon: 'google',
        characterLimits: {
            caption: { max: 1500 },
        },
        supportedPostTypes: ['feed'],
        callToActions: [
            { id: 'learn_more', label: 'Learn More' },
            { id: 'book', label: 'Book' },
            { id: 'order', label: 'Order Online' },
            { id: 'shop', label: 'Shop' },
            { id: 'sign_up', label: 'Sign Up' },
            { id: 'call', label: 'Call Now' },
        ],
        mediaConstraints: {
            feed: {
                maxFiles: 1,
                image: {
                    minWidth: 400,
                    maxWidth: 4096,
                    aspectRatios: ['4:3', '1:1'],
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
        },
        features: {
            scheduledPublishing: false,
            firstComment: false,
            locationTagging: false,
            productTagging: false,
            altText: false,
        },
    },
};

/**
 * Get platform spec by ID
 */
export function getPlatformSpec(platform: Platform): PlatformSpec {
    return PLATFORM_SPECS[platform];
}

/**
 * Get supported post types for a platform
 */
export function getSupportedPostTypes(platform: Platform): PostType[] {
    return PLATFORM_SPECS[platform].supportedPostTypes;
}

/**
 * Get character limit for a platform's caption
 */
export function getCharacterLimit(platform: Platform): number {
    return PLATFORM_SPECS[platform].characterLimits.caption.max;
}

/**
 * Check if a post type is supported by a platform
 */
export function isPostTypeSupported(platform: Platform, postType: PostType): boolean {
    return PLATFORM_SPECS[platform].supportedPostTypes.includes(postType);
}

/**
 * Get CTAs available for a platform
 */
export function getCallToActions(platform: Platform): CallToAction[] {
    return PLATFORM_SPECS[platform].callToActions || [];
}

/**
 * Get media constraints for a platform and post type
 */
export function getMediaConstraints(platform: Platform, postType: PostType): MediaConstraints | undefined {
    return PLATFORM_SPECS[platform].mediaConstraints[postType];
}

/**
 * Format post type for display
 */
export function formatPostType(postType: PostType): string {
    const labels: Record<PostType, string> = {
        feed: 'Feed Post',
        reel: 'Reel / Short',
        story: 'Story',
        carousel: 'Carousel',
        pin: 'Pin',
        video: 'Video',
        article: 'Article',
        thread: 'Thread',
    };
    return labels[postType];
}

/**
 * Get icon for post type
 */
export function getPostTypeIcon(postType: PostType): string {
    const icons: Record<PostType, string> = {
        feed: '📷',
        reel: '🎬',
        story: '⏱️',
        carousel: '🎠',
        pin: '📌',
        video: '🎥',
        article: '📝',
        thread: '🧵',
    };
    return icons[postType];
}
