/**
 * Calendar Mobile Component
 * Mobile-optimized calendar with agenda view and day strip
 * 
 * Why: Desktop calendar with complex grid is hard to use on mobile;
 * this provides a touch-friendly agenda-style layout
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    format, addDays, subDays, startOfWeek, isSameDay,
    startOfMonth, endOfMonth, eachDayOfInterval
} from 'date-fns';
import { Plus, ChevronLeft, ChevronRight, RefreshCcw, Calendar as CalendarIcon } from 'lucide-react';
import { MobileCard } from '@/components/mobile/mobile-card';
import { Button } from '@/components/ui/button';
import { triggerHaptic } from '@/hooks/use-haptic';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

interface CalendarPost {
    id: string;
    time: string;
    caption: string;
    platform: string;
    status: string;
    thumbnail: string | null;
    pillarColor: string | null;
    isExternal: boolean;
    externalUrl: string | null;
}

interface CalendarMobileProps {
    posts: Record<string, CalendarPost[]>;
    loading: boolean;
    onSync: () => Promise<void>;
    onRefresh: () => Promise<void>;
    onPostClick: (postId: string) => void;
    syncing: boolean;
}

const platformColors: Record<string, string> = {
    instagram: 'bg-pink-500',
    tiktok: 'bg-gray-900',
    youtube: 'bg-red-500',
    facebook: 'bg-blue-600',
    pinterest: 'bg-red-400',
    linkedin: 'bg-blue-700',
    bluesky: 'bg-sky-500',
};

export function CalendarMobile({
    posts,
    loading,
    onSync,
    onRefresh,
    onPostClick,
    syncing,
}: CalendarMobileProps) {
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [viewMode, setViewMode] = useState<'agenda' | 'month'>('agenda');
    // Pull-to-refresh
    const { containerRef, isRefreshing, pullProgress, pullDistance, canRefresh } = usePullToRefresh({
        onRefresh: async () => {
            await onRefresh();
        },
    });

    /**
     * Get posts for the selected date
     */
    const getPostsForDate = useCallback((date: Date): CalendarPost[] => {
        const dateKey = format(date, 'yyyy-MM-dd');
        return posts[dateKey] || [];
    }, [posts]);

    /**
     * Navigate to compose page with pre-filled date
     */
    const handleCreatePost = useCallback(() => {
        triggerHaptic('medium');
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        router.push(`/compose?date=${dateStr}`);
    }, [selectedDate, router]);

    /**
     * Handle date selection from day strip or month view
     */
    const handleDateSelect = useCallback((date: Date) => {
        triggerHaptic('light');
        setSelectedDate(date);
        if (viewMode === 'month') {
            setViewMode('agenda');
        }
    }, [viewMode]);

    /**
     * Navigate to previous/next day
     */
    const goToPreviousDay = useCallback(() => {
        triggerHaptic('light');
        setSelectedDate(prev => subDays(prev, 1));
    }, []);

    const goToNextDay = useCallback(() => {
        triggerHaptic('light');
        setSelectedDate(prev => addDays(prev, 1));
    }, []);

    const goToToday = useCallback(() => {
        triggerHaptic('medium');
        setSelectedDate(new Date());
    }, []);

    const selectedDayPosts = getPostsForDate(selectedDate);

    return (
        <div
            ref={containerRef}
            className="flex flex-col min-h-screen bg-[var(--bg-primary)]"
        >
            {/* Pull to Refresh Indicator */}
            {pullDistance > 0 && (
                <div
                    className="flex items-center justify-center py-4 text-[var(--text-muted)]"
                    style={{ height: pullDistance }}
                >
                    <RefreshCcw className={cn(
                        'h-5 w-5 transition-transform',
                        isRefreshing && 'animate-spin'
                    )} />
                </div>
            )}

            {/* Header */}
            <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-secondary)]/95 backdrop-blur-lg">
                {/* Title & View Toggle */}
                <div className="flex items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-semibold">Calendar</h1>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                triggerHaptic('light');
                                setViewMode(viewMode === 'agenda' ? 'month' : 'agenda');
                            }}
                            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                        >
                            <CalendarIcon className="h-5 w-5" />
                        </button>
                        <button
                            onClick={async () => {
                                triggerHaptic('light');
                                await onSync();
                            }}
                            disabled={syncing}
                            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                        >
                            <RefreshCcw className={cn('h-5 w-5', syncing && 'animate-spin')} />
                        </button>
                    </div>
                </div>

                {/* Day Strip (Agenda View) */}
                {viewMode === 'agenda' && (
                    <DayStrip
                        selectedDate={selectedDate}
                        onDateSelect={handleDateSelect}
                        posts={posts}
                    />
                )}

                {/* Month Header (Month View) */}
                {viewMode === 'month' && (
                    <MonthHeader
                        selectedDate={selectedDate}
                        onPrevMonth={() => {
                            triggerHaptic('light');
                            setSelectedDate(prev => subDays(startOfMonth(prev), 1));
                        }}
                        onNextMonth={() => {
                            triggerHaptic('light');
                            const nextMonth = new Date(selectedDate);
                            nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
                            setSelectedDate(nextMonth);
                        }}
                        onToday={goToToday}
                    />
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto">
                {viewMode === 'agenda' ? (
                    <AgendaView
                        selectedDate={selectedDate}
                        posts={selectedDayPosts}
                        loading={loading}
                        onPostClick={onPostClick}
                        onPrevDay={goToPreviousDay}
                        onNextDay={goToNextDay}
                    />
                ) : (
                    <MonthGridView
                        selectedDate={selectedDate}
                        posts={posts}
                        onDateSelect={handleDateSelect}
                    />
                )}
            </div>

            {/* FAB for creating new post */}
            <button
                onClick={handleCreatePost}
                className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient shadow-lg active:scale-95 transition-transform"
                style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 8px) + 16px)' }}
            >
                <Plus className="h-6 w-6 text-white" />
            </button>
        </div>
    );
}

// ============================================================================
// Day Strip Component - Horizontal scrollable day selector
// ============================================================================
interface DayStripProps {
    selectedDate: Date;
    onDateSelect: (date: Date) => void;
    posts: Record<string, CalendarPost[]>;
}

function DayStrip({ selectedDate, onDateSelect, posts }: DayStripProps) {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i - 3));

    /**
     * Check if a day has posts
     */
    const hasPostsOnDay = (date: Date): boolean => {
        const dateKey = format(date, 'yyyy-MM-dd');
        return (posts[dateKey]?.length || 0) > 0;
    };

    return (
        <div className="flex gap-1 overflow-x-auto px-4 pb-3 scrollbar-hide">
            {days.map((day) => {
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const hasPosts = hasPostsOnDay(day);

                return (
                    <button
                        key={day.toISOString()}
                        onClick={() => onDateSelect(day)}
                        className={cn(
                            'flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[52px] transition-colors',
                            isSelected
                                ? 'bg-gradient text-white'
                                : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                        )}
                    >
                        <span className="text-[10px] font-medium">
                            {format(day, 'EEE')}
                        </span>
                        <span className={cn(
                            'mt-0.5 text-lg font-semibold',
                            isToday && !isSelected && 'text-[var(--accent-gold)]'
                        )}>
                            {format(day, 'd')}
                        </span>
                        {hasPosts && !isSelected && (
                            <span className="mt-1 h-1 w-1 rounded-full bg-[var(--accent-gold)]" />
                        )}
                        {isSelected && hasPosts && (
                            <span className="mt-1 h-1 w-1 rounded-full bg-white/50" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ============================================================================
// Agenda View - List of posts for selected day
// ============================================================================
interface AgendaViewProps {
    selectedDate: Date;
    posts: CalendarPost[];
    loading: boolean;
    onPostClick: (postId: string) => void;
    onPrevDay: () => void;
    onNextDay: () => void;
}

function AgendaView({ selectedDate, posts, loading, onPostClick, onPrevDay, onNextDay }: AgendaViewProps) {
    const router = useRouter();

    if (loading) {
        return (
            <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse rounded-xl bg-[var(--bg-secondary)] h-20" />
                ))}
            </div>
        );
    }

    return (
        <div className="p-4">
            {/* Date Header */}
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={onPrevDay}
                    className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="text-center">
                    <p className="text-sm font-medium">
                        {format(selectedDate, 'EEEE')}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                        {format(selectedDate, 'MMMM d, yyyy')}
                    </p>
                </div>
                <button
                    onClick={onNextDay}
                    className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                >
                    <ChevronRight className="h-5 w-5" />
                </button>
            </div>

            {/* Posts List */}
            {posts.length > 0 ? (
                <div className="space-y-3">
                    {posts.map(post => (
                        <MobilePostCard
                            key={post.id}
                            post={post}
                            onClick={() => {
                                triggerHaptic('light');
                                onPostClick(post.id);
                            }}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-12">
                    <CalendarIcon className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-3" />
                    <p className="text-[var(--text-muted)] mb-1">No posts scheduled</p>
                    <p className="text-sm text-[var(--text-muted)] mb-4">
                        Tap + to create a post for this day
                    </p>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Mobile Post Card
// ============================================================================
interface MobilePostCardProps {
    post: CalendarPost;
    onClick: () => void;
}

function MobilePostCard({ post, onClick }: MobilePostCardProps) {
    const time = new Date(post.time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });

    const statusColors: Record<string, string> = {
        published: 'text-green-500',
        scheduled: 'text-blue-500',
        draft: 'text-gray-400',
        failed: 'text-red-500',
    };

    return (
        <MobileCard
            interactive
            onClick={onClick}
            className="flex gap-3"
        >
            {/* Thumbnail */}
            {post.thumbnail ? (
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                    <Image
                        src={post.thumbnail}
                        alt=""
                        fill
                        className="object-cover"
                    />
                </div>
            ) : (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                    <CalendarIcon className="h-6 w-6 text-[var(--text-muted)]" />
                </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    {/* Platform Badge */}
                    <span className={cn(
                        'h-4 w-4 rounded-full flex-shrink-0',
                        platformColors[post.platform.toLowerCase()] || 'bg-gray-500'
                    )} />
                    <span className="text-xs text-[var(--text-muted)]">{time}</span>
                    <span className={cn('text-xs capitalize', statusColors[post.status.toLowerCase()] || 'text-gray-400')}>
                        {post.status.toLowerCase()}
                    </span>
                </div>
                <p className="text-sm font-medium truncate">
                    {post.caption.slice(0, 60) || 'No caption'}
                </p>
                {post.isExternal && (
                    <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded mt-1 inline-block">
                        Synced
                    </span>
                )}
            </div>

            {/* Chevron */}
            <div className="flex items-center">
                <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
            </div>
        </MobileCard>
    );
}

// ============================================================================
// Month Header
// ============================================================================
interface MonthHeaderProps {
    selectedDate: Date;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onToday: () => void;
}

function MonthHeader({ selectedDate, onPrevMonth, onNextMonth, onToday }: MonthHeaderProps) {
    return (
        <div className="flex items-center justify-between px-4 pb-3">
            <button
                onClick={onPrevMonth}
                className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
            >
                <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={onToday} className="text-center">
                <p className="text-base font-medium">
                    {format(selectedDate, 'MMMM yyyy')}
                </p>
            </button>
            <button
                onClick={onNextMonth}
                className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
            >
                <ChevronRight className="h-5 w-5" />
            </button>
        </div>
    );
}

// ============================================================================
// Month Grid View
// ============================================================================
interface MonthGridViewProps {
    selectedDate: Date;
    posts: Record<string, CalendarPost[]>;
    onDateSelect: (date: Date) => void;
}

function MonthGridView({ selectedDate, posts, onDateSelect }: MonthGridViewProps) {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: addDays(monthEnd, 6 - monthEnd.getDay()) });

    const hasPostsOnDay = (date: Date): number => {
        const dateKey = format(date, 'yyyy-MM-dd');
        return posts[dateKey]?.length || 0;
    };

    return (
        <div className="p-4">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                    <div key={i} className="text-center text-xs font-medium text-[var(--text-muted)] py-2">
                        {day}
                    </div>
                ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                    const isCurrentMonth = day.getMonth() === selectedDate.getMonth();
                    const isToday = isSameDay(day, new Date());
                    const isSelected = isSameDay(day, selectedDate);
                    const postCount = hasPostsOnDay(day);

                    return (
                        <button
                            key={day.toISOString()}
                            onClick={() => onDateSelect(day)}
                            className={cn(
                                'aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-colors relative',
                                isSelected
                                    ? 'bg-gradient text-white'
                                    : isCurrentMonth
                                        ? 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                                        : 'text-[var(--text-muted)] opacity-50'
                            )}
                        >
                            <span className={cn(
                                'font-medium',
                                isToday && !isSelected && 'text-[var(--accent-gold)]'
                            )}>
                                {format(day, 'd')}
                            </span>
                            {postCount > 0 && (
                                <div className="flex gap-0.5 mt-0.5">
                                    {Array.from({ length: Math.min(postCount, 3) }).map((_, i) => (
                                        <span
                                            key={i}
                                            className={cn(
                                                'h-1 w-1 rounded-full',
                                                isSelected ? 'bg-white/60' : 'bg-[var(--accent-gold)]'
                                            )}
                                        />
                                    ))}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
