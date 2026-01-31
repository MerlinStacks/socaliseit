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

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    currentRequests: number;
    windowStart: Date;
}

export const PLATFORM_RATE_LIMITS: Record<Platform, { requests: number; windowMs: number }> = {
    INSTAGRAM: { requests: 200, windowMs: 3600000 },      // 200/hour
    FACEBOOK: { requests: 200, windowMs: 3600000 },       // 200/hour
    META: { requests: 200, windowMs: 3600000 },           // Shared with Facebook
    TIKTOK: { requests: 100, windowMs: 60000 },           // 100/min
    YOUTUBE: { requests: 10000, windowMs: 86400000 },     // 10k/day (units)
    PINTEREST: { requests: 1000, windowMs: 3600000 },     // 1000/hour
    LINKEDIN: { requests: 100, windowMs: 60000 },         // 100/min
    BLUESKY: { requests: 300, windowMs: 300000 },         // 300/5min
    GOOGLE_BUSINESS: { requests: 100, windowMs: 60000 },  // ~100/min
};

// ============================================================================
// Sync Configuration
// ============================================================================

export interface SyncConfig {
    accountId: string;
    platform: Platform;
    accessToken: string;
    lastSyncAt?: Date;
    syncTypes: ('analytics' | 'comments' | 'mentions')[];
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
        'instagram_manage_comments',
        'instagram_manage_insights',
        'instagram_content_publish',
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
        'r_liteprofile',
        'w_member_social',
        'r_organization_social',
    ],
    BLUESKY: [], // AT Protocol uses app passwords
    GOOGLE_BUSINESS: [
        'https://www.googleapis.com/auth/business.manage',
    ],
};
