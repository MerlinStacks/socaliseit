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

// Master Platform Registry (comprehensive specs, limits, features)
export {
    PLATFORM_SPECS,
    getPlatformSpec,
    getCharacterLimit,
    getMediaConstraints,
    getSupportedPostTypes,
} from '../platform-config';
export type {
    Platform as PlatformId,
    PostType,
    PlatformSpec,
    CharacterLimits,
    MediaConstraints,
    VariationConfig,
} from '../platform-config';

// Config (OAuth endpoints)
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

// Rate Limits
export { PLATFORM_RATE_LIMITS, getRateLimit } from './rate-limits';
export type { RateLimitConfig } from './rate-limits';

// UI Configuration (colors, gradients, icons)
export {
    PLATFORM_GRADIENTS,
    PLATFORM_COLORS,
    PLATFORM_PROFILE_URLS,
    getPlatformBgColor,
    getPlatformBorderColor,
    getProfileUrl,
} from './ui';
