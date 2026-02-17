/**
 * Sync Manager
 * Coordinates synchronization between IndexedDB and server.
 *
 * Why: Handles conflict resolution and background sync when connection is restored.
 */

import {
    getSyncQueue,
    removeFromSyncQueue,
    getRetryablePosts,
    removePendingPost,
    markPostRetry,
    getDirtyDrafts,
    markDraftSynced,
    cleanupStalePosts,
    type PendingPost,
    type CachedDraft,
} from './offline-queue';
import { logger } from './logger';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

export interface SyncResult {
    status: SyncStatus;
    syncedPosts: number;
    syncedDrafts: number;
    failedItems: number;
    skippedBackoff: number;
    cleanedStale: number;
    errors: string[];
}

type SyncEventCallback = (result: SyncResult) => void;

const syncListeners: Set<SyncEventCallback> = new Set();

/**
 * Subscribe to sync events.
 */
export function onSyncComplete(callback: SyncEventCallback): () => void {
    syncListeners.add(callback);
    return () => syncListeners.delete(callback);
}

/**
 * Emit sync result to all listeners.
 */
function emitSyncResult(result: SyncResult): void {
    syncListeners.forEach((callback) => callback(result));
}

/**
 * Submit a pending post to the server.
 */
async function submitPost(post: PendingPost): Promise<boolean> {
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
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return true;
}

/**
 * Sync a cached draft to the server.
 */
async function syncDraft(draft: CachedDraft): Promise<boolean> {
    const response = await fetch(`/api/posts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            caption: draft.caption,
            mediaIds: draft.mediaIds,
            platformAccountIds: draft.platformAccountIds,
            scheduledAt: draft.scheduledAt,
        }),
    });

    // 404 means draft doesn't exist on server yet - create it
    if (response.status === 404) {
        const createResponse = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                caption: draft.caption,
                mediaIds: draft.mediaIds,
                platformAccountIds: draft.platformAccountIds,
                scheduledAt: draft.scheduledAt,
                status: 'DRAFT',
            }),
        });

        if (!createResponse.ok) {
            throw new Error('Failed to create draft on server');
        }
    } else if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return true;
}

/**
 * Sync all pending items to server.
 * Why: Uses getRetryablePosts to respect exponential backoff timing.
 * Called on reconnect or manually.
 */
export async function syncAll(organizationId: string): Promise<SyncResult> {
    const result: SyncResult = {
        status: 'syncing',
        syncedPosts: 0,
        syncedDrafts: 0,
        failedItems: 0,
        skippedBackoff: 0,
        cleanedStale: 0,
        errors: [],
    };

    try {
        // 0. Clean up stale posts first (older than 72h)
        result.cleanedStale = await cleanupStalePosts();
        if (result.cleanedStale > 0) {
            logger.info({ count: result.cleanedStale }, 'Cleaned up stale offline posts');
        }

        // 1. Sync retryable posts (respects backoff + excludes permanent failures)
        const retryablePosts = await getRetryablePosts(organizationId);
        for (const post of retryablePosts) {
            try {
                await submitPost(post);
                await removePendingPost(post.id);
                result.syncedPosts++;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                result.errors.push(`Post "${post.id}": ${message}`);
                result.failedItems++;
                await markPostRetry(post.id, message);
            }
        }

        // 2. Sync dirty drafts
        const dirtyDrafts = await getDirtyDrafts();
        const workspaceDrafts = dirtyDrafts.filter((d) => d.organizationId === organizationId);

        for (const draft of workspaceDrafts) {
            try {
                await syncDraft(draft);
                await markDraftSynced(draft.id);
                result.syncedDrafts++;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                result.errors.push(`Draft "${draft.id}": ${message}`);
                result.failedItems++;
            }
        }

        // 3. Process sync queue
        const queue = await getSyncQueue();
        for (const item of queue) {
            try {
                const response = await fetch(`/api/${item.resourceType}s/${item.resourceId}`, {
                    method: item.type === 'delete' ? 'DELETE' : item.type === 'create' ? 'POST' : 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: item.type !== 'delete' ? JSON.stringify(item.payload) : undefined,
                });

                if (response.ok || response.status === 404) {
                    await removeFromSyncQueue(item.id);
                }
            } catch {
                result.failedItems++;
            }
        }

        result.status = result.failedItems > 0 ? 'error' : 'success';
    } catch (error) {
        result.status = 'error';
        result.errors.push(error instanceof Error ? error.message : 'Sync failed');
    }

    emitSyncResult(result);
    return result;
}

/**
 * Check if there are items pending sync.
 */
export async function hasPendingSync(organizationId: string): Promise<boolean> {
    const [posts, drafts, queue] = await Promise.all([
        getRetryablePosts(organizationId),
        getDirtyDrafts(),
        getSyncQueue(),
    ]);

    return posts.length > 0 || drafts.length > 0 || queue.length > 0;
}

/**
 * Register for background sync if supported.
 */
export async function registerBackgroundSync(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        if ('sync' in registration) {
            await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
                .sync.register('overseek-sync');
            return true;
        }
    } catch {
        // Background sync not supported
    }

    return false;
}
