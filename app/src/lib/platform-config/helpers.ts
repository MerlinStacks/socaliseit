import { type Platform, type PostType, type CallToAction, type MediaConstraints, type PlatformSpec } from './types';
import { PLATFORM_SPECS } from './platforms';

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
