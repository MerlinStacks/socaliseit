/**
 * Calendar page — client component
 *
 * Why client-side, not server-side prefetch:
 * Calendar data MUST be grouped by the user's browser timezone. The server
 * can't know this at SSR time (Docker runs in UTC), so posts near midnight
 * end up on the wrong date. Client-side fetching with React Query ensures
 * correct timezone grouping.
 *
 * Performance is still fast because:
 * 1. Sidebar prefetches the /calendar route bundle on mount
 * 2. React Query caches data for 30s (staleTime)
 * 3. Dynamic imports show skeleton fallbacks while loading
 * 4. next.config staleTimes: { dynamic: 60 } enables instant back-nav
 */

'use client';

import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { SkeletonCalendarGrid } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { PLATFORMS } from '@/components/calendar/calendar-types';
import { PlatformFilter, PostTypeFilterDropdown, StatusFilterDropdown } from './CalendarFilters';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';
import { ContextualEmptyState } from '@/components/ui/contextual-empty-state';
import { useCalendarOrchestration } from '@/hooks/use-calendar-orchestration';

/**
 * Why: Calendar views are large bundles. Without loading fallbacks, users see a blank
 * area while the JS downloads. Adding SkeletonCalendarGrid as fallback gives immediate
 * visual feedback. Modal components don't need fallbacks since they're hidden by default.
 */
const DayView = dynamic(() => import('@/components/calendar/day-view').then(m => ({ default: m.DayView })), { ssr: false, loading: () => <SkeletonCalendarGrid /> });
const WeekView = dynamic(() => import('@/components/calendar/week-view').then(m => ({ default: m.WeekView })), { ssr: false, loading: () => <SkeletonCalendarGrid /> });
const MonthView = dynamic(() => import('@/components/calendar/month-view').then(m => ({ default: m.MonthView })), { ssr: false, loading: () => <SkeletonCalendarGrid /> });
const TimelineView = dynamic(() => import('@/components/calendar/timeline-view').then(m => ({ default: m.TimelineView })), { ssr: false, loading: () => <SkeletonCalendarGrid /> });
const CalendarMobile = dynamic(() => import('./calendar-mobile').then(m => ({ default: m.CalendarMobile })), { ssr: false });
const PostPreviewModal = dynamic(() => import('@/components/calendar/post-preview-modal').then(m => ({ default: m.PostPreviewModal })), { ssr: false });
const NoteModal = dynamic(() => import('@/components/calendar/note-modal').then(m => ({ default: m.NoteModal })), { ssr: false });
const QuickAddModal = dynamic(() => import('@/components/calendar/quick-add-modal').then(m => ({ default: m.QuickAddModal })), { ssr: false });

export default function CalendarPage() {
    const isMobile = useIsMobile();
    const cal = useCalendarOrchestration({ isMobile });
    const { nav, router } = cal;

    // Mobile layout
    if (isMobile) {
        return (
            <>
                <CalendarMobile
                    posts={cal.filteredPosts}
                    loading={cal.loading}
                    onSync={cal.handleSync}
                    onRefresh={cal.fetchPosts}
                    onPostClick={cal.handlePostClick}
                    syncing={cal.syncing}
                />
                {/* Why: Mobile post clicks now show the preview modal for non-failed,
                    non-manual-publish posts, so we need the modal rendered here too */}
                {cal.selectedPost && (
                    <PostPreviewModal post={cal.selectedPost} isOpen={cal.isPreviewOpen} onClose={cal.handleClosePreview} onRefresh={cal.fetchPosts} />
                )}
            </>
        );
    }

    // Desktop layout
    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <h1 className="text-2xl font-semibold">Calendar</h1>
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

                    {/* Current date label */}
                    <span className="text-sm font-medium text-[var(--text-secondary)]">{nav.getHeaderText()}</span>

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
                        selectedPlatforms={cal.selectedPlatforms}
                        setSelectedPlatforms={cal.setSelectedPlatforms}
                        isOpen={cal.platformFilterOpen}
                        onToggle={() => { cal.setPlatformFilterOpen(!cal.platformFilterOpen); cal.setPostTypeFilterOpen(false); cal.setStatusFilterOpen(false); }}
                    />
                    <PostTypeFilterDropdown
                        selectedPostTypes={cal.selectedPostTypes}
                        setSelectedPostTypes={cal.setSelectedPostTypes}
                        isOpen={cal.postTypeFilterOpen}
                        onToggle={() => { cal.setPostTypeFilterOpen(!cal.postTypeFilterOpen); cal.setPlatformFilterOpen(false); cal.setStatusFilterOpen(false); }}
                    />
                    <StatusFilterDropdown
                        selectedStatuses={cal.selectedStatuses}
                        setSelectedStatuses={cal.setSelectedStatuses}
                        isOpen={cal.statusFilterOpen}
                        onToggle={() => { cal.setStatusFilterOpen(!cal.statusFilterOpen); cal.setPlatformFilterOpen(false); cal.setPostTypeFilterOpen(false); }}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <CalendarSettingsPanel />
                    <Button variant="secondary" size="icon" onClick={cal.handleSync} disabled={cal.syncing} title="Sync external posts">
                        <RefreshCcw className={cn("h-4 w-4", cal.syncing && "animate-spin")} />
                    </Button>
                    <Button variant="secondary" onClick={() => cal.handleNewNote()}>
                        <Plus className="h-4 w-4" />
                        New Note
                    </Button>
                    <Button onClick={() => {
                        const composeUrl = cal.selectedPlatforms.length < PLATFORMS.length && cal.selectedPlatforms.length > 0
                            ? `/compose?platforms=${cal.selectedPlatforms.join(',')}`
                            : '/compose';
                        router.push(composeUrl);
                    }}>
                        <Plus className="h-4 w-4" />
                        New Post
                    </Button>
                </div>

            </div>

            {/* Calendar Content */}
            <div className="flex-1 overflow-auto p-8" onClick={cal.closeAllFilters}>
                {cal.loading ? (
                    <SkeletonCalendarGrid data-testid="calendar-skeleton" />
                ) : (
                    <div data-testid="calendar-grid">
                        {nav.viewMode === 'day' && (
                            <DayView date={nav.selectedDate} posts={cal.filteredPosts} notes={cal.visibleNotes} aiSlots={cal.aiSlots} dragState={cal.dragState} dragHandlers={cal.dragHandlers} onPostClick={cal.handlePostClick} onSlotClick={cal.handleSlotClick} onQuickAddClick={cal.handleQuickAddClick} onNoteClick={cal.handleNoteClick} holidays={cal.holidayMap[format(nav.selectedDate, 'yyyy-MM-dd')] || []} />
                        )}
                        {nav.viewMode === 'week' && (
                            <WeekView weekStart={nav.currentWeekStart} posts={cal.filteredPosts} notes={cal.visibleNotes} aiSlots={cal.aiSlots} dragState={cal.dragState} dragHandlers={cal.dragHandlers} onPostClick={cal.handlePostClick} onSlotClick={cal.handleSlotClick} onQuickAddClick={cal.handleQuickAddClick} onNoteClick={cal.handleNoteClick} />
                        )}
                        {nav.viewMode === 'month' && (
                            <MonthView monthStart={nav.currentMonthStart} posts={cal.filteredPosts} notes={cal.visibleNotes} dragState={cal.dragState} dragHandlers={cal.dragHandlers} onPostClick={cal.handlePostClick} onDayClick={(date) => cal.handleSlotClick(date)} onQuickAddClick={(date) => cal.handleQuickAddClick(date)} onNoteClick={cal.handleNoteClick} onNewNote={cal.handleNewNote} weekStartsOn={cal.calendarSettings.weekStartsOn} postPreview={cal.calendarSettings.postPreview} holidays={cal.holidayMap} />
                        )}
                        {nav.viewMode === 'timeline' && (
                            <TimelineView date={nav.selectedDate} posts={cal.filteredPosts} onPostClick={cal.handlePostClick} />
                        )}

                        {Object.keys(cal.filteredPosts).length === 0 && (
                            <ContextualEmptyState
                                type="calendar"
                                actions={[
                                    {
                                        label: 'Schedule a Post',
                                        onClick: () => {
                                            const composeUrl = cal.selectedPlatforms.length < PLATFORMS.length && cal.selectedPlatforms.length > 0
                                                ? `/compose?platforms=${cal.selectedPlatforms.join(',')}`
                                                : '/compose';
                                            router.push(composeUrl);
                                        },
                                        variant: 'primary',
                                    },
                                ]}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Post Preview Modal */}
            {cal.selectedPost && (
                <PostPreviewModal post={cal.selectedPost} isOpen={cal.isPreviewOpen} onClose={cal.handleClosePreview} onRefresh={cal.fetchPosts} />
            )}

            {/* Note Modal */}
            <NoteModal
                isOpen={cal.isNoteModalOpen}
                onClose={() => cal.setIsNoteModalOpen(false)}
                onSaved={cal.fetchPosts}
                defaultDate={cal.noteDefaultDate}
                note={cal.selectedNote}
            />

            {/* Quick Add Modal */}
            <QuickAddModal
                isOpen={cal.isQuickAddOpen}
                onClose={() => cal.setIsQuickAddOpen(false)}
                onSaved={cal.fetchPosts}
                defaultDate={cal.quickAddDate}
                selectedPlatforms={cal.selectedPlatforms}
            />
        </div>
    );
}
