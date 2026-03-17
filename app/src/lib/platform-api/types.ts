/**
 * Platform API Types
 * Shared types for all platform API integrations
 */

import type { Platform } from '@/generated/prisma/client';

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    errorCode?: string;
    rateLimitRemaining?: number;
    rateLimitReset?: Date;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface AccountMetrics {
    followers: number;
    followersChange: number;
    following: number;
    impressions: number;
    reach: number;
    engagementRate: number;
    profileViews: number;
    websiteClicks: number;
    emailClicks: number;
    platformMetrics?: Record<string, unknown>;
}

export interface PostMetrics {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    videoViews?: number;
    videoWatchTime?: number;
    avgWatchPercentage?: number;
    engagementRate: number;
    platformMetrics?: Record<string, unknown>;
}

export interface AudienceDemographics {
    ageGender?: {
        age: string;
        gender: 'male' | 'female' | 'other';
        percentage: number;
    }[];
    topCountries?: {
        country: string;
        percentage: number;
    }[];
    topCities?: {
        city: string;
        percentage: number;
    }[];
}

// ============================================================================
// Comment Types
// ============================================================================

export interface PlatformComment {
    platformCommentId: string;
    platformPostId: string;
    authorId: string;
    authorUsername: string;
    authorAvatar?: string;
    text: string;
    likeCount: number;
    replyCount: number;
    parentId?: string;
    createdAt: Date;
    isHidden?: boolean;
}

export interface CommentReplyPayload {
    commentId: string;
    text: string;
}

// ============================================================================
// Mention Types
// ============================================================================

export interface PlatformMention {
    platformPostId: string;
    type: 'mention' | 'tag' | 'story_mention' | 'story_reply';
    authorId: string;
    authorUsername: string;
    authorAvatar?: string;
    text?: string;
    mediaUrl?: string;
    createdAt: Date;
}

// ============================================================================
// Hashtag Search Types (UGC Discovery)
// ============================================================================

export interface HashtagMedia {
    id: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
    mediaUrl?: string;
    thumbnailUrl?: string;
    permalink: string;
    caption?: string;
    timestamp: Date;
    likeCount: number;
    commentsCount: number;
    ownerUsername: string;
    ownerId: string;
}

export interface HashtagSearchResult {
    hashtagId: string;
    hashtagName: string;
    mediaCount?: number;
    topMedia: HashtagMedia[];
    recentMedia: HashtagMedia[];
}

// ============================================================================
// Publishing Types
// ============================================================================

export type InstagramPostType = 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL';

export interface StoryMediaPayload {
    type: 'image' | 'video';
    url: string;
    // Story-specific options
    linkUrl?: string;
    linkText?: string;
    pollQuestion?: string;
    pollOptions?: string[];
    mentionUserIds?: string[];
}

export interface TrialReelPayload {
    videoUrl: string;
    caption: string;
    coverImageUrl?: string;
    shareToFeed?: boolean;
    // Trial reel shows to a subset of followers first
    isTrialReel: true;
}

/**
 * Payload for Instagram Feed Posts (single image, video, or carousel)
 */
export interface FeedPostPayload {
    type: 'IMAGE' | 'VIDEO' | 'CAROUSEL';
    caption: string;
    /** Media URLs (1 for single, 2-10 for carousel) */
    mediaUrls: string[];
    /** Cover image URL for videos */
    coverImageUrl?: string;
    /** Location tag ID (from Facebook Pages API) */
    locationId?: string;
    /** User tags - array of {username, x, y} for image positions */
    userTags?: Array<{ username: string; x: number; y: number }>;
    /** Product tags for shoppable posts */
    productTags?: Array<{ productId: string; x: number; y: number }>;
    /** Whether to share to Facebook */
    shareToFacebook?: boolean;
    /** Whether to share Reel to Feed */
    instagramShareToFeed?: boolean;
    /** Whether comments are enabled */
    instagramComments?: boolean;
    /** First comment to post after publishing */
    firstComment?: string;
    /** Whether this is intended as a Reel (defaults to true for videos) */
    isReel?: boolean;
    /** Whether this is a Carousel */
    isCarousel?: boolean;
    /** Whether this is a Story */
    isStory?: boolean;
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    currentRequests: number;
    windowStart: Date;
}

// Re-export from consolidated rate-limits module
export { PLATFORM_RATE_LIMITS, getRateLimit } from '@/lib/platforms/rate-limits';

// ============================================================================
// Sync Configuration
// ============================================================================

export interface SyncConfig {
    accountId: string;
    platform: Platform;
    accessToken: string;
    lastSyncAt?: Date;
    syncTypes: ('analytics' | 'comments' | 'mentions' | 'posts')[];
}

export interface SyncResult {
    accountId: string;
    platform: Platform;
    syncType: string;
    success: boolean;
    itemsSynced: number;
    error?: string;
    nextSyncAt?: Date;
}

// ============================================================================
// OAuth Scopes Required
// ============================================================================

export const REQUIRED_SCOPES: Record<Platform, string[]> = {
    INSTAGRAM: [
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_comments',
        'instagram_manage_messages',
        'instagram_manage_contents',
    ],
    FACEBOOK: [
        'pages_read_engagement',
        'pages_manage_engagement',
        'pages_read_analytics',
        'pages_manage_posts',
    ],
    META: [
        // Meta Business Suite API scopes (shared with Facebook/Instagram)
        'business_management',
        'pages_manage_posts',
        'instagram_content_publish',
    ],
    TIKTOK: [
        'user.info.stats',
        'video.list',
        'comment.list',
        'comment.manage',
    ],
    YOUTUBE: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
    PINTEREST: [
        'boards:read',
        'pins:read',
        'user_accounts:read',
    ],
    LINKEDIN: [
        'openid',
        'profile',
        'email',
        'w_member_social',
        'r_organization_social',
    ],
    BLUESKY: [], // AT Protocol uses app passwords
    GOOGLE_BUSINESS: [
        'https://www.googleapis.com/auth/business.manage',
    ],
    THREADS: [
        'threads_basic',
        'threads_content_publish',
        'threads_manage_insights',
        'threads_manage_replies',
        'threads_read_replies',
    ],
    MANUAL: [], // No OAuth — reminder-only platform
};
