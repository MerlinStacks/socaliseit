/**
 * Platform Integration Service
 * Handles OAuth connections and API calls to social platforms
 */

import { logger } from './logger';

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'pinterest' | 'linkedin' | 'bluesky' | 'google_business';

export interface PlatformAccount {
    id: string;
    platform: Platform;
    accountId: string;
    accountName: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: Date;
    profileImage?: string;
    isConnected: boolean;
    lastSyncAt?: Date;
}

export interface PublishPayload {
    caption: string;
    mediaUrls: string[];
    mediaType: 'image' | 'video' | 'carousel';
    scheduledAt?: Date;
    firstComment?: string;
    location?: string;
    tags?: string[];
    productTags?: ProductTagPayload[];
}

/**
 * Product tag for shoppable posts
 * Used to tag products on Instagram, Facebook, Pinterest, etc.
 */
export interface ProductTagPayload {
    platformProductId: string;  // Product ID in platform's catalog
    productName: string;        // For display/validation
    mediaIndex: number;         // Which media item (0 for single, 0-n for carousel)
    positionX?: number;         // 0-1 from left (for visual positioning)
    positionY?: number;         // 0-1 from top (for visual positioning)
}

export interface PublishResponse {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
    errorCode?: string;
}

/**
 * Platform API configurations
 */
const PLATFORM_CONFIGS: Record<Platform, {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    apiBase: string;
}> = {
    instagram: {
        authUrl: 'https://api.instagram.com/oauth/authorize',
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        scopes: ['user_profile', 'user_media'],
        apiBase: 'https://graph.instagram.com',
    },
    tiktok: {
        authUrl: 'https://www.tiktok.com/auth/authorize/',
        tokenUrl: 'https://open-api.tiktok.com/oauth/access_token/',
        scopes: ['user.info.basic', 'video.upload'],
        apiBase: 'https://open-api.tiktok.com',
    },
    youtube: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/youtube.upload'],
        apiBase: 'https://www.googleapis.com/youtube/v3',
    },
    facebook: {
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: ['pages_manage_posts', 'pages_read_engagement'],
        apiBase: 'https://graph.facebook.com/v18.0',
    },
    pinterest: {
        authUrl: 'https://api.pinterest.com/oauth/',
        tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
        scopes: ['boards:read', 'pins:write'],
        apiBase: 'https://api.pinterest.com/v5',
    },
    linkedin: {
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: ['openid', 'profile', 'w_member_social'],
        apiBase: 'https://api.linkedin.com/v2',
    },
    bluesky: {
        authUrl: 'https://bsky.social/xrpc/com.atproto.server.createSession',
        tokenUrl: '', // Bluesky uses session-based auth, not OAuth
        scopes: [],
        apiBase: 'https://bsky.social/xrpc',
    },
    google_business: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/business.manage'],
        apiBase: 'https://mybusinessbusinessinformation.googleapis.com/v1',
    },
};

/**
 * Generate OAuth authorization URL
 * Now requires credentials to be passed in (loaded via getCredentialsForPlatform)
 */
export function getAuthorizationUrl(
    platform: Platform,
    redirectUri: string,
    state: string,
    credentials?: { clientId: string; clientSecret: string }
): string {
    const config = PLATFORM_CONFIGS[platform];

    // Use provided credentials or fall back to env vars for backwards compatibility
    const clientId = credentials?.clientId || process.env[`${platform.toUpperCase()}_CLIENT_ID`] || '';

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: config.scopes.join(' '),
        state,
    });

    return `${config.authUrl}?${params.toString()}`;
}

/**
 * Fetch platform credentials from database for a workspace
 * Returns decrypted credentials or null if not configured
 * Note: Instagram and Facebook both use META credentials (same Meta App)
 */
export async function getCredentialsForPlatform(
    workspaceId: string,
    platform: Platform
): Promise<{ clientId: string; clientSecret: string } | null> {
    // Dynamic import to avoid circular dependencies and keep this file usable on client
    const { db } = await import('@/lib/db');
    const { decrypt } = await import('@/lib/crypto');

    // Map lowercase platform to Prisma enum
    // Instagram and Facebook both use META credentials (same Meta App)
    let platformEnum: 'META' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'LINKEDIN' | 'BLUESKY' | 'GOOGLE_BUSINESS';

    if (platform === 'instagram' || platform === 'facebook') {
        platformEnum = 'META';
    } else {
        platformEnum = platform.toUpperCase() as typeof platformEnum;
    }

    const credential = await db.platformCredential.findUnique({
        where: {
            workspaceId_platform: {
                workspaceId,
                platform: platformEnum,
            },
        },
    });

    if (!credential || !credential.isConfigured) {
        return null;
    }

    try {
        const clientSecret = decrypt(credential.clientSecret);
        return {
            clientId: credential.clientId,
            clientSecret,
        };
    } catch (error) {
        logger.error({ platform, err: error }, 'Failed to decrypt credentials');
        return null;
    }
}


/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
    platform: Platform,
    code: string,
    redirectUri: string
): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
}> {
    const config = PLATFORM_CONFIGS[platform];

    // In production, make actual API call
    // Mock response for demo
    return {
        accessToken: `${platform}_access_${Date.now()}`,
        refreshToken: `${platform}_refresh_${Date.now()}`,
        expiresIn: 3600 * 24 * 60, // 60 days
    };
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(
    platform: Platform,
    refreshToken: string
): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
}> {
    // In production, make actual API call
    return {
        accessToken: `${platform}_access_${Date.now()}`,
        refreshToken: `${platform}_refresh_${Date.now()}`,
        expiresIn: 3600 * 24 * 60,
    };
}

/**
 * Publish content to a platform
 */
export async function publishToPlatform(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // Check if token is expired
    if (new Date() > account.tokenExpiresAt) {
        return {
            success: false,
            error: 'Access token expired',
            errorCode: 'TOKEN_EXPIRED',
        };
    }

    // Platform-specific publishing logic
    switch (account.platform) {
        case 'instagram':
            return publishToInstagram(account, payload);
        case 'tiktok':
            return publishToTikTok(account, payload);
        case 'youtube':
            return publishToYouTube(account, payload);
        case 'facebook':
            return publishToFacebook(account, payload);
        case 'pinterest':
            return publishToPinterest(account, payload);
        case 'linkedin':
            return publishToLinkedIn(account, payload);
        case 'bluesky':
            return publishToBluesky(account, payload);
        case 'google_business':
            return publishToGoogleBusiness(account, payload);
        default:
            return { success: false, error: 'Unsupported platform' };
    }
}

// Platform-specific publish functions (mock implementations)

async function publishToInstagram(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // In production:
    // 1. Upload media to Instagram container
    // 2. Create media object
    // 3. Publish media

    // TODO: Implement Instagram Graph API publishing
    logger.debug({ platform: 'instagram', caption: payload.caption.slice(0, 50) }, 'Publishing to Instagram');

    return {
        success: true,
        postId: `ig_${Date.now()}`,
        postUrl: `https://instagram.com/p/${Date.now().toString(36)}`,
    };
}

async function publishToTikTok(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement TikTok API publishing
    logger.debug({ platform: 'tiktok', caption: payload.caption.slice(0, 50) }, 'Publishing to TikTok');

    return {
        success: true,
        postId: `tt_${Date.now()}`,
        postUrl: `https://tiktok.com/@${account.accountName}/video/${Date.now()}`,
    };
}

async function publishToYouTube(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement YouTube Data API publishing
    logger.debug({ platform: 'youtube', caption: payload.caption.slice(0, 50) }, 'Publishing to YouTube');

    return {
        success: true,
        postId: `yt_${Date.now()}`,
        postUrl: `https://youtube.com/watch?v=${Date.now().toString(36)}`,
    };
}

async function publishToFacebook(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement Facebook Graph API publishing
    logger.debug({ platform: 'facebook', caption: payload.caption.slice(0, 50) }, 'Publishing to Facebook');

    return {
        success: true,
        postId: `fb_${Date.now()}`,
        postUrl: `https://facebook.com/${account.accountId}/posts/${Date.now()}`,
    };
}

async function publishToPinterest(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement Pinterest API publishing
    logger.debug({ platform: 'pinterest', caption: payload.caption.slice(0, 50) }, 'Publishing to Pinterest');

    return {
        success: true,
        postId: `pin_${Date.now()}`,
        postUrl: `https://pinterest.com/pin/${Date.now()}`,
    };
}

async function publishToLinkedIn(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement LinkedIn API publishing
    logger.debug({ platform: 'linkedin', caption: payload.caption.slice(0, 50) }, 'Publishing to LinkedIn');

    return {
        success: true,
        postId: `li_${Date.now()}`,
        postUrl: `https://linkedin.com/feed/update/urn:li:share:${Date.now()}`,
    };
}

async function publishToBluesky(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement Bluesky AT Protocol publishing
    logger.debug({ platform: 'bluesky', caption: payload.caption.slice(0, 50) }, 'Publishing to Bluesky');

    return {
        success: true,
        postId: `bsky_${Date.now()}`,
        postUrl: `https://bsky.app/profile/${account.accountName}/post/${Date.now().toString(36)}`,
    };
}

async function publishToGoogleBusiness(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // TODO: Implement Google Business Profile API publishing
    logger.debug({ platform: 'google_business', caption: payload.caption.slice(0, 50) }, 'Publishing to Google Business');

    return {
        success: true,
        postId: `gbp_${Date.now()}`,
        postUrl: `https://business.google.com/posts/${Date.now()}`,
    };
}

/**
 * Check if account token needs refresh
 */
export function isTokenExpiringSoon(account: PlatformAccount, daysThreshold: number = 7): boolean {
    const now = new Date();
    const threshold = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
    return account.tokenExpiresAt < threshold;
}

/**
 * Get platform display info
 */
export function getPlatformInfo(platform: Platform): {
    name: string;
    color: string;
    icon: string;
} {
    const info: Record<Platform, { name: string; color: string; icon: string }> = {
        instagram: { name: 'Instagram', color: '#E4405F', icon: '📸' },
        tiktok: { name: 'TikTok', color: '#000000', icon: '🎵' },
        youtube: { name: 'YouTube', color: '#FF0000', icon: '▶️' },
        facebook: { name: 'Facebook', color: '#1877F2', icon: '📘' },
        pinterest: { name: 'Pinterest', color: '#BD081C', icon: '📌' },
        linkedin: { name: 'LinkedIn', color: '#0A66C2', icon: '💼' },
        bluesky: { name: 'Bluesky', color: '#0085FF', icon: '🦋' },
        google_business: { name: 'Google Business', color: '#4285F4', icon: '🏢' },
    };

    return info[platform];
}
