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
    /**
     * Why: Lets the publish-ready page open the target app directly
     * instead of redirecting to the calendar when manual-posting.
     */
    deepLink?: {
        /** Native app URI scheme (e.g. `tiktok://`, `instagram://`) */
        appUri?: string;
        /** Web fallback when the native app isn't installed */
        webUrl: string;
    };
}
