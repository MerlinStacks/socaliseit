/**
 * Calendar page with week view
 * Displays scheduled posts by platform - now with real data
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Filter, Star, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { startOfWeek, endOfWeek, addDays, format, isSameDay } from 'date-fns';

interface CalendarPost {
    id: string;
    time: string;
    caption: string;
    platform: string;
    status: string;
    thumbnail: string | null;
    pillarColor: string | null;
}

export default function CalendarPage() {
    const router = useRouter();
    const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [posts, setPosts] = useState<Record<string, CalendarPost[]>>({});
    const [loading, setLoading] = useState(true);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        const start = currentWeekStart;
        const end = endOfWeek(currentWeekStart, { weekStartsOn: 1 });

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
    }, [currentWeekStart]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    const goToPreviousWeek = () => setCurrentWeekStart(prev => addDays(prev, -7));
    const goToNextWeek = () => setCurrentWeekStart(prev => addDays(prev, 7));
    const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

    const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
    const timeSlots = ['9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];

    const platformColors: Record<string, string> = {
        instagram: 'border-l-pink-500',
        tiktok: 'border-l-gray-900',
        youtube: 'border-l-red-500',
        facebook: 'border-l-blue-500',
        pinterest: 'border-l-red-400',
    };

    /**
     * Get posts for a specific day and approximate time slot
     */
    const getPostsForSlot = (date: Date, timeSlot: string): CalendarPost[] => {
        const dateKey = format(date, 'yyyy-MM-dd');
        const dayPosts = posts[dateKey] || [];

        // Map time slots to hour ranges
        const hourRanges: Record<string, [number, number]> = {
            '9 AM': [6, 11],
            '12 PM': [11, 14],
            '3 PM': [14, 17],
            '6 PM': [17, 20],
            '9 PM': [20, 24],
        };

        const [startHour, endHour] = hourRanges[timeSlot] || [0, 24];

        return dayPosts.filter(post => {
            // Parse the time string (e.g., "3:00 PM")
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
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <h1 className="text-2xl font-semibold">Calendar</h1>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-muted)]">
                        {format(currentWeekStart, 'MMM d')} - {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
                    </span>
                </div>
            </header>

            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-4">
                <div className="flex items-center gap-3">
                    {/* Navigation */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={goToPreviousWeek}
                            className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <Button variant="secondary" onClick={goToToday}>
                            Today
                        </Button>
                        <button
                            onClick={goToNextWeek}
                            className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    {/* View Tabs */}
                    <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-1">
                        <button className="rounded-md px-4 py-2 text-sm text-[var(--text-muted)]">
                            Day
                        </button>
                        <button className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm font-medium shadow-sm">
                            Week
                        </button>
                        <button className="rounded-md px-4 py-2 text-sm text-[var(--text-muted)]">
                            Month
                        </button>
                    </div>

                    {/* Filters */}
                    <button className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
                        <Filter className="h-4 w-4" />
                        Platform
                    </button>
                </div>

                <Button onClick={() => router.push('/compose')}>
                    <Plus className="h-4 w-4" />
                    New Post
                </Button>
            </div>

            {/* Calendar */}
            <div className="flex-1 overflow-auto p-8">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                    </div>
                ) : (
                    <div className="card overflow-hidden">
                        {/* Header Row */}
                        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)]">
                            <div className="p-4" />
                            {days.map((day) => {
                                const isToday = isSameDay(day, new Date());
                                return (
                                    <div key={day.toISOString()} className="p-4 text-center">
                                        <p className="text-xs font-medium text-[var(--text-muted)]">
                                            {format(day, 'EEE')}
                                        </p>
                                        <p
                                            className={`mt-1 text-xl font-semibold ${isToday
                                                ? 'inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient text-white'
                                                : ''
                                                }`}
                                        >
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
                                        <div
                                            key={`${day.toISOString()}-${time}`}
                                            className="min-h-[100px] border-l border-[var(--border)] p-2 relative"
                                        >
                                            {slotPosts.map((post) => (
                                                <div
                                                    key={post.id}
                                                    className={`mb-1 cursor-pointer rounded-lg border-l-[3px] bg-[var(--bg-secondary)] p-2.5 shadow-sm transition-shadow hover:shadow-md ${platformColors[post.platform] || 'border-l-gray-300'
                                                        }`}
                                                    style={post.pillarColor ? { borderLeftColor: post.pillarColor } : undefined}
                                                    onClick={() => router.push(`/compose?edit=${post.id}`)}
                                                >
                                                    <p className="text-xs text-[var(--text-muted)]">{post.time}</p>
                                                    <p className="mt-1 truncate text-sm">{post.caption}</p>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Empty state message if no posts */}
                        {Object.keys(posts).length === 0 && (
                            <div className="text-center py-8 text-[var(--text-muted)]">
                                <p>No scheduled posts this week</p>
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
