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
    | 'threads'
    | 'google_business'
    | 'manual';

/**
 * Canonical display order for platforms in UI (sidebar, tabs, etc.)
 * Why: Ensures consistent platform ordering across the application
 */
export const PLATFORM_ORDER: Platform[] = [
    'google_business',
    'facebook',
    'instagram',
    'threads',
    'youtube',
    'tiktok',
    'pinterest',
    'bluesky',
    'linkedin', // LinkedIn at end as it's less commonly used
    'manual',   // Manual/Remind-to-Post at very end
];

/**
 * Sort platforms by the canonical display order
 * Why: Provides consistent ordering when iterating over platform selections
 */
export function sortPlatformsByOrder(platforms: Platform[]): Platform[] {
    return [...platforms].sort((a, b) => {
        const indexA = PLATFORM_ORDER.indexOf(a);
        const indexB = PLATFORM_ORDER.indexOf(b);
        // If platform not found in order, place at end
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
}

/**
 * Get the sort index for a platform
 * Why: Centralized helper for consistent platform ordering in sort comparisons
 * @returns Sort index (0-based), or 999 if platform not in PLATFORM_ORDER
 */
export function getPlatformSortIndex(platform: Platform): number {
    const index = PLATFORM_ORDER.indexOf(platform);
    return index === -1 ? 999 : index;
}

export type PostType =
    | 'feed'
    | 'reel'
    | 'story'
    | 'carousel'
    | 'pin'
    | 'video'
    | 'article'
    | 'thread';

/**
 * Platform publishing rate limits (daily/hourly)
 * Why: Prevents users from hitting platform API rate limits
 * These are conservative estimates - actual limits vary by account type
 */
export const PLATFORM_RATE_LIMITS: Record<Platform, { daily: number; hourly?: number }> = {
    instagram: { daily: 25, hourly: 10 },
    facebook: { daily: 50 },
    tiktok: { daily: 30 },
    youtube: { daily: 50 },  // Generous for API
    pinterest: { daily: 150, hourly: 50 },
    linkedin: { daily: 100 },
    bluesky: { daily: 300 },
    threads: { daily: 250 },
    google_business: { daily: 10 },
    manual: { daily: 999 }, // No API rate limits for reminder-only
};


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
        /** Target width for auto-resize. Based on 2026 platform recommendations. */
        recommendedWidth: number;
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

/**
 * Variation-specific settings for cross-platform content adaptation
 * Why: Consolidated from lib/variations.ts to have single source of truth
 */
export interface VariationConfig {
    hashtagPosition: 'inline' | 'end' | 'first-comment';
    linkBehavior: 'embed' | 'bio' | 'shortened';
    tone: string;
    emojiDensity: 'low' | 'medium' | 'high';
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
    /** Variation settings for cross-platform content adaptation */
    variation: VariationConfig;
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
                    recommendedWidth: 1080,
                    aspectRatios: ['1:1', '4:5', '3:4', '1.91:1'],
                    maxSize: 8 * 1024 * 1024, // 8MB
                    formats: ['jpg', 'jpeg', 'png'],
                },
            },
            carousel: {
                maxFiles: 10,
                image: {
                    minWidth: 320,
                    maxWidth: 1440,
                    recommendedWidth: 1080,
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
                    maxDuration: 180, // 3 minutes (2026)
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
                    recommendedWidth: 1080,
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
        variation: {
            hashtagPosition: 'end',
            linkBehavior: 'bio',
            tone: 'casual, visual-focused',
            emojiDensity: 'high',
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
        supportedPostTypes: ['video'], // Only video supported; Photo Mode (carousel) requires special API access
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
                    recommendedWidth: 1080,
                    aspectRatios: ['9:16', '1:1', '4:5'],
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
        variation: {
            hashtagPosition: 'inline',
            linkBehavior: 'bio',
            tone: 'trendy, authentic, fun',
            emojiDensity: 'medium',
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
        variation: {
            hashtagPosition: 'end',
            linkBehavior: 'embed',
            tone: 'informative, engaging',
            emojiDensity: 'medium',
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
                    recommendedWidth: 1080,
                    aspectRatios: ['1:1', '4:5', '16:9', '1.91:1'],
                    maxSize: 8 * 1024 * 1024, // 8MB
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
                    recommendedWidth: 1080,
                    aspectRatios: ['1:1'],
                    maxSize: 8 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png'],
                },
            },
            reel: {
                maxFiles: 1,
                video: {
                    minDuration: 3,
                    maxDuration: 60,
                    maxSize: 1024 * 1024 * 1024,
                    formats: ['mp4', 'mov'],
                },
            },
            story: {
                maxFiles: 1,
                image: {
                    minWidth: 500,
                    maxWidth: 1080,
                    recommendedWidth: 1080,
                    aspectRatios: ['9:16'],
                    maxSize: 30 * 1024 * 1024, // 30MB (2026)
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
        variation: {
            hashtagPosition: 'end',
            linkBehavior: 'embed',
            tone: 'conversational, community',
            emojiDensity: 'low',
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
        supportedPostTypes: ['pin', 'carousel', 'video'],
        hashtagLimit: 20,
        mediaConstraints: {
            pin: {
                maxFiles: 1,
                image: {
                    minWidth: 600,
                    maxWidth: 2000,
                    recommendedWidth: 1000,
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
                    recommendedWidth: 1000,
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
        variation: {
            hashtagPosition: 'end',
            linkBehavior: 'embed',
            tone: 'inspiring, descriptive',
            emojiDensity: 'low',
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
                    recommendedWidth: 1200,
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
                    recommendedWidth: 1080,
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
                    recommendedWidth: 1200,
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
        variation: {
            hashtagPosition: 'end',
            linkBehavior: 'embed',
            tone: 'professional, insightful',
            emojiDensity: 'low',
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
                    recommendedWidth: 1000,
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
                    recommendedWidth: 1000,
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
        variation: {
            hashtagPosition: 'inline',
            linkBehavior: 'embed',
            tone: 'casual, conversational',
            emojiDensity: 'low',
        },
    },

    threads: {
        id: 'threads',
        name: 'Threads',
        color: '#000000',
        icon: 'threads',
        characterLimits: {
            caption: { max: 500, recommended: 280 },
        },
        supportedPostTypes: ['feed', 'carousel'],
        hashtagLimit: 0, // Threads doesn't emphasize hashtags
        mediaConstraints: {
            feed: {
                maxFiles: 1,
                image: {
                    minWidth: 320,
                    maxWidth: 1440,
                    recommendedWidth: 1440,
                    aspectRatios: ['any', '3:4'],
                    maxSize: 8 * 1024 * 1024, // 8MB
                    formats: ['jpg', 'jpeg', 'png', 'webp'],
                },
                video: {
                    minDuration: 0,
                    maxDuration: 300, // 5 minutes
                    maxSize: 1024 * 1024 * 1024, // 1GB
                    formats: ['mp4', 'mov'],
                },
            },
            carousel: {
                maxFiles: 10,
                image: {
                    minWidth: 320,
                    maxWidth: 1440,
                    recommendedWidth: 1440,
                    aspectRatios: ['any', '3:4'],
                    maxSize: 8 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png', 'webp'],
                },
                video: {
                    minDuration: 0,
                    maxDuration: 300,
                    maxSize: 1024 * 1024 * 1024,
                    formats: ['mp4', 'mov'],
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
        variation: {
            hashtagPosition: 'inline',
            linkBehavior: 'embed',
            tone: 'casual, conversational, text-first',
            emojiDensity: 'medium',
        },
    },

    google_business: {
        id: 'google_business',
        name: 'Google My Business',
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
                    recommendedWidth: 1200,
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
        variation: {
            hashtagPosition: 'end',
            linkBehavior: 'embed',
            tone: 'professional, local-focused',
            emojiDensity: 'low',
        },
    },

    manual: {
        id: 'manual',
        name: 'Remind to Post',
        color: '#8B5CF6',
        icon: 'bell',
        characterLimits: {
            caption: { max: 10000 },
        },
        supportedPostTypes: ['feed', 'carousel', 'reel', 'story', 'video'],
        hashtagLimit: 100,
        mediaConstraints: {
            feed: {
                maxFiles: 10,
                image: {
                    minWidth: 100,
                    maxWidth: 10000,
                    recommendedWidth: 1080,
                    aspectRatios: ['any'],
                    maxSize: 100 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                },
                video: {
                    minDuration: 1,
                    maxDuration: 3600,
                    maxSize: 4 * 1024 * 1024 * 1024,
                    formats: ['mp4', 'mov', 'webm'],
                },
            },
            carousel: {
                maxFiles: 20,
                image: {
                    minWidth: 100,
                    maxWidth: 10000,
                    recommendedWidth: 1080,
                    aspectRatios: ['any'],
                    maxSize: 100 * 1024 * 1024,
                    formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
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
        variation: {
            hashtagPosition: 'end',
            linkBehavior: 'embed',
            tone: 'flexible',
            emojiDensity: 'medium',
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
 * Format post type for display with platform-specific labels
 * Why: Each platform has its own terminology for content types
 */
export function formatPostType(postType: PostType, platform?: Platform): string {
    // Platform-specific labels
    if (platform) {
        const platformLabels: Partial<Record<Platform, Partial<Record<PostType, string>>>> = {
            instagram: {
                feed: 'Feed Post',
                reel: 'Reel',
                story: 'Story',
                carousel: 'Carousel',
            },
            facebook: {
                feed: 'Post',
                reel: 'Reel',
                story: 'Story',
                carousel: 'Carousel',
            },
            youtube: {
                video: 'Video',
                reel: 'Short', // YouTube Shorts
            },
            tiktok: {
                video: 'Video', // TikTok just calls them videos
                carousel: 'Photo Mode', // TikTok Photo Mode
            },
            pinterest: {
                pin: 'Pin',
                carousel: 'Carousel Pin',
                video: 'Video Pin',
            },
            linkedin: {
                feed: 'Post',
                carousel: 'Document',
                video: 'Video',
                article: 'Article',
            },
            bluesky: {
                feed: 'Post',
                thread: 'Thread',
            },
            threads: {
                feed: 'Post',
                carousel: 'Carousel',
            },
            google_business: {
                feed: 'Post',
            },
            manual: {
                feed: 'Post',
                carousel: 'Carousel',
                reel: 'Reel',
                story: 'Story',
                video: 'Video',
            },
        };

        const platformLabel = platformLabels[platform]?.[postType];
        if (platformLabel) {
            return platformLabel;
        }
    }

    // Fallback generic labels
    const labels: Record<PostType, string> = {
        feed: 'Post',
        reel: 'Reel',
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
 * Get icon NAME for post type (Lucide icon component names)
 * Why: Returns component name for consistent SVG rendering in UI
 */
export function getPostTypeIcon(postType: PostType): string {
    const icons: Record<PostType, string> = {
        feed: 'Image',
        reel: 'Film',
        story: 'Clock',
        carousel: 'Images',
        pin: 'Pin',
        video: 'Video',
        article: 'FileText',
        thread: 'MessageSquare',
    };
    return icons[postType];
}

/**
 * Get text label for post type (for captions and non-icon contexts)
 */
export function getPostTypeLabel(postType: PostType): string {
    const labels: Record<PostType, string> = {
        feed: 'Post',
        reel: 'Reel/Short',
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
 * Check if a platform supports carousel/multi-image posts
 * Why: Used to determine if platform should be available when multiple media selected
 */
export function platformSupportsCarousel(platform: Platform): boolean {
    const spec = PLATFORM_SPECS[platform];
    // Check if platform has 'carousel' in supported post types
    // OR if it supports multiple files in feed posts (like Bluesky with 4 images)
    if (spec.supportedPostTypes.includes('carousel')) {
        return true;
    }
    // Special case: Bluesky supports up to 4 images on feed posts
    if (platform === 'bluesky') {
        const feedConstraints = spec.mediaConstraints.feed;
        return feedConstraints?.maxFiles ? feedConstraints.maxFiles > 1 : false;
    }
    return false;
}

/**
 * Get maximum number of items allowed in a carousel for a platform
 * Why: Each platform has different carousel limits
 */
export function getCarouselMaxItems(platform: Platform): number {
    const spec = PLATFORM_SPECS[platform];

    // Check carousel-specific constraints first
    const carouselConstraints = spec.mediaConstraints.carousel;
    if (carouselConstraints?.maxFiles) {
        return carouselConstraints.maxFiles;
    }

    // Fallback to feed constraints for platforms like Bluesky
    const feedConstraints = spec.mediaConstraints.feed;
    if (feedConstraints?.maxFiles) {
        return feedConstraints.maxFiles;
    }

    // Default to 10 if not specified
    return 10;
}

/**
 * Check if a platform supports multiple media items (carousel or multi-image feed)
 * Why: Some platforms like TikTok/YouTube are video-only and don't support image carousels
 */
export function platformSupportsMultipleMedia(platform: Platform): boolean {
    // TikTok API only supports single video uploads (Photo Mode requires special access)
    if (platform === 'tiktok') return false;

    // YouTube only supports single video uploads
    if (platform === 'youtube') return false;

    // Google Business only supports single media
    if (platform === 'google_business') return false;

    return platformSupportsCarousel(platform);
}
