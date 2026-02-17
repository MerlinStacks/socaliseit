/**
 * Offline Queue - IndexedDB Store
 * Manages offline post queue and draft caching using IndexedDB.
 *
 * Why: Enable offline-first experience by queuing posts locally when network is unavailable.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'socialiseit-offline';
const DB_VERSION = 2;

/** Why: 5 retries with exponential backoff covers ~30 min of transient failures */
const MAX_RETRIES = 5;

/** Why: 72 hours covers a long weekend offline scenario */
const STALE_POST_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/** Why: Cap backoff at 30 min to avoid posts sitting forever */
const MAX_BACKOFF_MS = 30 * 60 * 1000;

/** Why: Base delay of 30s gives quick first retry, then ramps */
const BASE_BACKOFF_MS = 30 * 1000;

// Store names
const STORES = {
    PENDING_POSTS: 'pending-posts',
    DRAFT_CACHE: 'draft-cache',
    SYNC_QUEUE: 'sync-queue',
} as const;

export type PendingPostStatus = 'pending' | 'retrying' | 'failed_permanent';

export interface PendingPost {
    id: string;
    organizationId: string;
    caption: string;
    mediaIds: string[];
    platformAccountIds: string[];
    scheduledAt?: string;
    createdAt: string;
    retryCount: number;
    lastError?: string;
    /** Token expiry timestamp when post was queued (for recovery validation) */
    tokenExpiresAt?: string;
    /** ISO timestamp — earliest point this post is eligible for retry */
    nextRetryAt?: string;
    /** Current state in the offline retry pipeline */
    status: PendingPostStatus;
}

export interface CachedDraft {
    id: string;
    organizationId: string;
    caption: string;
    mediaIds: string[];
    platformAccountIds: string[];
    scheduledAt?: string;
    lastSavedAt: string;
    lastSyncedAt?: string;
    isDirty: boolean;
}

export interface SyncQueueItem {
    id: string;
    type: 'create' | 'update' | 'delete';
    resourceType: 'post' | 'draft';
    resourceId: string;
    payload: unknown;
    createdAt: string;
    retryCount: number;
    /** Token expiry timestamp when queued (for recovery validation) */
    tokenExpiresAt?: string;
}

type OfflineDB = IDBPDatabase<{
    'pending-posts': {
        key: string;
        value: PendingPost;
        indexes: { 'by-workspace': string; 'by-status': string };
    };
    'draft-cache': {
        key: string;
        value: CachedDraft;
        indexes: { 'by-workspace': string; 'by-dirty': number };
    };
    'sync-queue': {
        key: string;
        value: SyncQueueItem;
        indexes: { 'by-type': string };
    };
}>;

let dbInstance: OfflineDB | null = null;

/**
 * Open or get existing database connection.
 * Why: DB_VERSION 2 adds `by-status` index and migrates existing records.
 */
async function getDB(): Promise<OfflineDB> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<{
        'pending-posts': {
            key: string;
            value: PendingPost;
            indexes: { 'by-workspace': string; 'by-status': string };
        };
        'draft-cache': {
            key: string;
            value: CachedDraft;
            indexes: { 'by-workspace': string; 'by-dirty': number };
        };
        'sync-queue': {
            key: string;
            value: SyncQueueItem;
            indexes: { 'by-type': string };
        };
    }>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            // V1 → V2: Add status index and migrate pending posts
            if (oldVersion < 1) {
                const pendingStore = db.createObjectStore(STORES.PENDING_POSTS, { keyPath: 'id' });
                pendingStore.createIndex('by-workspace', 'organizationId');
                pendingStore.createIndex('by-status', 'status');

                const draftStore = db.createObjectStore(STORES.DRAFT_CACHE, { keyPath: 'id' });
                draftStore.createIndex('by-workspace', 'organizationId');
                draftStore.createIndex('by-dirty', 'isDirty');

                const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
                syncStore.createIndex('by-type', 'type');
            }

            if (oldVersion < 2) {
                // Why: Existing stores need the new `by-status` index
                if (db.objectStoreNames.contains(STORES.PENDING_POSTS)) {
                    const tx = (db as unknown as { transaction: IDBTransaction }).transaction;
                    if (tx) {
                        const store = tx.objectStore(STORES.PENDING_POSTS);
                        if (!store.indexNames.contains('by-status')) {
                            store.createIndex('by-status', 'status');
                        }
                    }
                }
            }
        },
    });

    return dbInstance;
}

// ============================================================================
// PENDING POSTS (Offline Queue)
// ============================================================================

/**
 * Queue a post for later submission when offline.
 */
export async function queuePost(post: Omit<PendingPost, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<string> {
    const db = await getDB();
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await db.add(STORES.PENDING_POSTS, {
        ...post,
        id,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
    });

    return id;
}

/**
 * Get all pending posts for a organization.
 */
export async function getPendingPosts(organizationId: string): Promise<PendingPost[]> {
    const db = await getDB();
    return db.getAllFromIndex(STORES.PENDING_POSTS, 'by-workspace', organizationId);
}

/**
 * Get posts that are eligible for retry right now.
 * Why: Filters out permanently failed posts and posts whose backoff hasn't elapsed.
 */
export async function getRetryablePosts(organizationId: string): Promise<PendingPost[]> {
    const allPosts = await getPendingPosts(organizationId);
    const now = Date.now();

    return allPosts.filter((post) => {
        if (post.status === 'failed_permanent') return false;
        if (post.nextRetryAt && new Date(post.nextRetryAt).getTime() > now) return false;
        return true;
    });
}

/**
 * Get total count of pending posts (excludes permanently failed).
 */
export async function getPendingCount(): Promise<number> {
    const db = await getDB();
    const all = await db.getAll(STORES.PENDING_POSTS);
    return all.filter((p) => p.status !== 'failed_permanent').length;
}

/**
 * Get count of permanently failed posts.
 */
export async function getFailedPermanentCount(): Promise<number> {
    const db = await getDB();
    const all = await db.getAll(STORES.PENDING_POSTS);
    return all.filter((p) => p.status === 'failed_permanent').length;
}

/**
 * Remove a pending post after successful submission.
 */
export async function removePendingPost(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORES.PENDING_POSTS, id);
}

/**
 * Compute exponential backoff delay.
 * Why: min(2^retryCount * 30s, 30 min) prevents API spam while retrying quickly at first.
 */
function computeBackoffMs(retryCount: number): number {
    return Math.min(Math.pow(2, retryCount) * BASE_BACKOFF_MS, MAX_BACKOFF_MS);
}

/**
 * Update retry count, error, and backoff for a failed post.
 * Marks as permanently failed after MAX_RETRIES.
 */
export async function markPostRetry(id: string, error: string): Promise<void> {
    const db = await getDB();
    const post = await db.get(STORES.PENDING_POSTS, id);
    if (!post) return;

    post.retryCount += 1;
    post.lastError = error;

    if (post.retryCount >= MAX_RETRIES) {
        post.status = 'failed_permanent';
    } else {
        post.status = 'retrying';
        const backoffMs = computeBackoffMs(post.retryCount);
        post.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    }

    await db.put(STORES.PENDING_POSTS, post);
}

/**
 * Mark a post as permanently failed (user can still manually retry).
 */
export async function markPostPermanentlyFailed(id: string): Promise<void> {
    const db = await getDB();
    const post = await db.get(STORES.PENDING_POSTS, id);
    if (!post) return;

    post.status = 'failed_permanent';
    await db.put(STORES.PENDING_POSTS, post);
}

/**
 * Reset a permanently failed post back to pending for manual retry.
 */
export async function resetPostForRetry(id: string): Promise<void> {
    const db = await getDB();
    const post = await db.get(STORES.PENDING_POSTS, id);
    if (!post) return;

    post.status = 'pending';
    post.retryCount = 0;
    post.nextRetryAt = undefined;
    post.lastError = undefined;
    await db.put(STORES.PENDING_POSTS, post);
}

/**
 * Remove posts older than maxAgeMs from IndexedDB.
 * Why: Prevents stale offline posts from accumulating indefinitely.
 * @returns Number of posts cleaned up
 */
export async function cleanupStalePosts(maxAgeMs: number = STALE_POST_MAX_AGE_MS): Promise<number> {
    const db = await getDB();
    const allPosts = await db.getAll(STORES.PENDING_POSTS);
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const post of allPosts) {
        if (new Date(post.createdAt).getTime() < cutoff) {
            await db.delete(STORES.PENDING_POSTS, post.id);
            cleaned++;
        }
    }

    return cleaned;
}

// ============================================================================
// DRAFT CACHE
// ============================================================================

/**
 * Save a draft to local cache.
 */
export async function saveDraft(draft: Omit<CachedDraft, 'lastSavedAt' | 'isDirty'>): Promise<void> {
    const db = await getDB();
    await db.put(STORES.DRAFT_CACHE, {
        ...draft,
        lastSavedAt: new Date().toISOString(),
        isDirty: true,
    });
}

/**
 * Get a cached draft by ID.
 */
export async function getDraft(id: string): Promise<CachedDraft | undefined> {
    const db = await getDB();
    return db.get(STORES.DRAFT_CACHE, id);
}

/**
 * Get all drafts for a organization.
 */
export async function getDrafts(organizationId: string): Promise<CachedDraft[]> {
    const db = await getDB();
    return db.getAllFromIndex(STORES.DRAFT_CACHE, 'by-workspace', organizationId);
}

/**
 * Get all dirty (unsynced) drafts.
 */
export async function getDirtyDrafts(): Promise<CachedDraft[]> {
    const db = await getDB();
    return db.getAllFromIndex(STORES.DRAFT_CACHE, 'by-dirty', 1);
}

/**
 * Mark a draft as synced.
 */
export async function markDraftSynced(id: string): Promise<void> {
    const db = await getDB();
    const draft = await db.get(STORES.DRAFT_CACHE, id);
    if (draft) {
        draft.isDirty = false;
        draft.lastSyncedAt = new Date().toISOString();
        await db.put(STORES.DRAFT_CACHE, draft);
    }
}

/**
 * Delete a draft from cache.
 */
export async function deleteDraft(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORES.DRAFT_CACHE, id);
}

// ============================================================================
// SYNC QUEUE
// ============================================================================

/**
 * Add item to sync queue.
 */
export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
    const db = await getDB();
    const id = `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await db.add(STORES.SYNC_QUEUE, {
        ...item,
        id,
        createdAt: new Date().toISOString(),
        retryCount: 0,
    });

    return id;
}

/**
 * Get all items in sync queue.
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
    const db = await getDB();
    return db.getAll(STORES.SYNC_QUEUE);
}

/**
 * Remove item from sync queue after success.
 */
export async function removeFromSyncQueue(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORES.SYNC_QUEUE, id);
}

/**
 * Clear entire sync queue.
 */
export async function clearSyncQueue(): Promise<void> {
    const db = await getDB();
    await db.clear(STORES.SYNC_QUEUE);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if browser supports IndexedDB.
 */
export function isIndexedDBSupported(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
}

/**
 * Get storage usage estimate.
 */
export async function getStorageEstimate(): Promise<{ used: number; quota: number } | null> {
    if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
            used: estimate.usage || 0,
            quota: estimate.quota || 0,
        };
    }
    return null;
}
