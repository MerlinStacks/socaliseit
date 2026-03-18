/**
 * Schedule Calendar Grid Component
 * Calendar grid with days and existing posts.
 */

'use client';

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    format,
    isSameDay,
    isSameMonth,
    isBefore,
    startOfDay,
} from 'date-fns';
import { type SocialAccount } from '@/components/compose/profile-selector';
import { CalendarPost, platformColors } from './schedule-types';
import { PlatformIcon } from './platform-icons';
import { SocialAccountAvatar } from '@/components/ui/social-account-avatar';

interface ScheduleCalendarGridProps {
    currentMonth: Date;
    weeks: Date[][];
    displayedDate: Date;
    existingPosts: Record<string, CalendarPost[]>;
    selectedAccounts: SocialAccount[];
    timezoneString: string;
    onPreviousMonth: () => void;
    onNextMonth: () => void;
    onDayClick: (day: Date) => void;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Calendar grid with header navigation and day cells.
 */
export function ScheduleCalendarGrid({
    currentMonth,
    weeks,
    displayedDate,
    existingPosts,
    selectedAccounts,
    timezoneString,
    onPreviousMonth,
    onNextMonth,
    onDayClick,
}: ScheduleCalendarGridProps) {
    // Why: Build a set of selected platform names so we can filter calendar posts
    // to only those relevant to the current compose session
    const selectedPlatforms = useMemo(() => {
        const set = new Set<string>();
        selectedAccounts.forEach(a => set.add(a.platform.toLowerCase()));
        return set;
    }, [selectedAccounts]);
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Globe className="h-4 w-4" />
                    {timezoneString}
                </div>

                {/* Month Navigation */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onPreviousMonth}
                        className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-lg font-semibold min-w-[160px] text-center">
                        {format(currentMonth, 'MMMM yyyy')}
                    </span>
                    <button
                        onClick={onNextMonth}
                        className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                {/* Selected Profiles Avatars */}
                <div className="flex items-center gap-1">
                    {selectedAccounts.slice(0, 5).map((account) => (
                        <div
                            key={account.id}
                            className="relative"
                            title={`${account.name} (${account.platform})`}
                        >
                            <SocialAccountAvatar
                                src={account.avatar}
                                name={account.name}
                                size={28}
                                className="border-2 border-[var(--bg-secondary)]"
                                fallbackColorClass={platformColors[account.platform] || 'bg-gray-500'}
                            />
                            {/* Platform Badge */}
                            <div
                                className={cn(
                                    'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center border border-[var(--bg-secondary)]',
                                    platformColors[account.platform] || 'bg-gray-500'
                                )}
                            >
                                <PlatformIcon platform={account.platform} size={8} />
                            </div>
                        </div>
                    ))}
                    {selectedAccounts.length > 5 && (
                        <span className="text-xs text-[var(--text-muted)] ml-1">
                            +{selectedAccounts.length - 5}
                        </span>
                    )}
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 overflow-auto p-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
                    {/* Day Names Header */}
                    <div className="grid grid-cols-7 border-b border-[var(--border)]">
                        {DAY_NAMES.map((day) => (
                            <div
                                key={day}
                                className="p-3 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Weeks */}
                    {weeks.map((week, weekIdx) => (
                        <div
                            key={weekIdx}
                            className="grid grid-cols-7 border-b border-[var(--border)] last:border-0"
                        >
                            {week.map((day) => {
                                const dateKey = format(day, 'yyyy-MM-dd');
                                // Why: Only show posts for platforms the user selected in step 1
                                const dayPosts = (existingPosts[dateKey] || []).filter(
                                    p => selectedPlatforms.has(p.platform)
                                );
                                const today = new Date();
                                const isToday = isSameDay(day, today);
                                const isSelected = isSameDay(day, displayedDate);
                                const isCurrentMonth = isSameMonth(day, currentMonth);
                                const isPast = isBefore(startOfDay(day), startOfDay(today));

                                return (
                                    <div
                                        key={day.toISOString()}
                                        onClick={() => !isPast && onDayClick(day)}
                                        className={cn(
                                            'min-h-[120px] border-l border-[var(--border)] first:border-l-0 p-2 transition-colors',
                                            isCurrentMonth ? '' : 'bg-[var(--bg-tertiary)]/50',
                                            isPast
                                                ? 'bg-[var(--bg-tertiary)]/40 opacity-60 cursor-not-allowed'
                                                : 'cursor-pointer hover:bg-[var(--bg-tertiary)]',
                                            isSelected && 'ring-2 ring-inset ring-[var(--accent-gold)]'
                                        )}
                                    >
                                        {/* Day Number */}
                                        <div className="flex items-center justify-between mb-1">
                                            <span
                                                className={cn(
                                                    'text-sm font-medium',
                                                    isToday &&
                                                    'inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient text-white text-xs',
                                                    !isCurrentMonth && 'text-[var(--text-muted)]'
                                                )}
                                            >
                                                {format(day, 'd')}
                                            </span>
                                        </div>

                                        {/* Posts for this day */}
                                        <div className="space-y-1">
                                            {dayPosts.slice(0, 4).map((post) => (
                                                <div
                                                    key={post.id}
                                                    className={cn(
                                                        'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                                                        'bg-[var(--bg-primary)] border border-[var(--border)]'
                                                    )}
                                                >
                                                    <div
                                                        className={cn(
                                                            'h-4 w-4 rounded-full flex-shrink-0 flex items-center justify-center text-white',
                                                            platformColors[post.platform] || 'bg-gray-500'
                                                        )}
                                                        style={{ fontSize: '8px' }}
                                                    >
                                                        {post.platform.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-[10px] text-[var(--text-muted)]">
                                                        {format(new Date(post.time), 'h:mm a')}
                                                    </span>
                                                    <span className="truncate text-[10px] flex-1">
                                                        {post.caption.slice(0, 20)}...
                                                    </span>
                                                </div>
                                            ))}
                                            {dayPosts.length > 4 && (
                                                <span className="text-[10px] text-[var(--accent-gold)]">
                                                    All ({dayPosts.length})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
