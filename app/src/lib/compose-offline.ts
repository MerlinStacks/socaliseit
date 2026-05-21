/**
 * Compose Offline Support - Draft caching, offline publish, and network status
 * Why: Extracted from compose/page.tsx to reduce file size and improve maintainability
 */

'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { saveDraft, getDrafts, deleteDraft, queuePost } from '@/lib/offline-queue';
import { registerBackgroundSync } from '@/lib/sync-manager';
import { toast } from '@/components/ui/toast';
import { logger } from '@/lib/logger';
import { type MediaItem } from '@/components/compose/platform-editor';

const DRAFT_DEBOUNCE_MS = 4000;
const DRAFT_MAX_INTERVAL_MS = 30000;
const DRAFT_RESTORE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DRAFT_LOCK_TTL_MS = 15000;
const DRAFT_LOCK_HEARTBEAT_MS = 5000;
const DRAFT_DEBUG = process.env.NODE_ENV !== 'production';

interface DraftSnapshot {
    caption: string;
    mediaIds: string[];
    platformAccountIds: string[];
    scheduledAt?: string;
}

interface SyncedDraftResponse {
    draft: {
        draftId: string;
        caption: string;
        mediaIds: string[];
        platformAccountIds: string[];
        scheduledAt?: string;
        contentHash: string;
        lastSavedAt: string;
        lastClientSavedAt?: string | null;
    } | null;
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function buildDraftSnapshot(options: {
    caption: string;
    media: MediaItem[];
    selectedAccountIds: string[];
    selectedDate: Date | null;
    scheduledDate: string;
}): DraftSnapshot {
    return {
        caption: options.caption,
        mediaIds: options.media.map((m) => m.id),
        platformAccountIds: [...options.selectedAccountIds].sort(),
        scheduledAt: options.selectedDate ? options.scheduledDate : undefined,
    };
}

function computeDraftHash(snapshot: DraftSnapshot): string {
    return stableStringify(snapshot);
}

function isSnapshotEmpty(snapshot: DraftSnapshot): boolean {
    return !snapshot.caption.trim() && snapshot.mediaIds.length === 0 && snapshot.platformAccountIds.length === 0;
}

function debugDraft(event: string, details?: Record<string, unknown>) {
    if (!DRAFT_DEBUG || typeof window === 'undefined') return;
    console.debug(`[draft-cache] ${event}`, details || {});
}

/**
 * useOnlineStatus - Monitor network connectivity
 * Why: Enables offline draft saving and publish queueing when network is unavailable
 */
export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        setIsOnline(navigator.onLine);

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}

/**
 * useDraftCache - Load and auto-save drafts to IndexedDB
 * Why: Preserves work-in-progress when browser closes or network fails
 */
export function useDraftCache(options: {
    organizationId?: string;
    editPostId: string | null;
    caption: string;
    media: MediaItem[];
    selectedAccountIds: string[];
    scheduledDate: string;
    selectedDate: Date | null;
    setCaption: (value: string) => void;
    setSelectedAccountIds: (value: string[]) => void;
}) {
    const {
        organizationId,
        editPostId,
        caption,
        media,
        selectedAccountIds,
        scheduledDate,
        selectedDate,
        setCaption,
        setSelectedAccountIds,
    } = options;

    const tabIdRef = useRef(`tab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const lockTokenRef = useRef(`lock-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const [isDraftLeader, setIsDraftLeader] = useState(true);
    const lastSavedHashRef = useRef<string | null>(null);
    const lastAutosaveAtRef = useRef(0);

    const snapshot = useMemo(() => buildDraftSnapshot({
        caption,
        media,
        selectedAccountIds,
        selectedDate,
        scheduledDate,
    }), [caption, media, selectedAccountIds, selectedDate, scheduledDate]);

    const snapshotHash = useMemo(() => computeDraftHash(snapshot), [snapshot]);

    const storageDraftKey = useMemo(() => {
        if (!organizationId) return null;
        return `draft-${organizationId}`;
    }, [organizationId]);

    const lockKey = useMemo(() => {
        if (!organizationId) return null;
        return `draft-lock-${organizationId}`;
    }, [organizationId]);

    const flushKey = useMemo(() => {
        if (!organizationId) return null;
        return `draft-flush-${organizationId}`;
    }, [organizationId]);

    const persistSnapshot = useCallback(async (force = false) => {
        if (!organizationId || !storageDraftKey) return;
        if (editPostId) return;
        if (!isDraftLeader) return;

        if (isSnapshotEmpty(snapshot)) return;

        const now = Date.now();
        const hasChanged = lastSavedHashRef.current !== snapshotHash;
        const isMaxIntervalElapsed = now - lastAutosaveAtRef.current >= DRAFT_MAX_INTERVAL_MS;
        if (!hasChanged && (!isMaxIntervalElapsed || force)) {
            if (force) {
                debugDraft('flush-skipped-unchanged', {
                    organizationId,
                    storageDraftKey,
                });
            }
            return;
        }

        try {
            await saveDraft({
                id: storageDraftKey,
                organizationId,
                caption: snapshot.caption,
                mediaIds: snapshot.mediaIds,
                platformAccountIds: snapshot.platformAccountIds,
                scheduledAt: snapshot.scheduledAt,
                contentHash: snapshotHash,
            });

            const idempotencyKey = `${storageDraftKey}:${snapshotHash}`;
            await fetch('/api/drafts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    draftId: storageDraftKey,
                    caption: snapshot.caption,
                    mediaIds: snapshot.mediaIds,
                    platformAccountIds: snapshot.platformAccountIds,
                    scheduledAt: snapshot.scheduledAt,
                    contentHash: snapshotHash,
                    idempotencyKey,
                    clientSavedAt: new Date().toISOString(),
                }),
                keepalive: true,
            }).catch(() => {
                // best effort cloud sync; local IndexedDB remains source of truth
            });

            lastSavedHashRef.current = snapshotHash;
            lastAutosaveAtRef.current = now;
        } catch (error) {
            logger.error({ err: error }, 'Failed to auto-save draft to IndexedDB');
        }
    }, [organizationId, storageDraftKey, editPostId, isDraftLeader, snapshot, snapshotHash]);

    // Load draft from cache on mount (if not editing an existing post)
    useEffect(() => {
        if (editPostId || !organizationId) return;

        async function loadCachedDraft() {
            try {
                const drafts = await getDrafts(organizationId!);
                // Get most recent draft
                const recentDraft = drafts.sort(
                    (a, b) => new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime()
                )[0];
                const localSavedAt = recentDraft ? new Date(recentDraft.lastSavedAt).getTime() : 0;
                let restoredLocally = false;

                if (recentDraft) {
                    // Only restore if it's less than 24 hours old
                    const draftAge = Date.now() - new Date(recentDraft.lastSavedAt).getTime();
                    if (draftAge < DRAFT_RESTORE_MAX_AGE_MS) {
                        setCaption(recentDraft.caption);
                        if (recentDraft.platformAccountIds) {
                            setSelectedAccountIds(recentDraft.platformAccountIds);
                        }
                        lastSavedHashRef.current = computeDraftHash({
                            caption: recentDraft.caption,
                            mediaIds: recentDraft.mediaIds || [],
                            platformAccountIds: [...(recentDraft.platformAccountIds || [])].sort(),
                            scheduledAt: recentDraft.scheduledAt,
                        });
                        lastAutosaveAtRef.current = Date.now();
                        restoredLocally = true;
                        toast('info', 'Draft restored', 'Your previous draft has been loaded.');
                    }
                }

                const syncedRes = await fetch(`/api/drafts?draftId=${encodeURIComponent(`draft-${organizationId}`)}`);
                if (syncedRes.ok) {
                    const syncedData = await syncedRes.json() as SyncedDraftResponse;
                    const syncedDraft = syncedData.draft;
                    if (syncedDraft) {
                        const syncedSavedAt = new Date(syncedDraft.lastSavedAt).getTime();
                        if (!restoredLocally || syncedSavedAt > localSavedAt) {
                            setCaption(syncedDraft.caption || '');
                            if (syncedDraft.platformAccountIds?.length) {
                                setSelectedAccountIds(syncedDraft.platformAccountIds);
                            }
                            lastSavedHashRef.current = syncedDraft.contentHash;
                            lastAutosaveAtRef.current = Date.now();
                            toast('info', 'Draft restored', 'Restored your latest draft from cloud sync.');
                        }
                    }
                }

                if (flushKey && typeof window !== 'undefined') {
                    const raw = window.localStorage.getItem(flushKey);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw) as {
                                savedAt?: number;
                                snapshot?: DraftSnapshot;
                            };
                            const savedAt = parsed.savedAt || 0;
                            if (parsed.snapshot && Date.now() - savedAt < DRAFT_RESTORE_MAX_AGE_MS) {
                                if (parsed.snapshot.caption) setCaption(parsed.snapshot.caption);
                                if (parsed.snapshot.platformAccountIds?.length) {
                                    setSelectedAccountIds(parsed.snapshot.platformAccountIds);
                                }
                            }
                        } catch {
                            // ignore malformed local fallback
                        }
                    }
                }
            } catch (error) {
                logger.error({ err: error }, 'Failed to load cached draft from IndexedDB');
            }
        }

        loadCachedDraft();
    }, [editPostId, organizationId, setCaption, setSelectedAccountIds]);

    // Single-writer lock so only one tab autosaves for this organization.
    useEffect(() => {
        if (!lockKey || typeof window === 'undefined') return;

        let isActive = true;
        const tryAcquire = () => {
            const now = Date.now();
            try {
                const raw = window.localStorage.getItem(lockKey);
                const current = raw
                    ? JSON.parse(raw) as { tabId?: string; expiresAt?: number; token?: string; epoch?: number }
                    : null;
                const isMine = current?.tabId === tabIdRef.current;
                const isExpired = !current?.expiresAt || current.expiresAt < now;

                if (isMine || isExpired) {
                    const nextEpoch = isMine ? (current?.epoch || 0) : ((current?.epoch || 0) + 1);
                    window.localStorage.setItem(lockKey, JSON.stringify({
                        tabId: tabIdRef.current,
                        token: lockTokenRef.current,
                        epoch: nextEpoch,
                        expiresAt: now + DRAFT_LOCK_TTL_MS,
                    }));
                    const verifiedRaw = window.localStorage.getItem(lockKey);
                    const verified = verifiedRaw
                        ? JSON.parse(verifiedRaw) as { tabId?: string; token?: string }
                        : null;
                    const didAcquire = verified?.tabId === tabIdRef.current
                        && verified?.token === lockTokenRef.current;
                    if (isActive) setIsDraftLeader(didAcquire);
                    if (!didAcquire) {
                        debugDraft('lock-lost-race', { organizationId, lockKey });
                    }
                } else if (isActive) {
                    setIsDraftLeader(false);
                }
            } catch {
                if (isActive) setIsDraftLeader(true);
            }
        };

        tryAcquire();
        const timer = window.setInterval(tryAcquire, DRAFT_LOCK_HEARTBEAT_MS);

        const onStorage = (event: StorageEvent) => {
            if (event.key !== lockKey) return;
            tryAcquire();
        };
        window.addEventListener('storage', onStorage);

        return () => {
            isActive = false;
            window.clearInterval(timer);
            window.removeEventListener('storage', onStorage);

            try {
                const raw = window.localStorage.getItem(lockKey);
                if (!raw) return;
                const current = JSON.parse(raw) as { tabId?: string; token?: string };
                if (current.tabId === tabIdRef.current && current.token === lockTokenRef.current) {
                    window.localStorage.removeItem(lockKey);
                }
            } catch {
                // best effort
            }
        };
    }, [lockKey]);

    // Auto-save draft to cache
    useEffect(() => {
        if (!organizationId || !storageDraftKey || editPostId) return;
        if (!isDraftLeader) return;
        if (isSnapshotEmpty(snapshot)) return;

        const saveTimer = window.setTimeout(() => {
            void persistSnapshot(false);
        }, DRAFT_DEBOUNCE_MS);

        return () => clearTimeout(saveTimer);
    }, [organizationId, storageDraftKey, editPostId, isDraftLeader, snapshot, persistSnapshot]);

    // Flush on background/close with localStorage fallback.
    useEffect(() => {
        if (!organizationId || !storageDraftKey || !flushKey || editPostId) return;
        if (typeof window === 'undefined') return;

        const writeLocalFallback = () => {
            try {
                window.localStorage.setItem(flushKey, JSON.stringify({
                    savedAt: Date.now(),
                    snapshot,
                }));
            } catch {
                // best effort fallback only
            }
        };

        const flush = () => {
            if (!isDraftLeader || isSnapshotEmpty(snapshot)) return;
            debugDraft('flush-triggered', {
                organizationId,
                reason: document.visibilityState === 'hidden' ? 'background' : 'pagehide-or-unload',
            });
            writeLocalFallback();
            void persistSnapshot(true);
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                flush();
            }
        };

        window.addEventListener('pagehide', flush);
        window.addEventListener('beforeunload', flush);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('pagehide', flush);
            window.removeEventListener('beforeunload', flush);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [organizationId, storageDraftKey, flushKey, editPostId, isDraftLeader, snapshot, persistSnapshot]);
}

/**
 * useOfflinePublish - Queue a post for later submission when offline.
 * Why: Lets users hit "Publish" even without network — the post is stored in
 * IndexedDB and synced automatically when connectivity returns.
 */
export function useOfflinePublish(options: {
    organizationId?: string;
    isOnline: boolean;
}) {
    const { organizationId, isOnline } = options;
    const [isQueued, setIsQueued] = useState(false);

    const publishOffline = useCallback(async (params: {
        caption: string;
        mediaIds: string[];
        platformAccountIds: string[];
        scheduledAt?: string;
        /** Why: Preserves firstComment through offline round-trip */
        firstComment?: string;
        /** Why: Preserves per-platform settings through offline round-trip */
        platformSettings?: Record<string, Record<string, unknown>>;
    }) => {
        if (!organizationId) return false;

        try {
            await queuePost({
                organizationId,
                caption: params.caption,
                mediaIds: params.mediaIds,
                platformAccountIds: params.platformAccountIds,
                scheduledAt: params.scheduledAt,
                firstComment: params.firstComment,
                platformSettings: params.platformSettings,
            });

            // Why: Register background sync so the SW fires when connectivity returns
            await registerBackgroundSync().catch(() => {
                // Background sync not supported — recovery hook handles this case
            });

            setIsQueued(true);
            toast(
                'info',
                "You're offline",
                'Your post has been queued and will publish when you reconnect.'
            );

            return true;
        } catch (error) {
            logger.error({ err: error }, 'Failed to queue post for offline publish');
            toast('error', 'Queue failed', 'Could not save your post offline. Please try again.');
            return false;
        }
    }, [organizationId]);

    // Reset queued state when back online (sync manager handles the actual sync)
    useEffect(() => {
        if (isOnline && isQueued) {
            setIsQueued(false);
        }
    }, [isOnline, isQueued]);

    return { publishOffline, isQueued };
}
