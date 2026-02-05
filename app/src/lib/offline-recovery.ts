/**
 * Offline Sync Recovery
 * Handles token-aware recovery of offline-queued posts.
 *
 * Why: Posts queued offline may have stale tokens when coming back online.
 * This module validates and refreshes tokens before attempting sync.
 */

'use client';

import { getPendingPosts, removePendingPost, markPostRetry, getSyncQueue, removeFromSyncQueue, type PendingPost, type SyncQueueItem } from './offline-queue';

/**
 * Check if a token has expired based on stored expiry.
 */
export function isTokenExpired(tokenExpiresAt?: string): boolean {
    if (!tokenExpiresAt) return false; // Assume valid if not tracked
    return new Date(tokenExpiresAt).getTime() < Date.now();
}

/**
 * Process pending posts when coming back online.
 * Validates token expiry and attempts submission.
 *
 * @param organizationId - Organization context
 * @param submitPost - Function to submit a post to the server
 * @param refreshTokens - Function to refresh tokens for accounts
 * @returns Recovery result
 */
export async function recoverPendingPosts(
    organizationId: string,
    submitPost: (post: PendingPost) => Promise<{ success: boolean; error?: string }>,
    refreshTokens?: (accountIds: string[]) => Promise<boolean>
): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    requiresReauth: string[];
}> {
    const result = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        requiresReauth: [] as string[],
    };

    const pendingPosts = await getPendingPosts(organizationId);

    for (const post of pendingPosts) {
        result.processed++;

        // Check token expiry
        if (isTokenExpired(post.tokenExpiresAt)) {
            // Attempt token refresh
            if (refreshTokens) {
                const refreshed = await refreshTokens(post.platformAccountIds);
                if (!refreshed) {
                    result.requiresReauth.push(...post.platformAccountIds);
                    await markPostRetry(post.id, 'Token expired - requires re-authentication');
                    result.failed++;
                    continue;
                }
            } else {
                result.requiresReauth.push(...post.platformAccountIds);
                await markPostRetry(post.id, 'Token expired - refresh not available');
                result.failed++;
                continue;
            }
        }

        // Check retry limit (max 3 retries)
        if (post.retryCount >= 3) {
            result.failed++;
            continue; // Leave in queue for manual intervention
        }

        // Attempt submission
        try {
            const submitResult = await submitPost(post);

            if (submitResult.success) {
                await removePendingPost(post.id);
                result.succeeded++;
            } else {
                await markPostRetry(post.id, submitResult.error || 'Submission failed');
                result.failed++;
            }
        } catch (error) {
            await markPostRetry(post.id, error instanceof Error ? error.message : 'Unknown error');
            result.failed++;
        }
    }

    return result;
}

/**
 * Process sync queue when coming back online.
 */
export async function processSyncQueue(
    processItem: (item: SyncQueueItem) => Promise<boolean>
): Promise<{ processed: number; succeeded: number; failed: number }> {
    const result = { processed: 0, succeeded: 0, failed: 0 };
    const queue = await getSyncQueue();

    for (const item of queue) {
        result.processed++;

        // Check token expiry
        if (isTokenExpired(item.tokenExpiresAt)) {
            result.failed++;
            continue;
        }

        try {
            const success = await processItem(item);
            if (success) {
                await removeFromSyncQueue(item.id);
                result.succeeded++;
            } else {
                result.failed++;
            }
        } catch {
            result.failed++;
        }
    }

    return result;
}

/**
 * React hook for offline recovery on network reconnection.
 */
export function useOfflineRecovery(options: {
    organizationId?: string;
    isOnline: boolean;
    onRecoveryComplete?: (result: { succeeded: number; failed: number }) => void;
}) {
    // Recovery is triggered by useEffect in the component
    // This is a placeholder for the hook structure
    return {
        triggerRecovery: async () => {
            if (!options.organizationId) return;
            // Implementation would call recoverPendingPosts here
        },
    };
}
