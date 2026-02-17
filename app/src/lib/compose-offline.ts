/**
 * Compose Offline Support - Draft caching, offline publish, and network status
 * Why: Extracted from compose/page.tsx to reduce file size and improve maintainability
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { saveDraft, getDrafts, deleteDraft, queuePost } from '@/lib/offline-queue';
import { registerBackgroundSync } from '@/lib/sync-manager';
import { toast } from '@/components/ui/toast';
import { logger } from '@/lib/logger';
import { type MediaItem } from '@/components/compose/platform-editor';

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

                if (recentDraft) {
                    // Only restore if it's less than 24 hours old
                    const draftAge = Date.now() - new Date(recentDraft.lastSavedAt).getTime();
                    if (draftAge < 24 * 60 * 60 * 1000) {
                        setCaption(recentDraft.caption);
                        if (recentDraft.platformAccountIds) {
                            setSelectedAccountIds(recentDraft.platformAccountIds);
                        }
                        toast('info', 'Draft restored', 'Your previous draft has been loaded.');
                    }
                }
            } catch (error) {
                logger.error({ err: error }, 'Failed to load cached draft from IndexedDB');
            }
        }

        loadCachedDraft();
    }, [editPostId, organizationId, setCaption, setSelectedAccountIds]);

    // Auto-save draft to cache
    useEffect(() => {
        if (!organizationId || !caption) return;

        const saveTimer = setTimeout(async () => {
            try {
                const draftId = `draft-${organizationId}`;
                await saveDraft({
                    id: draftId,
                    organizationId,
                    caption,
                    mediaIds: media.map(m => m.id),
                    platformAccountIds: selectedAccountIds,
                    scheduledAt: selectedDate ? scheduledDate : undefined,
                });
            } catch (error) {
                logger.error({ err: error }, 'Failed to auto-save draft to IndexedDB');
            }
        }, 1000); // Debounce 1s

        return () => clearTimeout(saveTimer);
    }, [organizationId, caption, media, selectedAccountIds, scheduledDate, selectedDate]);
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
    }) => {
        if (!organizationId) return false;

        try {
            await queuePost({
                organizationId,
                caption: params.caption,
                mediaIds: params.mediaIds,
                platformAccountIds: params.platformAccountIds,
                scheduledAt: params.scheduledAt,
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
