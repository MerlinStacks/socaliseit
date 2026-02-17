/**
 * Calendar Orchestration Hook
 *
 * Why: Extracted from calendar/page.tsx to keep the page component focused on
 * JSX layout. Centralises state management, data fetching, filtering,
 * drag-drop setup, and action handlers (sync, AI drafts).
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { useDragDropCalendar } from '@/hooks/use-drag-drop-calendar';
import { useAiRecommendedSlots } from '@/hooks/use-ai-recommended-slots';
import { useOrganization } from '@/hooks/use-organization';
import { useCalendarNavigation } from '@/hooks/use-calendar-navigation';
import { type CalendarPost, type CalendarNote, PLATFORMS, type Platform } from '@/components/calendar/calendar-types';
import { POST_TYPES, POST_STATUSES, type PostTypeFilter, type PostStatusFilter } from '../app/(dashboard)/calendar/CalendarFilters';
import { logger } from '@/lib/logger';
import { toast } from '@/components/ui/toast';
import { useCalendarSettingsStore } from '@/lib/stores/calendar-settings-store';
import { getHolidaysForDate, type Holiday } from '@/lib/holidays';
import { ACCOUNTS_QUERY_KEY, accountsQueryFn, ACCOUNTS_STALE_TIME } from '@/hooks/use-compose-data';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Encapsulates all calendar page state, data, filters, and action handlers. */
export function useCalendarOrchestration() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { organization } = useOrganization();
    const calendarSettings = useCalendarSettingsStore();
    const nav = useCalendarNavigation(calendarSettings.weekStartsOn);
    const queryClient = useQueryClient();

    // ── Prefetching ────────────────────────────────────────────────────
    // Why: Pre-download the compose page JS bundle for near-instant open
    useEffect(() => { router.prefetch('/compose'); }, [router]);
    // Why: Warm the accounts cache so the composer skips the loading spinner
    useEffect(() => {
        queryClient.prefetchQuery({
            queryKey: ACCOUNTS_QUERY_KEY,
            queryFn: accountsQueryFn,
            staleTime: ACCOUNTS_STALE_TIME,
        });
    }, [queryClient]);

    // ── Action state ───────────────────────────────────────────────────
    const [syncing, setSyncing] = useState(false);
    const [regeneratingAi, setRegeneratingAi] = useState(false);
    const [deletingAi, setDeletingAi] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // ── Modal state ────────────────────────────────────────────────────
    const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [selectedNote, setSelectedNote] = useState<CalendarNote | null>(null);
    const [noteDefaultDate, setNoteDefaultDate] = useState<string | undefined>();

    // ── Filter dropdown open states ────────────────────────────────────
    const [platformFilterOpen, setPlatformFilterOpen] = useState(false);
    const [postTypeFilterOpen, setPostTypeFilterOpen] = useState(false);
    const [statusFilterOpen, setStatusFilterOpen] = useState(false);

    // ── Filter values (URL-synced) ─────────────────────────────────────
    const parseFilterFromUrl = useCallback(<T extends string>(
        paramName: string,
        validValues: readonly T[],
        defaultValues: readonly T[]
    ): T[] => {
        const param = searchParams.get(paramName);
        if (!param) return [...defaultValues];
        const values = param.split(',').filter((v): v is T =>
            (validValues as readonly string[]).includes(v)
        );
        return values.length > 0 ? values : [...defaultValues];
    }, [searchParams]);

    const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(() =>
        parseFilterFromUrl('platforms', PLATFORMS, PLATFORMS)
    );
    const [selectedPostTypes, setSelectedPostTypes] = useState<PostTypeFilter[]>(() =>
        parseFilterFromUrl('types', POST_TYPES, POST_TYPES)
    );
    const [selectedStatuses, setSelectedStatuses] = useState<PostStatusFilter[]>(() =>
        parseFilterFromUrl('statuses', POST_STATUSES, POST_STATUSES)
    );

    // Persist filter changes to URL
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (selectedPlatforms.length < PLATFORMS.length && selectedPlatforms.length > 0) {
            params.set('platforms', selectedPlatforms.join(','));
        } else { params.delete('platforms'); }
        if (selectedPostTypes.length < POST_TYPES.length && selectedPostTypes.length > 0) {
            params.set('types', selectedPostTypes.join(','));
        } else { params.delete('types'); }
        if (selectedStatuses.length < POST_STATUSES.length && selectedStatuses.length > 0) {
            params.set('statuses', selectedStatuses.join(','));
        } else { params.delete('statuses'); }
        const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
        window.history.replaceState(null, '', newUrl);
    }, [selectedPlatforms, selectedPostTypes, selectedStatuses, searchParams]);

    // ── AI Recommended Slots ───────────────────────────────────────────
    const { slots: aiSlots } = useAiRecommendedSlots(nav.currentWeekStart, organization?.id || '');

    // ── Data Fetching ──────────────────────────────────────────────────
    const { viewMode, selectedDate, currentWeekStart, currentMonthStart } = nav;

    const calendarQueryKey = useMemo(
        () => ['calendar', viewMode, selectedDate.toISOString(), currentWeekStart.toISOString(), currentMonthStart.toISOString()],
        [viewMode, selectedDate, currentWeekStart, currentMonthStart]
    );

    const { data: calendarData, isLoading: loading, refetch } = useQuery<{
        posts: Record<string, CalendarPost[]>;
        notes: Record<string, CalendarNote[]>;
    }>({
        queryKey: calendarQueryKey,
        queryFn: async () => {
            let start: Date, end: Date;
            switch (viewMode) {
                case 'day':
                    start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
                    end = new Date(selectedDate); end.setHours(23, 59, 59, 999);
                    break;
                case 'week':
                    start = currentWeekStart;
                    end = new Date(currentWeekStart); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
                    break;
                case 'month':
                default: {
                    const monthStart = new Date(currentMonthStart); monthStart.setDate(1);
                    const monthEnd = new Date(currentMonthStart); monthEnd.setMonth(monthEnd.getMonth() + 1); monthEnd.setDate(0);
                    const firstDow = monthStart.getDay() || 7;
                    start = new Date(monthStart); start.setDate(start.getDate() - firstDow + 1);
                    const lastDow = monthEnd.getDay() || 7;
                    end = new Date(monthEnd); end.setDate(end.getDate() + (7 - lastDow)); end.setHours(23, 59, 59, 999);
                    break;
                }
            }

            const params = new URLSearchParams({
                start: start.toISOString(), end: end.toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });

            const [postRes, noteRes] = await Promise.all([
                fetch(`/api/calendar?${params}`),
                fetch(`/api/calendar/notes?${params}`),
            ]);

            if (postRes.status === 429) { logger.warn('Calendar API rate limited'); throw new Error('Rate limited'); }
            if (!postRes.ok) throw new Error('Failed to fetch calendar');

            const postData = await postRes.json();
            const noteData = noteRes.ok ? await noteRes.json() : { notes: {} };
            return { posts: postData.posts, notes: noteData.notes };
        },
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });

    const posts = useMemo(() => calendarData?.posts ?? {}, [calendarData?.posts]);
    const notes = useMemo(() => calendarData?.notes ?? {}, [calendarData?.notes]);

    const fetchPosts = useCallback(async () => { await refetch(); }, [refetch]);

    // ── Drag & Drop ────────────────────────────────────────────────────
    const { dragState, handlers: dragHandlers } = useDragDropCalendar({
        onDrop: async (postId, newDate) => {
            try {
                const response = await fetch(`/api/posts/${postId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reschedule', scheduledAt: newDate.toISOString() }),
                });
                if (!response.ok) throw new Error('Failed to reschedule');
                fetchPosts();
            } catch (error) {
                logger.error({ error }, 'Failed to reschedule post');
            }
        },
        onDropRejected: (reason) => { toast('error', 'Cannot reschedule', reason); },
    });

    // ── Click Handlers ─────────────────────────────────────────────────
    const handleSlotClick = useCallback((date: Date, hour?: number, platform?: string) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const params = new URLSearchParams({ date: dateStr });
        if (hour !== undefined) params.set('time', `${hour.toString().padStart(2, '0')}:00`);
        if (platform) params.set('platform', platform);
        if (selectedPlatforms.length < PLATFORMS.length && selectedPlatforms.length > 0) {
            params.set('platforms', selectedPlatforms.join(','));
        }
        router.push(`/compose?${params}`);
    }, [router, selectedPlatforms]);

    const handleNewNote = useCallback((date?: Date) => {
        setSelectedNote(null);
        setNoteDefaultDate(date ? format(date, 'yyyy-MM-dd') : undefined);
        setIsNoteModalOpen(true);
    }, []);

    const handleNoteClick = useCallback((note: CalendarNote) => {
        setSelectedNote(note);
        setIsNoteModalOpen(true);
    }, []);

    /** Why: O(1) lookup instead of scanning all days' arrays */
    const postByDragKey = useMemo(() => {
        const map = new Map<string, CalendarPost>();
        for (const dayPosts of Object.values(posts)) {
            for (const p of dayPosts) map.set(p.dragKey, p);
        }
        return map;
    }, [posts]);

    const handlePostClick = useCallback(async (dragKey: string) => {
        const found = postByDragKey.get(dragKey);
        if (!found) return;
        const status = found.status.toLowerCase();
        if (status === 'published' || found.isExternal) {
            try {
                const response = await fetch(`/api/posts/${found.id}`);
                if (response.ok) {
                    const postData = await response.json();
                    setSelectedPost({ ...found, analytics: postData.analytics || null });
                } else { setSelectedPost(found); }
            } catch { setSelectedPost(found); }
            setIsPreviewOpen(true);
        } else {
            router.push(`/compose?edit=${found.id}`);
        }
    }, [postByDragKey, router]);

    const handleClosePreview = useCallback(() => {
        setIsPreviewOpen(false);
        setSelectedPost(null);
    }, []);

    // ── Action Handlers ────────────────────────────────────────────────
    const handleSync = async () => {
        setSyncing(true);
        try {
            const response = await fetch('/api/posts/sync', { method: 'POST' });
            const result = await response.json();
            await fetchPosts();
            toast('success', 'Sync complete', `Synced ${result.synced ?? 0} posts from connected platforms.`);
        } catch (error) {
            logger.error({ error }, 'Sync failed');
            toast('error', 'Sync failed', 'Could not sync posts. Please try again.');
        } finally { setSyncing(false); }
    };

    const handleRegenerateAiDrafts = async () => {
        setRegeneratingAi(true);
        try {
            const response = await fetch('/api/ai/scheduling/generate-drafts?force=true', { method: 'POST' });
            const result = await response.json();
            if (result.success) {
                logger.info({ deleted: result.deleted, created: result.created }, 'AI drafts regenerated');
                await fetchPosts();
                toast('success', 'AI drafts regenerated', `Created ${result.created ?? 0} new draft suggestions.`);
            } else { toast('error', 'Generation failed', result.error || 'Could not generate AI drafts.'); }
        } catch (error) {
            logger.error({ error }, 'Failed to regenerate AI drafts');
            toast('error', 'Generation failed', 'Could not generate AI drafts. Please try again.');
        } finally { setRegeneratingAi(false); }
    };

    const handleDeleteAiDrafts = async () => {
        setDeletingAi(true);
        try {
            const response = await fetch('/api/ai/scheduling/generate-drafts', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteOnly: true }),
            });
            const result = await response.json();
            if (result.success) {
                logger.info({ deleted: result.deleted }, 'AI drafts deleted');
                await fetchPosts();
                toast('success', 'AI drafts deleted', `Removed ${result.deleted ?? 0} AI draft suggestions.`);
            } else { toast('error', 'Delete failed', result.error || 'Could not delete AI drafts.'); }
        } catch (error) {
            logger.error({ error }, 'Failed to delete AI drafts');
            toast('error', 'Delete failed', 'Could not delete AI drafts. Please try again.');
        } finally { setDeletingAi(false); setShowDeleteConfirm(false); }
    };

    // ── Derived Data ───────────────────────────────────────────────────
    const filteredPosts = useMemo(() => {
        const allP = selectedPlatforms.length === PLATFORMS.length;
        const allT = selectedPostTypes.length === POST_TYPES.length;
        const allS = selectedStatuses.length === POST_STATUSES.length;
        if (allP && allT && allS) return posts;

        const filtered: Record<string, CalendarPost[]> = {};
        for (const [date, dayPosts] of Object.entries(posts)) {
            const filteredDay = dayPosts.filter(post => {
                if (!allP && !selectedPlatforms.includes(post.platform as Platform)) return false;
                if (!allT && post.postType && !selectedPostTypes.includes(post.postType as PostTypeFilter)) return false;
                if (!allS) {
                    const ps = post.status?.toLowerCase() || 'draft';
                    const isAi = post.isAiGenerated && ps === 'draft';
                    if (isAi && !selectedStatuses.includes('ai_draft')) return false;
                    if (!isAi && !selectedStatuses.includes(ps as PostStatusFilter)) return false;
                }
                if (!calendarSettings.showExternalPosts && post.isExternal) return false;
                return true;
            });
            if (filteredDay.length > 0) filtered[date] = filteredDay;
        }
        return filtered;
    }, [posts, selectedPlatforms, selectedPostTypes, selectedStatuses, calendarSettings.showExternalPosts]);

    const visibleNotes = useMemo(() => {
        if (calendarSettings.showNotes) return notes;
        return {};
    }, [notes, calendarSettings.showNotes]);

    const dateRangeKey = `${viewMode}-${selectedDate.toISOString()}-${currentWeekStart.toISOString()}-${currentMonthStart.toISOString()}`;
    const holidayMap = useMemo(() => {
        const result: Record<string, Holiday[]> = {};
        const settings = {
            nationalHolidays: calendarSettings.nationalHolidays,
            religiousHolidays: calendarSettings.religiousHolidays,
            showFunHolidays: calendarSettings.showFunHolidays,
        };
        const dateKeys = new Set([...Object.keys(posts), ...Object.keys(notes)]);
        const range = nav.getDateRange();
        if (range) {
            const d = new Date(range.start);
            while (d <= range.end) {
                dateKeys.add(d.toISOString().substring(0, 10));
                d.setDate(d.getDate() + 1);
            }
        }
        for (const dk of dateKeys) {
            const h = getHolidaysForDate(dk, settings);
            if (h.length > 0) result[dk] = h;
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [posts, notes, dateRangeKey, calendarSettings.nationalHolidays, calendarSettings.religiousHolidays, calendarSettings.showFunHolidays]);

    const closeAllFilters = () => {
        setPlatformFilterOpen(false);
        setPostTypeFilterOpen(false);
        setStatusFilterOpen(false);
    };

    // ── Return ─────────────────────────────────────────────────────────
    return {
        // Navigation
        nav, router,
        // Data
        loading, filteredPosts, visibleNotes, holidayMap, aiSlots,
        // Drag-drop
        dragState, dragHandlers,
        // Filters
        selectedPlatforms, setSelectedPlatforms,
        selectedPostTypes, setSelectedPostTypes,
        selectedStatuses, setSelectedStatuses,
        platformFilterOpen, setPlatformFilterOpen,
        postTypeFilterOpen, setPostTypeFilterOpen,
        statusFilterOpen, setStatusFilterOpen,
        closeAllFilters,
        // Modals
        selectedPost, isPreviewOpen, handleClosePreview,
        isNoteModalOpen, setIsNoteModalOpen, selectedNote, noteDefaultDate,
        // Actions
        syncing, handleSync,
        regeneratingAi, handleRegenerateAiDrafts,
        deletingAi, handleDeleteAiDrafts,
        showDeleteConfirm, setShowDeleteConfirm,
        fetchPosts,
        // Click handlers
        handleSlotClick, handlePostClick, handleNewNote, handleNoteClick,
        // Settings
        calendarSettings,
    };
}
