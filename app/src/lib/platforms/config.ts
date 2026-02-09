/**
 * Platform API Configurations
 * OAuth endpoints, scopes, and API base URLs for each platform.
 * 
 * Why: Isolates platform-specific configuration from logic,
 * making it easy to update API versions or endpoints.
 */

import type { Platform } from '../platform-config';

/**
 * Configuration for a social platform's OAuth and API integration.
 */
export interface PlatformConfig {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    apiBase: string;
}

/**
 * Platform API configurations - OAuth URLs, scopes, and API bases.
 */
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
    instagram: {
        // Instagram API with Facebook Login for Business (Graph API v24.0)
        // Uses instagram_* scopes (NOT instagram_business_* which are for Instagram Login)
        // Requires Instagram Business/Creator account linked to a Facebook Page
        authUrl: 'https://www.facebook.com/v24.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v24.0/oauth/access_token',
        scopes: [
            'instagram_basic',
            'instagram_content_publish',
            'instagram_manage_comments',
            'instagram_manage_insights',
            'instagram_manage_messages',
            'instagram_shopping_tag_products',
            'catalog_management', // Product catalog CRUD for shopping features
            'pages_show_list',
            'pages_read_engagement',
            'business_management',
        ],
        apiBase: 'https://graph.facebook.com/v24.0',
    },
    tiktok: {
        // TikTok API v2 (2024+)
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: [
            'user.info.profile',
            'user.info.stats',
            'video.publish',
            'video.upload',
            'video.list',
        ],
        apiBase: 'https://open.tiktokapis.com/v2',
    },
    youtube: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube',
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/yt-analytics.readonly', // YouTube Analytics Reporting API
        ],
        apiBase: 'https://www.googleapis.com/youtube/v3',
    },
    facebook: {
        // Facebook Graph API v24.0 (Feb 2026)
        // Video publishing requires Page Access Token (from /me/accounts), not a separate scope
        authUrl: 'https://www.facebook.com/v24.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v24.0/oauth/access_token',
        scopes: [
            'public_profile',
            'pages_manage_posts', // Create/edit/delete posts (including videos)
            'pages_read_engagement', // Read page engagement metrics
            'pages_manage_engagement', // Reply to comments, manage messages
            'pages_messaging', // Requires Meta Developer Dashboard registration + Dev Mode
            'pages_show_list', // List user's Pages and get Page Access Token
            'business_management', // Manage business assets
            'read_insights', // Page and post analytics
            'catalog_management', // Product catalog CRUD for shopping features
        ],
        apiBase: 'https://graph.facebook.com/v24.0',
    },
    pinterest: {
        // Pinterest API v5
        authUrl: 'https://www.pinterest.com/oauth/',
        tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
        scopes: ['user_accounts:read', 'boards:read', 'boards:write', 'pins:read', 'pins:write', 'catalogs:read'],
        apiBase: 'https://api.pinterest.com/v5',
    },
    linkedin: {
        // LinkedIn API with OpenID Connect (2024+)
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: ['openid', 'profile', 'email', 'w_member_social'],
        apiBase: 'https://api.linkedin.com/v2',
    },
    bluesky: {
        // Bluesky uses AT Protocol session auth, not OAuth
        authUrl: 'https://bsky.social/xrpc/com.atproto.server.createSession',
        tokenUrl: '',
        scopes: [],
        apiBase: 'https://bsky.social/xrpc',
    },
    google_business: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/business.manage'],
        apiBase: 'https://mybusinessbusinessinformation.googleapis.com/v1',
    },
    threads: {
        // Threads uses the same Meta OAuth dialog with threads_* scopes
        // Threads uses www.threads.net (bare threads.net redirects and strips query params)
        authUrl: 'https://www.threads.net/oauth/authorize',
        tokenUrl: 'https://graph.threads.net/oauth/access_token',
        scopes: [
            'threads_basic',
            'threads_content_publish',
            'threads_manage_insights',
            'threads_manage_replies',
            'threads_read_replies',
        ],
        apiBase: 'https://graph.threads.net/v1.0',
    },
};
