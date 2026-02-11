/**
 * Sync Platform Configuration
 * Defines which platforms are supported for each sync job type.
 *
 * Why: Centralises the supported-platform lists so workers, services,
 * and utilities all reference a single source of truth. Platforms
 * like BLUESKY and THREADS exist in the Platform enum but don't yet
 * have API integrations for content fetching, so they must be skipped.
 */

import type { Platform } from '@/generated/prisma/client';

/** Platforms that support external-post fetching */
export const POSTS_SYNC_PLATFORMS: ReadonlySet<Platform> = new Set<Platform>([
    'INSTAGRAM',
    'FACEBOOK',
    'TIKTOK',
    'YOUTUBE',
    'PINTEREST',
]);

/** Platforms that support engagement (comments/mentions) fetching */
export const ENGAGEMENT_SYNC_PLATFORMS: ReadonlySet<Platform> = new Set<Platform>([
    'INSTAGRAM',
    'FACEBOOK',
    'TIKTOK',
    'YOUTUBE',
]);

/** Platforms that support DM sync */
export const DM_SYNC_PLATFORMS: ReadonlySet<Platform> = new Set<Platform>([
    'INSTAGRAM',
    'FACEBOOK',
]);

/**
 * Error messages that indicate a permanently invalid access token.
 * Why: When these patterns are detected the account should be
 * deactivated rather than retried every sync cycle.
 */
export const PERMANENT_TOKEN_ERROR_PATTERNS = [
    'access_token_invalid',
    'Invalid OAuth access token',
    'Error validating access token',
    'The access token is invalid',
    'token has expired',
] as const;

/** Check whether a platform supports post sync */
export function isPlatformPostSyncSupported(platform: Platform): boolean {
    return POSTS_SYNC_PLATFORMS.has(platform);
}

/** Check whether a platform supports engagement sync */
export function isPlatformEngagementSyncSupported(platform: Platform): boolean {
    return ENGAGEMENT_SYNC_PLATFORMS.has(platform);
}

/** Check whether a platform supports DM sync */
export function isPlatformDmSyncSupported(platform: Platform): boolean {
    return DM_SYNC_PLATFORMS.has(platform);
}

/**
 * Determine if an error message indicates a permanently invalid token.
 * Why: We want to stop retrying accounts whose tokens will never succeed.
 */
export function isPermanentTokenError(errorMessage: string): boolean {
    const lower = errorMessage.toLowerCase();
    return PERMANENT_TOKEN_ERROR_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}
