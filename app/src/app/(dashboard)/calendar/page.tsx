/**
 * Calendar page with Day/Week/Month views and platform filtering
 * Displays scheduled posts by platform with real data
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Filter, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import {
    startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    addDays, addWeeks, addMonths, subDays, subMonths,
    format, isSameDay, isSameMonth, startOfDay, endOfDay,
    getDay, eachDayOfInterval
} from 'date-fns';
import { SkeletonCalendarGrid } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CalendarPost {
    id: string;
    time: string;
    caption: string;
    platform: string;
    status: string;
    thumbnail: string | null;
    pillarColor: string | null;
}

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'pinterest'] as const;
type Platform = (typeof PLATFORMS)[number];

const platformColors: Record<string, string> = {
    instagram: 'border-l-pink-500',
    tiktok: 'border-l-gray-900',
    youtube: 'border-l-red-500',
    facebook: 'border-l-blue-500',
    pinterest: 'border-l-red-400',
};

const platformLabels: Record<Platform, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    facebook: 'Facebook',
    pinterest: 'Pinterest',
};

export default function CalendarPage() {
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [currentMonthStart, setCurrentMonthStart] = useState(() => startOfMonth(new Date()));
    const [posts, setPosts] = useState<Record<string, CalendarPost[]>>({});
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
    const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([...PLATFORMS]);
    const [filterOpen, setFilterOpen] = useState(false);

    /**
     * Calculate date range based on current view mode
     */
    const getDateRange = useCallback(() => {
        switch (viewMode) {
            case 'day':
                return { start: startOfDay(selectedDate), end: endOfDay(selectedDate) };
            case 'week':
                return { start: currentWeekStart, end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }) };
            case 'month': {
                // Get first visible day (may be from previous month) and last visible day
                const monthStart = startOfMonth(currentMonthStart);
                const monthEnd = endOfMonth(currentMonthStart);
                const firstVisible = startOfWeek(monthStart, { weekStartsOn: 1 });
                const lastVisible = endOfWeek(monthEnd, { weekStartsOn: 1 });
                return { start: firstVisible, end: lastVisible };
            }
        }
    }, [viewMode, selectedDate, currentWeekStart, currentMonthStart]);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        const { start, end } = getDateRange();

        try {
            const params = new URLSearchParams({
                start: start.toISOString(),
                end: end.toISOString()
            });
            const response = await fetch(`/api/calendar?${params}`);
            if (!response.ok) throw new Error('Failed to fetch calendar');
            const data = await response.json();
            setPosts(data.posts);
        } catch (error) {
            console.error('Error fetching calendar:', error);
        } finally {
            setLoading(false);
        }
    }, [getDateRange]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // Navigation functions
    const goToPreviousDay = () => setSelectedDate(prev => subDays(prev, 1));
    const goToNextDay = () => setSelectedDate(prev => addDays(prev, 1));
    const goToPreviousWeek = () => setCurrentWeekStart(prev => addDays(prev, -7));
    const goToNextWeek = () => setCurrentWeekStart(prev => addDays(prev, 7));
    const goToPreviousMonth = () => setCurrentMonthStart(prev => subMonths(prev, 1));
    const goToNextMonth = () => setCurrentMonthStart(prev => addMonths(prev, 1));

    const goToToday = () => {
        const today = new Date();
        setSelectedDate(today);
        setCurrentWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
        setCurrentMonthStart(startOfMonth(today));
    };

    const goToPrevious = viewMode === 'day' ? goToPreviousDay : viewMode === 'week' ? goToPreviousWeek : goToPreviousMonth;
    const goToNext = viewMode === 'day' ? goToNextDay : viewMode === 'week' ? goToNextWeek : goToNextMonth;

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

    // Header text based on view mode
    const getHeaderText = () => {
        switch (viewMode) {
            case 'day':
                return format(selectedDate, 'EEEE, MMMM d, yyyy');
            case 'week':
                return `${format(currentWeekStart, 'MMM d')} - ${format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}`;
            case 'month':
                return format(currentMonthStart, 'MMMM yyyy');
        }
    };

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <h1 className="text-2xl font-semibold">Calendar</h1>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-muted)]">{getHeaderText()}</span>
                </div>
            </header>

            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-4">
                <div className="flex items-center gap-3">
                    {/* Navigation */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={goToPrevious}
                            className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                            data-testid="calendar-prev"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <Button variant="secondary" onClick={goToToday}>
                            Today
                        </Button>
                        <button
                            onClick={goToNext}
                            className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                            data-testid="calendar-next"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    {/* View Tabs */}
                    <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-1">
                        <button
                            onClick={() => setViewMode('day')}
                            data-testid="view-day"
                            className={`rounded-md px-4 py-2 text-sm ${viewMode === 'day' ? 'bg-[var(--bg-secondary)] font-medium shadow-sm' : 'text-[var(--text-muted)]'}`}
                        >
                            Day
                        </button>
                        <button
                            onClick={() => setViewMode('week')}
                            data-testid="view-week"
                            className={`rounded-md px-4 py-2 text-sm ${viewMode === 'week' ? 'bg-[var(--bg-secondary)] font-medium shadow-sm' : 'text-[var(--text-muted)]'}`}
                        >
                            Week
                        </button>
                        <button
                            onClick={() => setViewMode('month')}
                            data-testid="view-month"
                            className={`rounded-md px-4 py-2 text-sm ${viewMode === 'month' ? 'bg-[var(--bg-secondary)] font-medium shadow-sm' : 'text-[var(--text-muted)]'}`}
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

                <Button onClick={() => router.push('/compose')}>
                    <Plus className="h-4 w-4" />
                    New Post
                </Button>
            </div>

            {/* Calendar Content */}
            <div className="flex-1 overflow-auto p-8" onClick={() => filterOpen && setFilterOpen(false)}>
                {loading ? (
                    <SkeletonCalendarGrid data-testid="calendar-skeleton" />
                ) : (
                    <div data-testid="calendar-grid">
                        {viewMode === 'day' && (
                            <DayView
                                date={selectedDate}
                                posts={filteredPosts}
                                platformColors={platformColors}
                                onPostClick={(id) => router.push(`/compose?edit=${id}`)}
                            />
                        )}
                        {viewMode === 'week' && (
                            <WeekView
                                weekStart={currentWeekStart}
                                posts={filteredPosts}
                                platformColors={platformColors}
                                onPostClick={(id) => router.push(`/compose?edit=${id}`)}
                            />
                        )}
                        {viewMode === 'month' && (
                            <MonthView
                                monthStart={currentMonthStart}
                                posts={filteredPosts}
                                platformColors={platformColors}
                                onPostClick={(id) => router.push(`/compose?edit=${id}`)}
                                onDayClick={(date) => {
                                    setSelectedDate(date);
                                    setViewMode('day');
                                }}
                            />
                        )}

                        {/* Empty state */}
                        {Object.keys(filteredPosts).length === 0 && (
                            <div className="text-center py-8 text-[var(--text-muted)]">
                                <p>No scheduled posts {viewMode === 'day' ? 'today' : viewMode === 'week' ? 'this week' : 'this month'}</p>
                                <Button className="mt-4" onClick={() => router.push('/compose')}>
                                    <Plus className="h-4 w-4" />
                                    Schedule Your First Post
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Day View Component
// ============================================================================
interface DayViewProps {
    date: Date;
    posts: Record<string, CalendarPost[]>;
    platformColors: Record<string, string>;
    onPostClick: (id: string) => void;
}

function DayView({ date, posts, platformColors, onPostClick }: DayViewProps) {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayPosts = posts[dateKey] || [];

    // Generate hourly slots from 6 AM to 11 PM
    const hourSlots = Array.from({ length: 18 }, (_, i) => i + 6);

    const getPostsForHour = (hour: number) => {
        return dayPosts.filter(post => {
            const match = post.time.match(/(\d+):?(\d*)\s*(AM|PM)/i);
            if (!match) return false;

            let postHour = parseInt(match[1]);
            const isPM = match[3].toUpperCase() === 'PM';
            if (isPM && postHour !== 12) postHour += 12;
            if (!isPM && postHour === 12) postHour = 0;

            return postHour === hour;
        });
    };

    return (
        <div className="card overflow-hidden" data-testid="calendar-day-view">
            {hourSlots.map(hour => {
                const hourPosts = getPostsForHour(hour);
                const timeLabel = format(new Date().setHours(hour, 0, 0, 0), 'h a');

                return (
                    <div key={hour} className="grid grid-cols-[80px_1fr] border-b border-[var(--border)] last:border-0">
                        <div className="bg-[var(--bg-tertiary)] p-4 text-right text-sm font-medium text-[var(--text-muted)]">
                            {timeLabel}
                        </div>
                        <div className="min-h-[60px] p-2">
                            {hourPosts.map(post => (
                                <PostCard
                                    key={post.id}
                                    post={post}
                                    platformColors={platformColors}
                                    onClick={() => onPostClick(post.id)}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ============================================================================
// Week View Component
// ============================================================================
interface WeekViewProps {
    weekStart: Date;
    posts: Record<string, CalendarPost[]>;
    platformColors: Record<string, string>;
    onPostClick: (id: string) => void;
}

function WeekView({ weekStart, posts, platformColors, onPostClick }: WeekViewProps) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const timeSlots = ['9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];

    const hourRanges: Record<string, [number, number]> = {
        '9 AM': [6, 11],
        '12 PM': [11, 14],
        '3 PM': [14, 17],
        '6 PM': [17, 20],
        '9 PM': [20, 24],
    };

    const getPostsForSlot = (date: Date, timeSlot: string): CalendarPost[] => {
        const dateKey = format(date, 'yyyy-MM-dd');
        const dayPosts = posts[dateKey] || [];
        const [startHour, endHour] = hourRanges[timeSlot] || [0, 24];

        return dayPosts.filter(post => {
            const match = post.time.match(/(\d+):?(\d*)\s*(AM|PM)/i);
            if (!match) return false;

            let hour = parseInt(match[1]);
            const isPM = match[3].toUpperCase() === 'PM';
            if (isPM && hour !== 12) hour += 12;
            if (!isPM && hour === 12) hour = 0;

            return hour >= startHour && hour < endHour;
        });
    };

    return (
        <div className="card overflow-hidden" data-testid="calendar-week-view">
            {/* Header Row */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)]">
                <div className="p-4" />
                {days.map((day) => {
                    const isToday = isSameDay(day, new Date());
                    return (
                        <div key={day.toISOString()} className="p-4 text-center" data-testid="calendar-day">
                            <p className="text-xs font-medium text-[var(--text-muted)]">
                                {format(day, 'EEE')}
                            </p>
                            <p className={cn("mt-1 text-xl font-semibold", isToday && "inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient text-white")}>
                                {format(day, 'd')}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* Grid */}
            {timeSlots.map((time) => (
                <div key={time} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)] last:border-0">
                    <div className="bg-[var(--bg-tertiary)] p-3 text-right text-xs font-medium text-[var(--text-muted)]">
                        {time}
                    </div>
                    {days.map((day) => {
                        const slotPosts = getPostsForSlot(day, time);
                        return (
                            <div key={`${day.toISOString()}-${time}`} className="min-h-[100px] border-l border-[var(--border)] p-2">
                                {slotPosts.map((post) => (
                                    <PostCard
                                        key={post.id}
                                        post={post}
                                        platformColors={platformColors}
                                        onClick={() => onPostClick(post.id)}
                                        compact
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// Month View Component
// ============================================================================
interface MonthViewProps {
    monthStart: Date;
    posts: Record<string, CalendarPost[]>;
    platformColors: Record<string, string>;
    onPostClick: (id: string) => void;
    onDayClick: (date: Date) => void;
}

function MonthView({ monthStart, posts, platformColors, onPostClick, onDayClick }: MonthViewProps) {
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
        weeks.push(calendarDays.slice(i, i + 7));
    }

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="card overflow-hidden" data-testid="calendar-month-view">
            {/* Day names header */}
            <div className="grid grid-cols-7 border-b border-[var(--border)]">
                {dayNames.map(day => (
                    <div key={day} className="p-3 text-center text-xs font-medium text-[var(--text-muted)]">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
            {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="grid grid-cols-7 border-b border-[var(--border)] last:border-0">
                    {week.map(day => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayPosts = posts[dateKey] || [];
                        const isToday = isSameDay(day, new Date());
                        const isCurrentMonth = isSameMonth(day, monthStart);

                        return (
                            <div
                                key={day.toISOString()}
                                data-testid="calendar-day"
                                onClick={() => onDayClick(day)}
                                className={cn(
                                    "min-h-[100px] border-l border-[var(--border)] first:border-l-0 p-2 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors",
                                    !isCurrentMonth && "bg-[var(--bg-tertiary)]/50 text-[var(--text-muted)]"
                                )}
                            >
                                <p className={cn(
                                    "text-sm font-medium mb-1",
                                    isToday && "inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient text-white text-xs"
                                )}>
                                    {format(day, 'd')}
                                </p>
                                <div className="space-y-1">
                                    {dayPosts.slice(0, 3).map(post => (
                                        <div
                                            key={post.id}
                                            data-testid="calendar-post"
                                            data-platform={post.platform}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPostClick(post.id);
                                            }}
                                            className={cn(
                                                "text-xs truncate rounded px-1.5 py-0.5 cursor-pointer border-l-2",
                                                platformColors[post.platform] || 'border-l-gray-300',
                                                "bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]"
                                            )}
                                            style={post.pillarColor ? { borderLeftColor: post.pillarColor } : undefined}
                                        >
                                            {post.time}
                                        </div>
                                    ))}
                                    {dayPosts.length > 3 && (
                                        <p className="text-xs text-[var(--text-muted)]">+{dayPosts.length - 3} more</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// Post Card Component
// ============================================================================
interface PostCardProps {
    post: CalendarPost;
    platformColors: Record<string, string>;
    onClick: () => void;
    compact?: boolean;
}

function PostCard({ post, platformColors, onClick, compact }: PostCardProps) {
    return (
        <div
            data-testid="calendar-post"
            data-platform={post.platform}
            onClick={onClick}
            className={cn(
                "mb-1 cursor-pointer rounded-lg border-l-[3px] bg-[var(--bg-secondary)] shadow-sm transition-shadow hover:shadow-md",
                platformColors[post.platform] || 'border-l-gray-300',
                compact ? "p-2" : "p-2.5"
            )}
            style={post.pillarColor ? { borderLeftColor: post.pillarColor } : undefined}
        >
            <p className="text-xs text-[var(--text-muted)]">{post.time}</p>
            {!compact && <p className="mt-1 truncate text-sm">{post.caption}</p>}
        </div>
    );
}
