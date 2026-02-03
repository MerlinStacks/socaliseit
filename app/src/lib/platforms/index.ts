/**
 * Platform Integration Module
 * Barrel file re-exporting all platform functionality.
 * 
 * Why: Single import point maintains backwards compatibility
 * while enabling modular internal structure.
 */

// Types
export type {
    Platform,
    PlatformAccount,
    PublishPayload,
    ProductTagPayload,
    PublishResponse,
} from './types';

// Config
export { PLATFORM_CONFIGS } from './config';
export type { PlatformConfig } from './config';

// OAuth
export {
    getAuthorizationUrl,
    exchangeCodeForToken,
    refreshAccessToken,
} from './oauth';
export type { TokenResponse } from './oauth';

// Credentials
export { getCredentialsForPlatform } from './credentials';

// Publishing
export { publishToPlatform } from './publish';

// Utilities
export { isTokenExpiringSoon, getPlatformInfo } from './utils';
export type { PlatformInfo } from './utils';
