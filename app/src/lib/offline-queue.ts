/**
 * Offline Queue - IndexedDB Store
 * Manages offline post queue and draft caching using IndexedDB.
 *
 * Why: Enable offline-first experience by queuing posts locally when network is unavailable.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'socialiseit-offline';
const DB_VERSION = 1;

// Store names
const STORES = {
    PENDING_POSTS: 'pending-posts',
    DRAFT_CACHE: 'draft-cache',
    SYNC_QUEUE: 'sync-queue',
} as const;

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
        indexes: { 'by-workspace': string };
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
 */
async function getDB(): Promise<OfflineDB> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<{
        'pending-posts': {
            key: string;
            value: PendingPost;
            indexes: { 'by-workspace': string };
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
        upgrade(db) {
            // Pending posts store
            if (!db.objectStoreNames.contains(STORES.PENDING_POSTS)) {
                const pendingStore = db.createObjectStore(STORES.PENDING_POSTS, { keyPath: 'id' });
                pendingStore.createIndex('by-workspace', 'organizationId');
            }

            // Draft cache store
            if (!db.objectStoreNames.contains(STORES.DRAFT_CACHE)) {
                const draftStore = db.createObjectStore(STORES.DRAFT_CACHE, { keyPath: 'id' });
                draftStore.createIndex('by-workspace', 'organizationId');
                draftStore.createIndex('by-dirty', 'isDirty');
            }

            // Sync queue store
            if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
                syncStore.createIndex('by-type', 'type');
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
export async function queuePost(post: Omit<PendingPost, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
    const db = await getDB();
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await db.add(STORES.PENDING_POSTS, {
        ...post,
        id,
        createdAt: new Date().toISOString(),
        retryCount: 0,
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
 * Get total count of pending posts.
 */
export async function getPendingCount(): Promise<number> {
    const db = await getDB();
    return db.count(STORES.PENDING_POSTS);
}

/**
 * Remove a pending post after successful submission.
 */
export async function removePendingPost(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORES.PENDING_POSTS, id);
}

/**
 * Update retry count and error for a failed post.
 */
export async function markPostRetry(id: string, error: string): Promise<void> {
    const db = await getDB();
    const post = await db.get(STORES.PENDING_POSTS, id);
    if (post) {
        post.retryCount += 1;
        post.lastError = error;
        await db.put(STORES.PENDING_POSTS, post);
    }
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
