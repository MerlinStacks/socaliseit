/**
 * Offline Sync Recovery
 * Handles token-aware recovery of offline-queued posts.
 *
 * Why: Posts queued offline may have stale tokens when coming back online.
 * This module validates and refreshes tokens before attempting sync.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
    getRetryablePosts,
    removePendingPost,
    markPostRetry,
    getSyncQueue,
    removeFromSyncQueue,
    getPendingCount,
    getFailedPermanentCount,
    resetPostForRetry,
    cleanupStalePosts,
    type PendingPost,
    type SyncQueueItem,
} from './offline-queue';
import { toast } from '@/components/ui/toast';

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

    // Why: Clean up stale posts before processing to avoid wasted API calls
    await cleanupStalePosts();

    const pendingPosts = await getRetryablePosts(organizationId);

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

export interface OfflineRecoveryState {
    isRecovering: boolean;
    pendingCount: number;
    failedPermanentCount: number;
    lastRecoveryResult: { succeeded: number; failed: number } | null;
}

/**
 * React hook for offline recovery on network reconnection.
 * Why: Automatically syncs pending posts when the user comes back online,
 * with toast feedback and React Query invalidation support.
 */
export function useOfflineRecovery(options: {
    organizationId?: string;
    isOnline: boolean;
    onRecoveryComplete?: (result: { succeeded: number; failed: number }) => void;
}): OfflineRecoveryState & {
    triggerRecovery: () => Promise<void>;
    retryAllFailed: () => Promise<void>;
} {
    const { organizationId, isOnline, onRecoveryComplete } = options;
    const [isRecovering, setIsRecovering] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [failedPermanentCount, setFailedPermanentCount] = useState(0);
    const [lastRecoveryResult, setLastRecoveryResult] = useState<{
        succeeded: number;
        failed: number;
    } | null>(null);
    const wasOfflineRef = useRef(false);

    /** Why: Refresh counts from IndexedDB to keep UI in sync */
    const refreshCounts = useCallback(async () => {
        const [pending, failed] = await Promise.all([
            getPendingCount(),
            getFailedPermanentCount(),
        ]);
        setPendingCount(pending);
        setFailedPermanentCount(failed);
    }, []);

    /** Submit a single post to the server API */
    const submitPost = useCallback(async (post: PendingPost) => {
        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                caption: post.caption,
                mediaIds: post.mediaIds,
                platformAccountIds: post.platformAccountIds,
                scheduledAt: post.scheduledAt,
                status: post.scheduledAt ? 'SCHEDULED' : 'DRAFT',
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Unknown error' }));
            return { success: false, error: err.error || `HTTP ${response.status}` };
        }

        return { success: true };
    }, []);

    const triggerRecovery = useCallback(async () => {
        if (!organizationId || isRecovering) return;

        setIsRecovering(true);
        try {
            const result = await recoverPendingPosts(organizationId, submitPost);

            setLastRecoveryResult({
                succeeded: result.succeeded,
                failed: result.failed,
            });

            if (result.succeeded > 0) {
                toast(
                    'success',
                    'Posts synced',
                    `${result.succeeded} post${result.succeeded === 1 ? '' : 's'} published successfully`
                );
            }

            if (result.failed > 0) {
                toast(
                    'error',
                    'Some posts failed',
                    `${result.failed} post${result.failed === 1 ? '' : 's'} could not be published`
                );
            }

            if (result.requiresReauth.length > 0) {
                toast(
                    'error',
                    'Re-authentication needed',
                    'Some accounts need to be reconnected in Settings'
                );
            }

            onRecoveryComplete?.({ succeeded: result.succeeded, failed: result.failed });
        } finally {
            setIsRecovering(false);
            await refreshCounts();
        }
    }, [organizationId, isRecovering, submitPost, onRecoveryComplete, refreshCounts]);

    /** Why: Lets users manually retry all permanently failed posts from the UI */
    const retryAllFailed = useCallback(async () => {
        if (!organizationId) return;

        const posts = await getRetryablePosts(organizationId);
        // Also reset permanently failed ones
        const allPosts = (await import('./offline-queue')).getPendingPosts;
        const allOffline = await allPosts(organizationId);
        const permFailed = allOffline.filter((p) => p.status === 'failed_permanent');

        for (const post of permFailed) {
            await resetPostForRetry(post.id);
        }

        await refreshCounts();
        await triggerRecovery();
    }, [organizationId, refreshCounts, triggerRecovery]);

    // Auto-recover when coming back online
    useEffect(() => {
        if (!isOnline) {
            wasOfflineRef.current = true;
            return;
        }

        // Only trigger recovery if we were previously offline
        if (wasOfflineRef.current && organizationId) {
            wasOfflineRef.current = false;
            triggerRecovery();
        }
    }, [isOnline, organizationId, triggerRecovery]);

    // Periodically refresh counts
    useEffect(() => {
        refreshCounts();
        const interval = setInterval(refreshCounts, 10_000);
        return () => clearInterval(interval);
    }, [refreshCounts]);

    return {
        isRecovering,
        pendingCount,
        failedPermanentCount,
        lastRecoveryResult,
        triggerRecovery,
        retryAllFailed,
    };
}
