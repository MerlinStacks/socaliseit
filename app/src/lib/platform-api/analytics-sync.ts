/**
 * @deprecated Use `@/lib/services/platform-analytics-sync` instead.
 *
 * This file used raw (encrypted) tokens from the database without
 * decrypting or refreshing them, causing auth failures for YouTube
 * and other platforms. All callers have been migrated to the token-safe
 * `platform-analytics-sync` service.
 *
 * Re-exports are provided below for backwards compatibility with any
 * external callers that may not have been updated yet.
 */

import {
    syncPlatformAnalytics,
    syncSingleAccountAnalytics,
    syncPostAnalytics,
} from '@/lib/services/platform-analytics-sync';

/**
 * @deprecated Use `syncPlatformAnalytics` from `@/lib/services/platform-analytics-sync`
 */
export async function syncWorkspaceAnalytics(organizationId: string) {
    const result = await syncPlatformAnalytics(organizationId);
    // Why: Legacy callers expect an array of { success, platform, error } objects.
    // Convert the new result shape back to the old shape for compatibility.
    const successes = Array.from({ length: result.accountsSynced }, () => ({
        success: true as const,
    }));
    const errors = result.errors.map((e) => ({
        success: false as const,
        platform: e.platform,
        error: e.error,
    }));
    return [...successes, ...errors];
}

/**
 * @deprecated Use `syncSingleAccountAnalytics` from `@/lib/services/platform-analytics-sync`
 */
export async function syncAccountAnalytics(accountId: string) {
    return syncSingleAccountAnalytics(accountId);
}

/**
 * @deprecated Use `syncPostAnalytics` from `@/lib/services/platform-analytics-sync`
 */
export async function syncRecentPostsAnalytics(organizationId: string) {
    return syncPostAnalytics(organizationId);
}
