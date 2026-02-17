/**
 * Shared API URL constants for platform integrations
 *
 * Why: These were redeclared in facebook-api, posts-sync, oauth-profile,
 * and instagram/constants. Single source of truth prevents version drift.
 */

export const GRAPH_API_URL = 'https://graph.facebook.com/v24.0';
export const TIKTOK_API_URL = 'https://open.tiktokapis.com/v2';
export const YOUTUBE_DATA_API_URL = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_ANALYTICS_API_URL = 'https://youtubeanalytics.googleapis.com/v2';
export const PINTEREST_API_URL = 'https://api.pinterest.com/v5';
export const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';
