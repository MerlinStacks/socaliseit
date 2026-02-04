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
    mediaType: 'image' | 'video' | 'carousel';
    /** Post type determines which platform endpoint to use (story, reel, feed, etc.) */
    postType: 'feed' | 'story' | 'reel' | 'carousel' | 'pin' | 'video' | 'article' | 'thread';
    scheduledAt?: Date;
    firstComment?: string;
    location?: string;
    tags?: string[];
    productTags?: ProductTagPayload[];
    /** Link for Pinterest pins */
    link?: string;
    /** Pinterest board ID */
    boardId?: string;
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
