/**
 * Calendar page with Day/Week/Month views and platform filtering
 * Displays scheduled posts by platform with real data
 * 
 * Features:
 * - Click-to-create posts in any view
 * - AI-recommended time slot indicators
 * - Drag & drop rescheduling with visual feedback
 * - Mobile-optimized agenda view
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Filter, ChevronLeft, ChevronRight, Check, RefreshCcw, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { SkeletonCalendarGrid } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDragDropCalendar } from '@/hooks/use-drag-drop-calendar';
import { useAiRecommendedSlots } from '@/hooks/use-ai-recommended-slots';
import { useWorkspace } from '@/hooks/use-workspace';
import { useCalendarNavigation } from '@/hooks/use-calendar-navigation';
import { PostPreviewModal } from '@/components/calendar/post-preview-modal';
import { useIsMobile } from '@/hooks/use-mobile';
import { CalendarMobile } from './calendar-mobile';

// Extracted view components
import { DayView } from '@/components/calendar/day-view';
import { WeekView } from '@/components/calendar/week-view';
import { MonthView } from '@/components/calendar/month-view';
import { type CalendarPost, PLATFORMS, platformLabels, type Platform } from '@/components/calendar/calendar-types';

export default function CalendarPage() {
    const router = useRouter();
    const isMobile = useIsMobile();
    const { organization } = useWorkspace();

    // Navigation state from hook
    const nav = useCalendarNavigation();

    // Data state
    const [posts, setPosts] = useState<Record<string, CalendarPost[]>>({});
    const [loading, setLoading] = useState(true);
    const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([...PLATFORMS]);
    const [filterOpen, setFilterOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [regeneratingAi, setRegeneratingAi] = useState(false);

    // Post preview modal state
    const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    // AI Recommended Slots
    const { slots: aiSlots } = useAiRecommendedSlots(nav.currentWeekStart, organization?.id || '');

    // Drag & Drop functionality
    const { dragState, handlers: dragHandlers } = useDragDropCalendar({
        onDrop: async (postId, newDate) => {
            try {
                const response = await fetch(`/api/posts/${postId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'reschedule',
                        scheduledAt: newDate.toISOString(),
                    }),
                });
                if (!response.ok) throw new Error('Failed to reschedule');
                fetchPosts();
            } catch (error) {
                console.error('Failed to reschedule post:', error);
            }
        },
    });

    /**
     * Navigate to compose page with pre-filled date/time
     */
    const handleSlotClick = useCallback((date: Date, hour?: number, platform?: string) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const timeStr = hour !== undefined ? `${hour.toString().padStart(2, '0')}:00` : undefined;
        const params = new URLSearchParams({ date: dateStr });
        if (timeStr) params.set('time', timeStr);
        if (platform) params.set('platform', platform);
        router.push(`/compose?${params}`);
    }, [router]);

    /**
     * Handle post click with status-based routing
     */
    const handlePostClick = useCallback(async (postId: string) => {
        for (const dayPosts of Object.values(posts)) {
            const found = dayPosts.find(p => p.id === postId);
            if (found) {
                const status = found.status.toLowerCase();

                if (status === 'published' || found.isExternal) {
                    try {
                        const response = await fetch(`/api/posts/${found.id}`);
                        if (response.ok) {
                            const postData = await response.json();
                            const postWithAnalytics: CalendarPost = {
                                ...found,
                                analytics: postData.analytics || null,
                                isVideo: postData.media?.some((m: { type: string }) => m.type === 'video') || false,
                            };
                            setSelectedPost(postWithAnalytics);
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
                return;
            }
        }
    }, [posts, router]);

    const handleClosePreview = useCallback(() => {
        setIsPreviewOpen(false);
        setSelectedPost(null);
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            await fetch('/api/posts/sync', { method: 'POST' });
            await fetchPosts();
        } catch (error) {
            console.error('Sync failed:', error);
        } finally {
            setSyncing(false);
        }
    };

    /**
     * Regenerate AI drafts - clears existing and creates fresh recommendations
     */
    const handleRegenerateAiDrafts = async () => {
        setRegeneratingAi(true);
        try {
            const response = await fetch('/api/ai/scheduling/generate-drafts?force=true', {
                method: 'POST'
            });
            const result = await response.json();
            if (result.success) {
                console.log(`AI Drafts: Deleted ${result.deleted}, Created ${result.created}`);
                await fetchPosts();
            }
        } catch (error) {
            console.error('Failed to regenerate AI drafts:', error);
        } finally {
            setRegeneratingAi(false);
        }
    };

    // Track fetch state to prevent concurrent fetches and infinite loops
    const [_fetchError, setFetchError] = useState(false);
    const isFetchingRef = useRef(false);

    // Extract stable values from nav to prevent callback recreation on every render
    const { viewMode, selectedDate, currentWeekStart, currentMonthStart } = nav;

    const fetchPosts = useCallback(async () => {
        // Prevent concurrent fetches
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        setLoading(true);
        setFetchError(false);

        // Calculate date range inline using extracted stable values
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
            default:
                const monthStart = new Date(currentMonthStart);
                monthStart.setDate(1);
                const monthEnd = new Date(currentMonthStart);
                monthEnd.setMonth(monthEnd.getMonth() + 1);
                monthEnd.setDate(0);
                // Extend to full weeks for calendar grid
                const firstDayOfWeek = monthStart.getDay() || 7; // Monday = 1
                start = new Date(monthStart);
                start.setDate(start.getDate() - firstDayOfWeek + 1);
                const lastDayOfWeek = monthEnd.getDay() || 7;
                end = new Date(monthEnd);
                end.setDate(end.getDate() + (7 - lastDayOfWeek));
                end.setHours(23, 59, 59, 999);
                break;
        }

        try {
            const params = new URLSearchParams({
                start: start.toISOString(),
                end: end.toISOString()
            });
            const response = await fetch(`/api/calendar?${params}`);

            // Handle rate limiting gracefully - don't retry
            if (response.status === 429) {
                console.warn('Calendar API rate limited, will retry on next navigation');
                setFetchError(true);
                return;
            }

            if (!response.ok) throw new Error('Failed to fetch calendar');
            const data = await response.json();
            setPosts(data.posts);
        } catch (error) {
            console.error('Error fetching calendar:', error);
            setFetchError(true);
        } finally {
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, [viewMode, selectedDate, currentWeekStart, currentMonthStart]);

    // Fetch on mount and when view/date changes (stable dependencies)
    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // Filter posts by selected platforms
    const filteredPosts = useMemo(() => {
        if (selectedPlatforms.length === PLATFORMS.length) return posts;

        const filtered: Record<string, CalendarPost[]> = {};
        for (const [date, dayPosts] of Object.entries(posts)) {
            const platformFiltered = dayPosts.filter(post =>
                selectedPlatforms.includes(post.platform as Platform)
            );
            if (platformFiltered.length > 0) {
                filtered[date] = platformFiltered;
            }
        }
        return filtered;
    }, [posts, selectedPlatforms]);

    const togglePlatform = (platform: Platform) => {
        setSelectedPlatforms(prev =>
            prev.includes(platform)
                ? prev.filter(p => p !== platform)
                : [...prev, platform]
        );
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
                <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-muted)]">{nav.getHeaderText()}</span>
                </div>
            </header>

            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-4">
                <div className="flex items-center gap-3">
                    {/* Navigation */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={nav.goToPrevious}
                            className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                            data-testid="calendar-prev"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <Button variant="secondary" onClick={nav.goToToday}>
                            Today
                        </Button>
                        <button
                            onClick={nav.goToNext}
                            className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                            data-testid="calendar-next"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    {/* View Tabs */}
                    <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-1">
                        <button
                            onClick={() => nav.setViewMode('day')}
                            data-testid="view-day"
                            className={`rounded-md px-4 py-2 text-sm ${nav.viewMode === 'day' ? 'bg-[var(--bg-secondary)] font-medium shadow-sm' : 'text-[var(--text-muted)]'}`}
                        >
                            Day
                        </button>
                        <button
                            onClick={() => nav.setViewMode('week')}
                            data-testid="view-week"
                            className={`rounded-md px-4 py-2 text-sm ${nav.viewMode === 'week' ? 'bg-[var(--bg-secondary)] font-medium shadow-sm' : 'text-[var(--text-muted)]'}`}
                        >
                            Week
                        </button>
                        <button
                            onClick={() => nav.setViewMode('month')}
                            data-testid="view-month"
                            className={`rounded-md px-4 py-2 text-sm ${nav.viewMode === 'month' ? 'bg-[var(--bg-secondary)] font-medium shadow-sm' : 'text-[var(--text-muted)]'}`}
                        >
                            Month
                        </button>
                    </div>

                    {/* Platform Filter */}
                    <div className="relative">
                        <button
                            onClick={() => setFilterOpen(!filterOpen)}
                            data-testid="platform-filter"
                            className={cn(
                                "flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm",
                                selectedPlatforms.length < PLATFORMS.length && "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                            )}
                        >
                            <Filter className="h-4 w-4" />
                            Platform
                            {selectedPlatforms.length < PLATFORMS.length && (
                                <span className="ml-1 rounded-full bg-[var(--accent-gold)] px-1.5 text-xs text-white">
                                    {selectedPlatforms.length}
                                </span>
                            )}
                        </button>

                        {filterOpen && (
                            <div className="absolute top-full left-0 mt-2 z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-2 shadow-lg">
                                {PLATFORMS.map(platform => (
                                    <button
                                        key={platform}
                                        onClick={() => togglePlatform(platform)}
                                        data-testid={`filter-${platform}`}
                                        className="flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--bg-tertiary)]"
                                    >
                                        <div className={cn(
                                            "h-4 w-4 rounded border flex items-center justify-center",
                                            selectedPlatforms.includes(platform)
                                                ? "bg-[var(--accent-gold)] border-[var(--accent-gold)]"
                                                : "border-[var(--border)]"
                                        )}>
                                            {selectedPlatforms.includes(platform) && (
                                                <Check className="h-3 w-3 text-white" />
                                            )}
                                        </div>
                                        {platformLabels[platform]}
                                    </button>
                                ))}
                                <div className="border-t border-[var(--border)] mt-2 pt-2 px-4">
                                    <button
                                        onClick={() => setSelectedPlatforms([...PLATFORMS])}
                                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    >
                                        Select All
                                    </button>
                                    <span className="mx-2 text-[var(--text-muted)]">·</span>
                                    <button
                                        onClick={() => setSelectedPlatforms([])}
                                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleRegenerateAiDrafts}
                        disabled={regeneratingAi}
                        title="Regenerate AI draft suggestions"
                    >
                        <Sparkles className={cn("h-4 w-4", regeneratingAi && "animate-pulse")} />
                    </Button>
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleSync}
                        disabled={syncing}
                        title="Sync external posts"
                    >
                        <RefreshCcw className={cn("h-4 w-4", syncing && "animate-spin")} />
                    </Button>
                    <Button onClick={() => router.push('/compose')}>
                        <Plus className="h-4 w-4" />
                        New Post
                    </Button>
                </div>
            </div>

            {/* Calendar Content */}
            <div className="flex-1 overflow-auto p-8" onClick={() => filterOpen && setFilterOpen(false)}>
                {loading ? (
                    <SkeletonCalendarGrid data-testid="calendar-skeleton" />
                ) : (
                    <div data-testid="calendar-grid">
                        {nav.viewMode === 'day' && (
                            <DayView
                                date={nav.selectedDate}
                                posts={filteredPosts}
                                aiSlots={aiSlots}
                                dragState={dragState}
                                dragHandlers={dragHandlers}
                                onPostClick={handlePostClick}
                                onSlotClick={handleSlotClick}
                            />
                        )}
                        {nav.viewMode === 'week' && (
                            <WeekView
                                weekStart={nav.currentWeekStart}
                                posts={filteredPosts}
                                aiSlots={aiSlots}
                                dragState={dragState}
                                dragHandlers={dragHandlers}
                                onPostClick={handlePostClick}
                                onSlotClick={handleSlotClick}
                            />
                        )}
                        {nav.viewMode === 'month' && (
                            <MonthView
                                monthStart={nav.currentMonthStart}
                                posts={filteredPosts}
                                onPostClick={handlePostClick}
                                onDayClick={(date) => handleSlotClick(date)}
                            />
                        )}

                        {/* Empty state */}
                        {Object.keys(filteredPosts).length === 0 && (
                            <div className="text-center py-8 text-[var(--text-muted)]">
                                <p>No scheduled posts {nav.viewMode === 'day' ? 'today' : nav.viewMode === 'week' ? 'this week' : 'this month'}</p>
                                <Button className="mt-4" onClick={() => router.push('/compose')}>
                                    <Plus className="h-4 w-4" />
                                    Schedule Your First Post
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Post Preview Modal */}
            {selectedPost && (
                <PostPreviewModal
                    post={selectedPost}
                    isOpen={isPreviewOpen}
                    onClose={handleClosePreview}
                    onRefresh={fetchPosts}
                />
            )}
        </div>
    );
}
