/**
 * Sync Manager
 * Coordinates synchronization between IndexedDB and server.
 *
 * Why: Handles conflict resolution and background sync when connection is restored.
 */

import {
    getSyncQueue,
    removeFromSyncQueue,
    getPendingPosts,
    removePendingPost,
    markPostRetry,
    getDirtyDrafts,
    markDraftSynced,
    type PendingPost,
    type CachedDraft,
} from './offline-queue';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

export interface SyncResult {
    status: SyncStatus;
    syncedPosts: number;
    syncedDrafts: number;
    failedItems: number;
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
    try {
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
    } catch (error) {
        throw error;
    }
}

/**
 * Sync a cached draft to the server.
 */
async function syncDraft(draft: CachedDraft): Promise<boolean> {
    try {
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
    } catch (error) {
        throw error;
    }
}

/**
 * Sync all pending items to server.
 * Called on reconnect or manually.
 */
export async function syncAll(workspaceId: string): Promise<SyncResult> {
    const result: SyncResult = {
        status: 'syncing',
        syncedPosts: 0,
        syncedDrafts: 0,
        failedItems: 0,
        errors: [],
    };

    try {
        // 1. Sync pending posts
        const pendingPosts = await getPendingPosts(workspaceId);
        for (const post of pendingPosts) {
            try {
                await submitPost(post);
                await removePendingPost(post.id);
                result.syncedPosts++;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                result.errors.push(`Post "${post.id}": ${message}`);
                result.failedItems++;

                if (post.retryCount < 3) {
                    await markPostRetry(post.id, message);
                }
            }
        }

        // 2. Sync dirty drafts
        const dirtyDrafts = await getDirtyDrafts();
        const workspaceDrafts = dirtyDrafts.filter((d) => d.workspaceId === workspaceId);

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
                // Execute the queued operation
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
export async function hasPendingSync(workspaceId: string): Promise<boolean> {
    const [posts, drafts, queue] = await Promise.all([
        getPendingPosts(workspaceId),
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
                .sync.register('socialiseit-sync');
            return true;
        }
    } catch {
        // Background sync not supported
    }

    return false;
}
