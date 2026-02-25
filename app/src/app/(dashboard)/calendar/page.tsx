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
 * Why: All state, data fetching, filtering, and action logic is in
 * useCalendarOrchestration — this file is JSX layout only.
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

const DayView = dynamic(() => import('@/components/calendar/day-view').then(m => ({ default: m.DayView })), { ssr: false });
const WeekView = dynamic(() => import('@/components/calendar/week-view').then(m => ({ default: m.WeekView })), { ssr: false });
const MonthView = dynamic(() => import('@/components/calendar/month-view').then(m => ({ default: m.MonthView })), { ssr: false });
const TimelineView = dynamic(() => import('@/components/calendar/timeline-view').then(m => ({ default: m.TimelineView })), { ssr: false });
const CalendarMobile = dynamic(() => import('./calendar-mobile').then(m => ({ default: m.CalendarMobile })), { ssr: false });
const PostPreviewModal = dynamic(() => import('@/components/calendar/post-preview-modal').then(m => ({ default: m.PostPreviewModal })), { ssr: false });
const NoteModal = dynamic(() => import('@/components/calendar/note-modal').then(m => ({ default: m.NoteModal })), { ssr: false });
const QuickAddModal = dynamic(() => import('@/components/calendar/quick-add-modal').then(m => ({ default: m.QuickAddModal })), { ssr: false });

export default function CalendarPage() {
    const isMobile = useIsMobile();
    const cal = useCalendarOrchestration();
    const { nav, router } = cal;

    // Mobile layout
    if (isMobile) {
        return (
            <CalendarMobile
                posts={cal.filteredPosts}
                loading={cal.loading}
                onSync={cal.handleSync}
                onRefresh={cal.fetchPosts}
                onPostClick={cal.handlePostClick}
                syncing={cal.syncing}
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
