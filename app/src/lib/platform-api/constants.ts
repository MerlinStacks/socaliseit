/**
 * Shared API URL constants for platform integrations
 *
 * Why: These were redeclared in facebook-api, posts-sync, oauth-profile,
 * and instagram/constants. Single source of truth prevents version drift.
 */

/** Why (BUG-23): Single version token used by both graph.facebook.com
 *  and rupload.facebook.com so they can't drift out of sync. */
export const META_API_VERSION = 'v26.0';
export const GRAPH_API_URL = `https://graph.facebook.com/${META_API_VERSION}`;
/** Why (Phase 1.1): OAuth dialog and token exchange endpoints must use the same version
 *  as each other, but may need to stay pinned to an older version if a newer one breaks
 *  OAuth flows. Keep this separate from META_API_VERSION so data endpoints can advance
 *  independently. Update this only after testing the full OAuth login flow. */
export const META_OAUTH_VERSION = META_API_VERSION;
/** Why: Instagram resumable upload uses a different host but the same API version. */
export const RUPLOAD_BASE_URL = `https://rupload.facebook.com/ig-api-upload/${META_API_VERSION}`;
export const TIKTOK_API_URL = 'https://open.tiktokapis.com/v2';
export const YOUTUBE_DATA_API_URL = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_ANALYTICS_API_URL = 'https://youtubeanalytics.googleapis.com/v2';
export const PINTEREST_API_URL = 'https://api.pinterest.com/v5';
/** Why: Posts API uses `/rest/posts`, Images API uses `/rest/images`, etc. */
export const LINKEDIN_API_URL = 'https://api.linkedin.com';
