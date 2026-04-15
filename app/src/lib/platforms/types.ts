/**
 * Platform Integration Types
 * Shared types for platform accounts, publishing payloads, and responses.
 * 
 * Why: Centralizes type definitions to enable type-safe consumption
 * across OAuth, publishing, and credential modules without circular deps.
 */

// Re-export Platform type from platform-config for single source of truth
export type { Platform } from '../platform-config';

/**
 * Represents a connected social media account with OAuth credentials.
 */
export interface PlatformAccount {
    id: string;
    platform: import('../platform-config').Platform;
    accountId: string;
    accountName: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: Date;
    profileImage?: string;
    isConnected: boolean;
    lastSyncAt?: Date;
    /** Platform-specific metadata (e.g., default board for Pinterest) */
    metadata?: Record<string, unknown>;
}

/**
 * Payload for publishing content to a social platform.
 */
export interface PublishPayload {
    caption: string;
    mediaUrls: string[];
    /** Why (BUG-02): Added 'text' for text-only posts (Bluesky, LinkedIn, Threads) */
    mediaType: 'text' | 'image' | 'video' | 'carousel';
    /** Post type determines which platform endpoint to use (story, reel, feed, etc.) */
    postType: 'feed' | 'story' | 'reel' | 'carousel' | 'pin' | 'video' | 'article' | 'thread';
    /** Call to action label (e.g., LEARN_MORE, BUY_NOW) */
    callToAction?: string;
    scheduledAt?: Date;
    firstComment?: string;
    location?: string;
    tags?: string[];
    productTags?: ProductTagPayload[];
    /** Link for Pinterest pins */
    link?: string;
    /** Pinterest board ID */
    boardId?: string;
    /** Pinterest pin title (max 100 chars) */
    pinTitle?: string;
    /** Custom thumbnail/cover image URL for video posts (Reels, etc.) */
    thumbnailUrl?: string;
    // YouTube-specific fields
    /** YouTube video title (required, max 100 chars) */
    videoTitle?: string;
    /** YouTube category ID (e.g., "22" = People & Blogs) */
    youtubeCategory?: string;
    /** YouTube playlist ID to add video to after upload */
    youtubePlaylist?: string;
    /** YouTube video tags for discovery */
    videoTags?: string[];
    /** Allow video embedding on external sites */
    embeddable?: boolean;
    /** YouTube: Enable/disable comments on video */
    youtubeCommentsEnabled?: boolean;
    /** Notify subscribers when video is published */
    notifySubscribers?: boolean;
    /** COPPA compliance flag - indicates content is made for children */
    madeForKids?: boolean;
    /** YouTube privacy status: public, private, unlisted */
    youtubePrivacy?: 'public' | 'private' | 'unlisted';
    // TikTok-specific fields
    /** TikTok: Privacy level selected by user (required by TikTok guidelines) */
    tiktokPrivacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
    /** TikTok: Promotional content (own business) */
    tiktokBrandOrganic?: boolean;
    /** TikTok: Paid partnership */
    tiktokBrandContent?: boolean;
    /** TikTok: AI generated content */
    tiktokIsAigc?: boolean;
    /** TikTok: Allow comments */
    tiktokComments?: boolean;
    /** TikTok: Allow duets */
    tiktokDuets?: boolean;
    /** TikTok: Allow stitches */
    tiktokStitches?: boolean;
    /** TikTok: Pending publish_id from a previous timed-out attempt.
     * Why: When set, the publisher polls this ID instead of re-uploading,
     * preventing duplicate posts on TikTok. */
    tiktokPendingPublishId?: string;
    // Instagram-specific fields
    /** Instagram: Pending container ID from a previous timed-out attempt.
     * Why: When set, the publisher polls this container instead of creating
     * a new one, preventing duplicate posts. */
    instagramPendingContainerId?: string;
    /** Instagram: Reuse feed for reels */
    instagramShareToFeed?: boolean;
    /** Instagram: Enable comments */
    instagramComments?: boolean;
    /** Instagram: Trial Reel — shown to non-followers first */
    isTrialReel?: boolean;
    /** Alt text for accessibility (Pinterest, Instagram, Facebook) */
    altText?: string;
    /** Per-image alt text for carousels, index-aligned with mediaUrls */
    altTexts?: string[];
    /** LinkedIn: Post visibility (default: PUBLIC) */
    linkedinVisibility?: 'PUBLIC' | 'CONNECTIONS';
    /** Threads: Topic tag for post discoverability (1-50 chars) */
    threadsTopicTag?: string;
    /** Threads: ID of the post being quoted */
    threadsQuotePostId?: string;
    /** Threads: Pending container ID from a previous timed-out attempt.
     * Why: When set, the publisher polls this container instead of creating
     * a new one, preventing duplicate posts. */
    threadsPendingContainerId?: string;
    /** Bluesky: Pending video job ID from a previous timed-out attempt.
     * Why: When set, the publisher polls this job instead of re-uploading,
     * preventing duplicate posts. */
    blueskyPendingJobId?: string;
}

/**
 * Product tag for shoppable posts.
 * Used to tag products on Instagram, Facebook, Pinterest, etc.
 */
export interface ProductTagPayload {
    platformProductId: string;  // Product ID in platform's catalog
    productName: string;        // For display/validation
    mediaIndex: number;         // Which media item (0 for single, 0-n for carousel)
    positionX?: number;         // 0-1 from left (for visual positioning)
    positionY?: number;         // 0-1 from top (for visual positioning)
}

/**
 * Standard response from platform publishing operations.
 */
export interface PublishResponse {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
    errorCode?: string;
}
