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
export function useCalendarOrchestration(options?: {
    initialData?: {
        posts: Record<string, CalendarPost[]>;
        notes: Record<string, CalendarNote[]>;
    } | null;
    /** Why: Mobile renders its own agenda/month views with an independent date.
     *  When true, the hook always fetches a full month range so all days have data. */
    isMobile?: boolean;
}) {
    const initialData = options?.initialData;
    const isMobile = options?.isMobile ?? false;
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

    // ── Modal state ────────────────────────────────────────────────────
    const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [selectedNote, setSelectedNote] = useState<CalendarNote | null>(null);
    const [noteDefaultDate, setNoteDefaultDate] = useState<string | undefined>();

    // Quick Add Modal state
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);

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
        () => ['calendar', organization?.id, isMobile ? 'mobile' : viewMode, selectedDate.toISOString(), currentWeekStart.toISOString(), currentMonthStart.toISOString()],
        [organization?.id, isMobile, viewMode, selectedDate, currentWeekStart, currentMonthStart]
    );

    const { data: calendarData, isLoading: loading, refetch } = useQuery<{
        posts: Record<string, CalendarPost[]>;
        notes: Record<string, CalendarNote[]>;
    }>({
        queryKey: calendarQueryKey,
        queryFn: async () => {
            let start: Date, end: Date;

            if (isMobile) {
                /**
                 * Why: Mobile views (agenda day strip + month grid) need a full
                 * month of data. Always fetch the current month ± padding so the
                 * day strip (14-day window) and month grid both have posts.
                 */
                const monthStart = new Date(currentMonthStart); monthStart.setDate(1);
                const monthEnd = new Date(currentMonthStart); monthEnd.setMonth(monthEnd.getMonth() + 1); monthEnd.setDate(0);
                const firstDow = monthStart.getDay() || 7;
                start = new Date(monthStart); start.setDate(start.getDate() - firstDow + 1);
                const lastDow = monthEnd.getDay() || 7;
                end = new Date(monthEnd); end.setDate(end.getDate() + (7 - lastDow)); end.setHours(23, 59, 59, 999);
            } else {
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
        /**
         * Why: When initialData is provided from a server-side prefetch,
         * React Query uses it instead of making an API call. The calendar
         * renders with data on the FIRST frame — no waterfall.
         * On subsequent navigations (week/month changes), React Query
         * fetches fresh data via the queryFn above.
         */
        initialData: initialData ?? undefined,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });

    const posts = useMemo(() => calendarData?.posts ?? {}, [calendarData?.posts]);
    const notes = useMemo(() => calendarData?.notes ?? {}, [calendarData?.notes]);

    const fetchPosts = useCallback(async () => { await refetch(); }, [refetch]);

    // ── Drag & Drop ────────────────────────────────────────────────────
    const { dragState, handlers: dragHandlers } = useDragDropCalendar({
        onDrop: async (postId, newDate, isCopy) => {
            try {
                const action = isCopy ? 'duplicate' : 'reschedule';
                const response = await fetch(`/api/posts/${postId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, scheduledAt: newDate.toISOString() }),
                });
                if (!response.ok) throw new Error(`Failed to ${action}`);
                await fetchPosts();
            } catch (error) {
                logger.error({ error }, `Failed to ${isCopy ? 'duplicate' : 'reschedule'} post`);
                throw error;
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

    const handleQuickAddClick = useCallback((date: Date, hour?: number) => {
        const targetDate = new Date(date);
        if (hour !== undefined) {
            targetDate.setHours(hour, 0, 0, 0);
        }
        setQuickAddDate(targetDate);
        setIsQuickAddOpen(true);
    }, []);

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
        isQuickAddOpen, setIsQuickAddOpen, quickAddDate,
        // Actions
        syncing, handleSync,
        fetchPosts,
        // Click handlers
        handleSlotClick, handleQuickAddClick, handlePostClick, handleNewNote, handleNoteClick,
        // Settings
        calendarSettings,
    };
}
