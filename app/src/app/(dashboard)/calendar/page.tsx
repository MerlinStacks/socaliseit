/**
 * Calendar page with Day/Week/Month views and platform filtering
 * Displays scheduled posts by platform with real data
 * 
 * Features:
 * - Click-to-create posts in any view
 * - AI-recommended time slot indicators
 * - Drag & drop rescheduling with visual feedback
 * - Mobile-optimized agenda view
 * 
 * Decomposed for 200-line standard compliance
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight, RefreshCcw, Sparkles, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { SkeletonCalendarGrid } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDragDropCalendar } from '@/hooks/use-drag-drop-calendar';
import { useAiRecommendedSlots } from '@/hooks/use-ai-recommended-slots';
import { useOrganization } from '@/hooks/use-organization';
import { useCalendarNavigation } from '@/hooks/use-calendar-navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { MonthView } from '@/components/calendar/month-view';
import { type CalendarPost, type CalendarNote, PLATFORMS, type Platform } from '@/components/calendar/calendar-types';
import {
    PlatformFilter, PostTypeFilterDropdown, StatusFilterDropdown,
    POST_TYPES, POST_STATUSES, type PostTypeFilter, type PostStatusFilter
} from './CalendarFilters';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';
import { ContextualEmptyState } from '@/components/ui/contextual-empty-state';
import { logger } from '@/lib/logger';
import { toast } from '@/components/ui/toast';
import { useCalendarSettingsStore } from '@/lib/stores/calendar-settings-store';
import { getHolidaysForDate, type Holiday } from '@/lib/holidays';
import { ACCOUNTS_QUERY_KEY, accountsQueryFn, ACCOUNTS_STALE_TIME } from '@/hooks/use-compose-data';

// Lazy-load views, modals, and mobile layout — only downloaded when needed
const DayView = dynamic(() => import('@/components/calendar/day-view').then(m => ({ default: m.DayView })), { ssr: false });
const WeekView = dynamic(() => import('@/components/calendar/week-view').then(m => ({ default: m.WeekView })), { ssr: false });
const TimelineView = dynamic(() => import('@/components/calendar/timeline-view').then(m => ({ default: m.TimelineView })), { ssr: false });
const CalendarMobile = dynamic(() => import('./calendar-mobile').then(m => ({ default: m.CalendarMobile })), { ssr: false });
const PostPreviewModal = dynamic(() => import('@/components/calendar/post-preview-modal').then(m => ({ default: m.PostPreviewModal })), { ssr: false });
const NoteModal = dynamic(() => import('@/components/calendar/note-modal').then(m => ({ default: m.NoteModal })), { ssr: false });

export default function CalendarPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isMobile = useIsMobile();
    const { organization } = useOrganization();
    const calendarSettings = useCalendarSettingsStore();
    const nav = useCalendarNavigation(calendarSettings.weekStartsOn);
    const queryClient = useQueryClient();

    // Why: Pre-download the compose page JS bundle so opening the
    // composer from calendar is near-instant instead of ~7s cold-load
    useEffect(() => {
        router.prefetch('/compose');
    }, [router]);

    // Why: Warm the accounts cache so the composer skips the loading spinner
    useEffect(() => {
        queryClient.prefetchQuery({
            queryKey: ACCOUNTS_QUERY_KEY,
            queryFn: accountsQueryFn,
            staleTime: ACCOUNTS_STALE_TIME,
        });
    }, [queryClient]);

    // Data state — managed by React Query for cache invalidation across pages
    const [syncing, setSyncing] = useState(false);
    const [regeneratingAi, setRegeneratingAi] = useState(false);
    const [deletingAi, setDeletingAi] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Post preview modal state
    const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    // Note modal state
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [selectedNote, setSelectedNote] = useState<CalendarNote | null>(null);
    const [noteDefaultDate, setNoteDefaultDate] = useState<string | undefined>();

    // Filter dropdown open states
    const [platformFilterOpen, setPlatformFilterOpen] = useState(false);
    const [postTypeFilterOpen, setPostTypeFilterOpen] = useState(false);
    const [statusFilterOpen, setStatusFilterOpen] = useState(false);

    /**
     * Parse filter state from URL search params for persistence across navigations
     */
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

    // Initialize filter states from URL params
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
        } else {
            params.delete('platforms');
        }

        if (selectedPostTypes.length < POST_TYPES.length && selectedPostTypes.length > 0) {
            params.set('types', selectedPostTypes.join(','));
        } else {
            params.delete('types');
        }

        if (selectedStatuses.length < POST_STATUSES.length && selectedStatuses.length > 0) {
            params.set('statuses', selectedStatuses.join(','));
        } else {
            params.delete('statuses');
        }

        const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
        window.history.replaceState(null, '', newUrl);
    }, [selectedPlatforms, selectedPostTypes, selectedStatuses, searchParams]);

    // AI Recommended Slots
    const { slots: aiSlots } = useAiRecommendedSlots(nav.currentWeekStart, organization?.id || '');

    // Extract stable values from nav
    const { viewMode, selectedDate, currentWeekStart, currentMonthStart } = nav;

    /**
     * React Query for calendar data
     * Why: Enables cache invalidation from compose-actions so the calendar
     * updates instantly when the user schedules/publishes a post and navigates back.
     */
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
            // Calculate date range based on current view
            let start: Date, end: Date;
            switch (viewMode) {
                case 'day':
                    start = new Date(selectedDate);
                    start.setHours(0, 0, 0, 0);
                    end = new Date(selectedDate);
                    end.setHours(23, 59, 59, 999);
                    break;
                case 'week':
                    start = currentWeekStart;
                    end = new Date(currentWeekStart);
                    end.setDate(end.getDate() + 6);
                    end.setHours(23, 59, 59, 999);
                    break;
                case 'month':
                default: {
                    const monthStart = new Date(currentMonthStart);
                    monthStart.setDate(1);
                    const monthEnd = new Date(currentMonthStart);
                    monthEnd.setMonth(monthEnd.getMonth() + 1);
                    monthEnd.setDate(0);
                    const firstDayOfWeek = monthStart.getDay() || 7;
                    start = new Date(monthStart);
                    start.setDate(start.getDate() - firstDayOfWeek + 1);
                    const lastDayOfWeek = monthEnd.getDay() || 7;
                    end = new Date(monthEnd);
                    end.setDate(end.getDate() + (7 - lastDayOfWeek));
                    end.setHours(23, 59, 59, 999);
                    break;
                }
            }

            const params = new URLSearchParams({
                start: start.toISOString(),
                end: end.toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });

            const [postRes, noteRes] = await Promise.all([
                fetch(`/api/calendar?${params}`),
                fetch(`/api/calendar/notes?${params}`),
            ]);

            if (postRes.status === 429) {
                logger.warn('Calendar API rate limited');
                throw new Error('Rate limited');
            }
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

    /**
     * Imperative refetch wrapper for drag-drop, sync, and other actions
     * Why: These features call fetchPosts() directly after mutations
     */
    const fetchPosts = useCallback(async () => {
        await refetch();
    }, [refetch]);

    // Drag & Drop functionality
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
        onDropRejected: (reason) => {
            toast('error', 'Cannot reschedule', reason);
        },
    });

    // Handlers
    const handleSlotClick = useCallback((date: Date, hour?: number, platform?: string) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const params = new URLSearchParams({ date: dateStr });
        if (hour !== undefined) params.set('time', `${hour.toString().padStart(2, '0')}:00`);
        if (platform) params.set('platform', platform);
        // Carry active platform filters so the composer pre-selects matching accounts
        if (selectedPlatforms.length < PLATFORMS.length && selectedPlatforms.length > 0) {
            params.set('platforms', selectedPlatforms.join(','));
        }
        router.push(`/compose?${params}`);
    }, [router, selectedPlatforms]);

    /** Open note modal for creating a new note on a specific date */
    const handleNewNote = useCallback((date?: Date) => {
        setSelectedNote(null);
        setNoteDefaultDate(date ? format(date, 'yyyy-MM-dd') : undefined);
        setIsNoteModalOpen(true);
    }, []);

    /** Open note modal for editing an existing note */
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
                } else {
                    setSelectedPost(found);
                }
            } catch {
                setSelectedPost(found);
            }
            setIsPreviewOpen(true);
        } else {
            router.push(`/compose?edit=${found.id}`);
        }
    }, [postByDragKey, router]);

    const handleClosePreview = useCallback(() => {
        setIsPreviewOpen(false);
        setSelectedPost(null);
    }, []);

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
        } finally {
            setSyncing(false);
        }
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
            } else {
                toast('error', 'Generation failed', result.error || 'Could not generate AI drafts.');
            }
        } catch (error) {
            logger.error({ error }, 'Failed to regenerate AI drafts');
            toast('error', 'Generation failed', 'Could not generate AI drafts. Please try again.');
        } finally {
            setRegeneratingAi(false);
        }
    };

    const handleDeleteAiDrafts = async () => {
        setDeletingAi(true);
        try {
            const response = await fetch('/api/ai/scheduling/generate-drafts', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteOnly: true })
            });
            const result = await response.json();
            if (result.success) {
                logger.info({ deleted: result.deleted }, 'AI drafts deleted');
                await fetchPosts();
                toast('success', 'AI drafts deleted', `Removed ${result.deleted ?? 0} AI draft suggestions.`);
            } else {
                toast('error', 'Delete failed', result.error || 'Could not delete AI drafts.');
            }
        } catch (error) {
            logger.error({ error }, 'Failed to delete AI drafts');
            toast('error', 'Delete failed', 'Could not delete AI drafts. Please try again.');
        } finally {
            setDeletingAi(false);
            setShowDeleteConfirm(false);
        }
    };

    // Filter posts by selected platforms, post types, and statuses
    const filteredPosts = useMemo(() => {
        const allPlatformsSelected = selectedPlatforms.length === PLATFORMS.length;
        const allTypesSelected = selectedPostTypes.length === POST_TYPES.length;
        const allStatusesSelected = selectedStatuses.length === POST_STATUSES.length;

        if (allPlatformsSelected && allTypesSelected && allStatusesSelected) return posts;

        const filtered: Record<string, CalendarPost[]> = {};
        for (const [date, dayPosts] of Object.entries(posts)) {
            const filteredDay = dayPosts.filter(post => {
                if (!allPlatformsSelected && !selectedPlatforms.includes(post.platform as Platform)) return false;
                if (!allTypesSelected && post.postType && !selectedPostTypes.includes(post.postType as PostTypeFilter)) return false;
                if (!allStatusesSelected) {
                    const postStatus = post.status?.toLowerCase() || 'draft';
                    const isAiDraft = post.isAiGenerated && postStatus === 'draft';
                    if (isAiDraft && !selectedStatuses.includes('ai_draft')) return false;
                    if (!isAiDraft && !selectedStatuses.includes(postStatus as PostStatusFilter)) return false;
                }
                // Filter external posts based on settings toggle
                if (!calendarSettings.showExternalPosts && post.isExternal) return false;
                return true;
            });
            if (filteredDay.length > 0) filtered[date] = filteredDay;
        }
        return filtered;
    }, [posts, selectedPlatforms, selectedPostTypes, selectedStatuses, calendarSettings.showExternalPosts]);

    // Conditionally hide notes based on settings
    const visibleNotes = useMemo(() => {
        if (calendarSettings.showNotes) return notes;
        return {};
    }, [notes, calendarSettings.showNotes]);

    // Build holiday lookup map for visible date range
    // Why: Extracted date range computation to use stable destructured values
    // instead of the whole `nav` object (which is a new reference every render).
    const dateRangeKey = `${viewMode}-${selectedDate.toISOString()}-${currentWeekStart.toISOString()}-${currentMonthStart.toISOString()}`;
    const holidayMap = useMemo(() => {
        const result: Record<string, Holiday[]> = {};
        const settings = {
            nationalHolidays: calendarSettings.nationalHolidays,
            religiousHolidays: calendarSettings.religiousHolidays,
            showFunHolidays: calendarSettings.showFunHolidays,
        };
        // Build for all dates in current posts + note keys
        const dateKeys = new Set([...Object.keys(posts), ...Object.keys(notes)]);
        // Also add current view's days for holidays that fall on empty days
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

    // Mobile layout
    if (isMobile) {
        return (
            <CalendarMobile
                posts={filteredPosts}
                loading={loading}
                onSync={handleSync}
                onRefresh={fetchPosts}
                onPostClick={handlePostClick}
                syncing={syncing}
            />
        );
    }

    // Desktop layout
    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <h1 className="text-2xl font-semibold">Calendar</h1>
                <span className="text-sm text-[var(--text-muted)]">{nav.getHeaderText()}</span>
            </header>

            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-4">
                <div className="flex items-center gap-3">
                    {/* Navigation */}
                    <div className="flex items-center gap-1">
                        <button onClick={nav.goToPrevious} className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors" data-testid="calendar-prev">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <Button variant="secondary" onClick={nav.goToToday}>Today</Button>
                        <button onClick={nav.goToNext} className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors" data-testid="calendar-next">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    {/* View Tabs */}
                    <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-1">
                        {(['day', 'week', 'month', 'timeline'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => nav.setViewMode(mode)}
                                data-testid={`view-${mode}`}
                                className={`rounded-md px-4 py-2 text-sm capitalize ${nav.viewMode === mode ? 'bg-[var(--bg-secondary)] font-medium shadow-sm' : 'text-[var(--text-muted)]'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <PlatformFilter
                        selectedPlatforms={selectedPlatforms}
                        setSelectedPlatforms={setSelectedPlatforms}
                        isOpen={platformFilterOpen}
                        onToggle={() => { setPlatformFilterOpen(!platformFilterOpen); setPostTypeFilterOpen(false); setStatusFilterOpen(false); }}
                    />
                    <PostTypeFilterDropdown
                        selectedPostTypes={selectedPostTypes}
                        setSelectedPostTypes={setSelectedPostTypes}
                        isOpen={postTypeFilterOpen}
                        onToggle={() => { setPostTypeFilterOpen(!postTypeFilterOpen); setPlatformFilterOpen(false); setStatusFilterOpen(false); }}
                    />
                    <StatusFilterDropdown
                        selectedStatuses={selectedStatuses}
                        setSelectedStatuses={setSelectedStatuses}
                        isOpen={statusFilterOpen}
                        onToggle={() => { setStatusFilterOpen(!statusFilterOpen); setPlatformFilterOpen(false); setPostTypeFilterOpen(false); }}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <CalendarSettingsPanel />
                    <Button variant="secondary" size="icon" onClick={handleRegenerateAiDrafts} disabled={regeneratingAi} title="Regenerate AI draft suggestions">
                        <Sparkles className={cn("h-4 w-4", regeneratingAi && "animate-pulse")} />
                    </Button>
                    <Button variant="secondary" size="icon" onClick={() => setShowDeleteConfirm(true)} disabled={deletingAi} title="Delete all AI drafts">
                        <Trash2 className={cn("h-4 w-4 text-red-500", deletingAi && "animate-pulse")} />
                    </Button>
                    <Button variant="secondary" size="icon" onClick={handleSync} disabled={syncing} title="Sync external posts">
                        <RefreshCcw className={cn("h-4 w-4", syncing && "animate-spin")} />
                    </Button>
                    <Button variant="secondary" onClick={() => handleNewNote()}>
                        <Plus className="h-4 w-4" />
                        New Note
                    </Button>
                    <Button onClick={() => {
                        const composeUrl = selectedPlatforms.length < PLATFORMS.length && selectedPlatforms.length > 0
                            ? `/compose?platforms=${selectedPlatforms.join(',')}`
                            : '/compose';
                        router.push(composeUrl);
                    }}>
                        <Plus className="h-4 w-4" />
                        New Post
                    </Button>
                </div>

                {/* Delete AI Drafts Confirmation Dialog */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
                        <div className="bg-[var(--bg-secondary)] rounded-xl p-6 max-w-md mx-4 shadow-xl border border-[var(--border)]" onClick={e => e.stopPropagation()}>
                            <h3 className="text-lg font-semibold mb-2">Delete All AI Drafts?</h3>
                            <p className="text-[var(--text-muted)] mb-4">
                                This will permanently delete all AI-generated draft suggestions from your calendar. Your regular scheduled posts will not be affected.
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                                <Button variant="danger" onClick={handleDeleteAiDrafts} disabled={deletingAi}>
                                    {deletingAi ? 'Deleting...' : 'Delete AI Drafts'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Calendar Content */}
            <div className="flex-1 overflow-auto p-8" onClick={closeAllFilters}>
                {loading ? (
                    <SkeletonCalendarGrid data-testid="calendar-skeleton" />
                ) : (
                    <div data-testid="calendar-grid">
                        {nav.viewMode === 'day' && (
                            <DayView date={nav.selectedDate} posts={filteredPosts} notes={visibleNotes} aiSlots={aiSlots} dragState={dragState} dragHandlers={dragHandlers} onPostClick={handlePostClick} onSlotClick={handleSlotClick} onNoteClick={handleNoteClick} holidays={holidayMap[format(nav.selectedDate, 'yyyy-MM-dd')] || []} />
                        )}
                        {nav.viewMode === 'week' && (
                            <WeekView weekStart={nav.currentWeekStart} posts={filteredPosts} notes={visibleNotes} aiSlots={aiSlots} dragState={dragState} dragHandlers={dragHandlers} onPostClick={handlePostClick} onSlotClick={handleSlotClick} onNoteClick={handleNoteClick} />
                        )}
                        {nav.viewMode === 'month' && (
                            <MonthView monthStart={nav.currentMonthStart} posts={filteredPosts} notes={visibleNotes} dragState={dragState} dragHandlers={dragHandlers} onPostClick={handlePostClick} onDayClick={(date) => handleSlotClick(date)} onNoteClick={handleNoteClick} onNewNote={handleNewNote} weekStartsOn={calendarSettings.weekStartsOn} postPreview={calendarSettings.postPreview} holidays={holidayMap} />
                        )}
                        {nav.viewMode === 'timeline' && (
                            <TimelineView date={nav.selectedDate} posts={filteredPosts} onPostClick={handlePostClick} />
                        )}

                        {Object.keys(filteredPosts).length === 0 && (
                            <ContextualEmptyState
                                type="calendar"
                                actions={[
                                    {
                                        label: 'Schedule a Post',
                                        onClick: () => {
                                            const composeUrl = selectedPlatforms.length < PLATFORMS.length && selectedPlatforms.length > 0
                                                ? `/compose?platforms=${selectedPlatforms.join(',')}`
                                                : '/compose';
                                            router.push(composeUrl);
                                        },
                                        variant: 'primary',
                                    },
                                    {
                                        label: 'Generate AI Drafts',
                                        onClick: handleRegenerateAiDrafts,
                                        variant: 'secondary',
                                    },
                                ]}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Post Preview Modal */}
            {selectedPost && (
                <PostPreviewModal post={selectedPost} isOpen={isPreviewOpen} onClose={handleClosePreview} onRefresh={fetchPosts} />
            )}

            {/* Note Modal */}
            <NoteModal
                isOpen={isNoteModalOpen}
                onClose={() => setIsNoteModalOpen(false)}
                onSaved={fetchPosts}
                defaultDate={noteDefaultDate}
                note={selectedNote}
            />
        </div>
    );
}
