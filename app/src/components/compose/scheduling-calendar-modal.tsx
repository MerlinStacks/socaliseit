/**
 * Scheduling Calendar Modal
 * Full-screen modal for selecting post scheduling date/time with calendar view
 * 
 * Why: Provides a visual calendar interface for scheduling posts, showing
 * existing scheduled posts and allowing users to select optimal time slots.
 * 
 * Supports two modes:
 * 1. Unified scheduling - all platforms share the same date/time
 * 2. Per-platform scheduling - each account can have different date/time
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    X,
    ChevronLeft,
    ChevronRight,
    Clock,
    Sparkles,
    Calendar,
    Globe,
    Link2,
    Unlink2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addMonths,
    subMonths,
    isSameDay,
    isSameMonth,
    parseISO,
    isValid,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { type SocialAccount } from '@/components/compose/profile-selector';

/**
 * Calendar post type for display
 */
interface CalendarPost {
    id: string;
    time: string;
    caption: string;
    platform: string;
    status: string;
    thumbnail: string | null;
}

/**
 * Per-account schedule for separate scheduling mode
 */
export interface AccountSchedule {
    date: string; // yyyy-MM-dd format
    time: string; // HH:mm format
}

interface SchedulingCalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedAccounts: SocialAccount[];
    scheduledDate: string;
    scheduledTime: string;
    /**
     * Callback when scheduling is confirmed
     * @param schedules - Map of accountId to schedule, or null for unified scheduling
     * @param unifiedDate - Date string when using unified mode
     * @param unifiedTime - Time string when using unified mode
     */
    onSchedule: (
        schedules: Record<string, AccountSchedule> | null,
        unifiedDate: string,
        unifiedTime: string
    ) => void;
}

const platformColors: Record<string, string> = {
    instagram: 'bg-pink-500',
    tiktok: 'bg-gray-900',
    youtube: 'bg-red-500',
    facebook: 'bg-blue-500',
    pinterest: 'bg-red-400',
    linkedin: 'bg-blue-700',
    bluesky: 'bg-sky-500',
};

const TIME_OPTIONS = [
    { value: '06:00', label: '6:00 AM' },
    { value: '07:00', label: '7:00 AM' },
    { value: '08:00', label: '8:00 AM' },
    { value: '09:00', label: '9:00 AM' },
    { value: '10:00', label: '10:00 AM' },
    { value: '11:00', label: '11:00 AM' },
    { value: '12:00', label: '12:00 PM' },
    { value: '13:00', label: '1:00 PM' },
    { value: '14:00', label: '2:00 PM' },
    { value: '15:00', label: '3:00 PM' },
    { value: '16:00', label: '4:00 PM' },
    { value: '17:00', label: '5:00 PM' },
    { value: '18:00', label: '6:00 PM' },
    { value: '19:00', label: '7:00 PM' },
    { value: '19:30', label: '7:30 PM' },
    { value: '20:00', label: '8:00 PM' },
    { value: '21:00', label: '9:00 PM' },
    { value: '22:00', label: '10:00 PM' },
];

/**
 * Get user's timezone abbreviation
 */
function getTimezoneAbbr(): string {
    const now = new Date();
    const tzString = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
    return tzString || 'Local';
}

/**
 * Get user's full timezone string
 */
function getTimezoneString(): string {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset();
    const hours = Math.floor(Math.abs(offset) / 60);
    const mins = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    return `GMT ${sign}${hours}:${mins.toString().padStart(2, '0')} ${tz.replace('_', ' ')}`;
}

/**
 * Parse initial date string to Date object
 */
function parseInitialDate(dateStr: string): Date {
    if (dateStr === 'today') return new Date();
    if (dateStr === 'tomorrow') {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
    }
    const parsed = parseISO(dateStr);
    return isValid(parsed) ? parsed : new Date();
}

export function SchedulingCalendarModal({
    isOpen,
    onClose,
    selectedAccounts,
    scheduledDate: initialDate,
    scheduledTime: initialTime,
    onSchedule,
}: SchedulingCalendarModalProps) {
    // Scheduling mode: true = all same time, false = per-platform
    const [isUnifiedMode, setIsUnifiedMode] = useState(true);

    // Unified scheduling state (when isUnifiedMode = true)
    const [unifiedDate, setUnifiedDate] = useState<Date>(() => parseInitialDate(initialDate));
    const [unifiedTime, setUnifiedTime] = useState(initialTime);

    // Per-account scheduling state (when isUnifiedMode = false)
    const [accountSchedules, setAccountSchedules] = useState<Record<string, AccountSchedule>>(() => {
        const initial: Record<string, AccountSchedule> = {};
        const initialDateParsed = parseInitialDate(initialDate);
        selectedAccounts.forEach(account => {
            initial[account.id] = {
                date: format(initialDateParsed, 'yyyy-MM-dd'),
                time: initialTime,
            };
        });
        return initial;
    });

    // Currently selected account for calendar focus (per-platform mode)
    const [focusedAccountId, setFocusedAccountId] = useState<string | null>(
        selectedAccounts[0]?.id || null
    );

    const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(unifiedDate));
    const [existingPosts, setExistingPosts] = useState<Record<string, CalendarPost[]>>({});
    const [loadingPosts, setLoadingPosts] = useState(false);

    // Update account schedules when selected accounts change
    useEffect(() => {
        setAccountSchedules(prev => {
            const updated = { ...prev };
            const initialDateParsed = parseInitialDate(initialDate);
            selectedAccounts.forEach(account => {
                if (!updated[account.id]) {
                    updated[account.id] = {
                        date: format(initialDateParsed, 'yyyy-MM-dd'),
                        time: initialTime,
                    };
                }
            });
            return updated;
        });
        if (!focusedAccountId && selectedAccounts.length > 0) {
            setFocusedAccountId(selectedAccounts[0].id);
        }
    }, [selectedAccounts, initialDate, initialTime, focusedAccountId]);

    // Fetch existing posts for the calendar
    useEffect(() => {
        if (!isOpen) return;

        async function fetchPosts() {
            setLoadingPosts(true);
            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(currentMonth);
            const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
            const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

            try {
                const params = new URLSearchParams({
                    start: calendarStart.toISOString(),
                    end: calendarEnd.toISOString(),
                });
                const response = await fetch(`/api/calendar?${params}`);
                if (response.ok) {
                    const data = await response.json();
                    setExistingPosts(data.posts || {});
                }
            } catch (error) {
                console.error('Failed to fetch calendar posts:', error);
            } finally {
                setLoadingPosts(false);
            }
        }

        fetchPosts();
    }, [isOpen, currentMonth]);

    // Calendar grid generation
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
        return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    }, [currentMonth]);

    const weeks = useMemo(() => {
        const result = [];
        for (let i = 0; i < calendarDays.length; i += 7) {
            result.push(calendarDays.slice(i, i + 7));
        }
        return result;
    }, [calendarDays]);

    // Get the currently displayed date for calendar highlighting
    const displayedDate = useMemo(() => {
        if (isUnifiedMode) {
            return unifiedDate;
        }
        const focusedSchedule = focusedAccountId ? accountSchedules[focusedAccountId] : null;
        if (focusedSchedule) {
            const parsed = parseISO(focusedSchedule.date);
            return isValid(parsed) ? parsed : new Date();
        }
        return new Date();
    }, [isUnifiedMode, unifiedDate, focusedAccountId, accountSchedules]);

    // Navigation
    const goToPreviousMonth = useCallback(() => {
        setCurrentMonth(prev => subMonths(prev, 1));
    }, []);

    const goToNextMonth = useCallback(() => {
        setCurrentMonth(prev => addMonths(prev, 1));
    }, []);

    // Handle day click
    const handleDayClick = useCallback((day: Date) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        if (isUnifiedMode) {
            setUnifiedDate(day);
        } else if (focusedAccountId) {
            setAccountSchedules(prev => ({
                ...prev,
                [focusedAccountId]: {
                    ...prev[focusedAccountId],
                    date: dateStr,
                },
            }));
        }
    }, [isUnifiedMode, focusedAccountId]);

    // Handle time change for an account
    const handleAccountTimeChange = useCallback((accountId: string, time: string) => {
        if (isUnifiedMode) {
            setUnifiedTime(time);
        } else {
            setAccountSchedules(prev => ({
                ...prev,
                [accountId]: {
                    ...prev[accountId],
                    time,
                },
            }));
        }
    }, [isUnifiedMode]);

    // Handle date change for an account (via input)
    const handleAccountDateChange = useCallback((accountId: string, dateStr: string) => {
        const parsed = parseISO(dateStr);
        if (!isValid(parsed)) return;

        if (isUnifiedMode) {
            setUnifiedDate(parsed);
            setCurrentMonth(startOfMonth(parsed));
        } else {
            setAccountSchedules(prev => ({
                ...prev,
                [accountId]: {
                    ...prev[accountId],
                    date: dateStr,
                },
            }));
            setCurrentMonth(startOfMonth(parsed));
        }
    }, [isUnifiedMode]);

    // Toggle scheduling mode
    const handleToggleMode = useCallback(() => {
        if (isUnifiedMode) {
            // Switching to per-platform: initialize all accounts with current unified values
            const dateStr = format(unifiedDate, 'yyyy-MM-dd');
            const newSchedules: Record<string, AccountSchedule> = {};
            selectedAccounts.forEach(account => {
                newSchedules[account.id] = {
                    date: dateStr,
                    time: unifiedTime,
                };
            });
            setAccountSchedules(newSchedules);
        }
        setIsUnifiedMode(!isUnifiedMode);
    }, [isUnifiedMode, unifiedDate, unifiedTime, selectedAccounts]);

    // Handle schedule confirmation
    const handleConfirmSchedule = useCallback(() => {
        const unifiedDateStr = format(unifiedDate, 'yyyy-MM-dd');
        if (isUnifiedMode) {
            onSchedule(null, unifiedDateStr, unifiedTime);
        } else {
            onSchedule(accountSchedules, unifiedDateStr, unifiedTime);
        }
    }, [isUnifiedMode, unifiedDate, unifiedTime, accountSchedules, onSchedule]);

    if (!isOpen) return null;

    const timezoneAbbr = getTimezoneAbbr();
    const timezoneString = getTimezoneString();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm">
            {/* Modal Container */}
            <div className="flex w-full h-full bg-[var(--bg-primary)]">
                {/* Left Sidebar */}
                <div className="w-[300px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                        <h2 className="text-lg font-semibold">Publish</h2>
                        <button
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Scheduling Mode Toggle */}
                    <div className="border-b border-[var(--border)] px-4 py-3">
                        <button
                            onClick={handleToggleMode}
                            className={cn(
                                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                                isUnifiedMode
                                    ? 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                            )}
                        >
                            {isUnifiedMode ? (
                                <>
                                    <Link2 className="h-4 w-4" />
                                    <span className="flex-1 text-left">Schedule together</span>
                                    <span className="text-xs opacity-70">Click to separate</span>
                                </>
                            ) : (
                                <>
                                    <Unlink2 className="h-4 w-4" />
                                    <span className="flex-1 text-left">Schedule separately</span>
                                    <span className="text-xs opacity-70">Click to unify</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Selected Profiles */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                            {isUnifiedMode ? 'Profiles (same time)' : 'Profiles (individual times)'}
                        </p>

                        {selectedAccounts.map((account) => {
                            const schedule = accountSchedules[account.id] || {
                                date: format(unifiedDate, 'yyyy-MM-dd'),
                                time: unifiedTime,
                            };
                            const isFocused = !isUnifiedMode && focusedAccountId === account.id;
                            const displayDate = isUnifiedMode ? format(unifiedDate, 'yyyy-MM-dd') : schedule.date;
                            const displayTime = isUnifiedMode ? unifiedTime : schedule.time;

                            return (
                                <div
                                    key={account.id}
                                    onClick={() => !isUnifiedMode && setFocusedAccountId(account.id)}
                                    className={cn(
                                        'rounded-lg border bg-[var(--bg-primary)] p-3 transition-all',
                                        isFocused
                                            ? 'border-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)]'
                                            : 'border-[var(--border)]',
                                        !isUnifiedMode && 'cursor-pointer hover:border-[var(--accent-gold)]/50'
                                    )}
                                >
                                    {/* Profile Header */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <div
                                            className={cn(
                                                'h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-medium',
                                                platformColors[account.platform] || 'bg-gray-500'
                                            )}
                                        >
                                            {account.avatar ? (
                                                <img
                                                    src={account.avatar}
                                                    alt=""
                                                    className="h-full w-full rounded-full object-cover"
                                                />
                                            ) : (
                                                account.name.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <span className="text-sm font-medium truncate flex-1">
                                            {account.name}
                                        </span>
                                        {!isUnifiedMode && isFocused && (
                                            <span className="text-[10px] uppercase tracking-wide text-[var(--accent-gold)]">
                                                Editing
                                            </span>
                                        )}
                                    </div>

                                    {/* Date/Time Selectors */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex items-center gap-1 flex-1">
                                            <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                            <input
                                                type="date"
                                                value={displayDate}
                                                onChange={(e) => handleAccountDateChange(account.id, e.target.value)}
                                                disabled={!isUnifiedMode && !isFocused}
                                                className={cn(
                                                    'flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs outline-none',
                                                    'focus:border-[var(--accent-gold)]',
                                                    !isUnifiedMode && !isFocused && 'opacity-60'
                                                )}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 flex-1">
                                            <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                            <select
                                                value={displayTime}
                                                onChange={(e) => handleAccountTimeChange(account.id, e.target.value)}
                                                disabled={!isUnifiedMode && !isFocused}
                                                className={cn(
                                                    'flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs outline-none',
                                                    'focus:border-[var(--accent-gold)]',
                                                    !isUnifiedMode && !isFocused && 'opacity-60'
                                                )}
                                            >
                                                {TIME_OPTIONS.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <span className="text-xs text-[var(--text-muted)]">{timezoneAbbr}</span>
                                    </div>

                                    {/* Quick Links */}
                                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                        <button className="text-[var(--accent-gold)] hover:underline">
                                            Show optimal times
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {selectedAccounts.length === 0 && (
                            <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                                No profiles selected
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Calendar Area */}
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
                                onClick={goToPreviousMonth}
                                className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-lg font-semibold min-w-[160px] text-center">
                                {format(currentMonth, 'MMMM yyyy')}
                            </span>
                            <button
                                onClick={goToNextMonth}
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
                                    className={cn(
                                        'h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-medium border-2 border-[var(--bg-secondary)]',
                                        platformColors[account.platform] || 'bg-gray-500'
                                    )}
                                    title={account.name}
                                >
                                    {account.avatar ? (
                                        <img
                                            src={account.avatar}
                                            alt={account.name}
                                            className="h-full w-full rounded-full object-cover"
                                        />
                                    ) : (
                                        account.name.charAt(0).toUpperCase()
                                    )}
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
                                {dayNames.map((day) => (
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
                                        const dayPosts = existingPosts[dateKey] || [];
                                        const isToday = isSameDay(day, new Date());
                                        const isSelected = isSameDay(day, displayedDate);
                                        const isCurrentMonth = isSameMonth(day, currentMonth);
                                        const isPast = day < new Date() && !isToday;

                                        return (
                                            <div
                                                key={day.toISOString()}
                                                onClick={() => !isPast && handleDayClick(day)}
                                                className={cn(
                                                    'min-h-[120px] border-l border-[var(--border)] first:border-l-0 p-2 transition-colors',
                                                    isCurrentMonth ? '' : 'bg-[var(--bg-tertiary)]/50',
                                                    isPast ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--bg-tertiary)]',
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
                                                                {post.time}
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

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                        <button
                            onClick={onClose}
                            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            ← Previous
                        </button>

                        <div className="flex items-center gap-3">
                            {/* Scheduling Summary */}
                            <div className="flex items-center gap-2 text-xs text-[var(--accent-gold)]">
                                <Sparkles className="h-4 w-4" />
                                {isUnifiedMode ? (
                                    <span>
                                        All {selectedAccounts.length} profiles on{' '}
                                        <strong>{format(unifiedDate, 'MMM d')}</strong> at{' '}
                                        <strong>
                                            {TIME_OPTIONS.find((t) => t.value === unifiedTime)?.label || unifiedTime}
                                        </strong>
                                    </span>
                                ) : (
                                    <span>
                                        {selectedAccounts.length} profiles with individual times
                                    </span>
                                )}
                            </div>

                            <Button onClick={handleConfirmSchedule}>
                                <Clock className="mr-2 h-4 w-4" />
                                Schedule
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
