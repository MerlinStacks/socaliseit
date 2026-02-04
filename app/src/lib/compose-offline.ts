/**
 * Compose Offline Support - Draft caching and network status monitoring
 * Extracted from compose/page.tsx to reduce file size and improve maintainability
 */

import { useEffect, useState } from 'react';
import { saveDraft, getDrafts, deleteDraft } from '@/lib/offline-queue';
import { toast } from '@/components/ui/toast';
import { type MediaItem } from '@/components/compose/platform-editor';

/**
 * useOnlineStatus - Monitor network connectivity
 * Why: Enables offline draft saving when network is unavailable
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
                console.error('Error loading draft:', error);
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
                console.error('Error auto-saving draft:', error);
            }
        }, 1000); // Debounce 1s

        return () => clearTimeout(saveTimer);
    }, [organizationId, caption, media, selectedAccountIds, scheduledDate, selectedDate]);
}
