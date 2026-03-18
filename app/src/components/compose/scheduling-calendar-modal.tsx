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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { TimeSlotReasoning } from '@/components/ai/ai-reasoning';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addMonths,
    subMonths,
    parseISO,
    isValid,
} from 'date-fns';
import { type SocialAccount } from '@/components/compose/profile-selector';

// Extracted components
import { ScheduleSidebar } from './schedule-sidebar';
import { ScheduleCalendarGrid } from './schedule-calendar-grid';
import {
    AccountSchedule,
    CalendarPost,
    getTimezoneAbbr,
    getTimezoneString,
} from './schedule-types';
import { useCalendarSettingsStore } from '@/lib/stores/calendar-settings-store';

interface OptimalTimeSuggestion {
    time: string;
    label: string;
    lift: number;
    dayOfWeek?: number;
}

interface OptimalTimesResponse {
    suggestions: OptimalTimeSuggestion[];
    dataPoints: number;
    confidence: 'high' | 'medium' | 'low';
    perAccount?: Record<string, {
        suggestions: OptimalTimeSuggestion[];
        dataPoints: number;
        confidence: 'high' | 'medium' | 'low';
    }>;
}

/**
 * Format 24-hour time to 12-hour display
 */
function formatTime12Hour(time24: string): string {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Re-export types for external use
export type { AccountSchedule } from './schedule-types';

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
    const { weekStartsOn } = useCalendarSettingsStore();

    // Scheduling mode: true = all same time, false = per-platform
    const [isUnifiedMode, setIsUnifiedMode] = useState(true);

    // Unified scheduling state (when isUnifiedMode = true)
    const [unifiedDate, setUnifiedDate] = useState<Date>(() => parseInitialDate(initialDate));
    const [unifiedTime, setUnifiedTime] = useState(initialTime);
    /** Why: Ref-based guard prevents double-submit (modal unmounts immediately
     *  after confirm, so useState is unreliable for this). */
    const submittedRef = useRef(false);

    /**
     * Sync state with props when modal opens or props change
     * Why: useState initial values only run once on mount. When editing a post,
     * we need to update state to match the post's scheduled time.
     */
    useEffect(() => {
        if (isOpen) {
            setUnifiedDate(parseInitialDate(initialDate));
            setUnifiedTime(initialTime);
            setCurrentMonth(startOfMonth(parseInitialDate(initialDate)));
            submittedRef.current = false;
        }
    }, [isOpen, initialDate, initialTime]);

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

    // Fetch optimal posting times
    // Why: Uses React Query instead of SWR to unify cache management
    const { data: optimalTimesData } = useQuery<OptimalTimesResponse>({
        queryKey: ['optimal-times'],
        queryFn: async () => {
            const res = await fetch('/api/analytics/optimal-times');
            if (!res.ok) return { suggestions: [], dataPoints: 0, confidence: 'low' as const };
            return res.json();
        },
        enabled: isOpen,
        staleTime: 5 * 60_000, // 5 min — optimal times are computed from historical data
        refetchOnWindowFocus: false,
    });

    const optimalTimes = optimalTimesData?.suggestions || [];

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
            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(currentMonth);
            const calendarStart = startOfWeek(monthStart, { weekStartsOn });
            const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

            try {
                const params = new URLSearchParams({
                    start: calendarStart.toISOString(),
                    end: calendarEnd.toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                });
                const response = await fetch(`/api/calendar?${params}`);
                if (response.ok) {
                    const data = await response.json();
                    setExistingPosts(data.posts || {});
                }
            } catch (error) {
                // Silently fail - posts display is optional
            }
        }

        fetchPosts();
    }, [isOpen, currentMonth]);

    // Calendar grid generation
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn });
        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });
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
        if (submittedRef.current) return;
        submittedRef.current = true;
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            {/* Modal Container - matches compose page sizing */}
            <div className="flex h-[90vh] w-[90vw] max-w-[1600px] overflow-hidden rounded-2xl bg-[var(--bg-primary)] shadow-2xl">
                {/* Left Sidebar */}
                <ScheduleSidebar
                    isUnifiedMode={isUnifiedMode}
                    selectedAccounts={selectedAccounts}
                    accountSchedules={accountSchedules}
                    focusedAccountId={focusedAccountId}
                    unifiedDate={unifiedDate}
                    unifiedTime={unifiedTime}
                    timezoneAbbr={timezoneAbbr}
                    optimalTimes={optimalTimes}
                    perAccountOptimalTimes={optimalTimesData?.perAccount}
                    onClose={onClose}
                    onToggleMode={handleToggleMode}
                    onFocusAccount={setFocusedAccountId}
                    onDateChange={handleAccountDateChange}
                    onTimeChange={handleAccountTimeChange}
                />

                {/* Main Calendar Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <ScheduleCalendarGrid
                        currentMonth={currentMonth}
                        weeks={weeks}
                        displayedDate={displayedDate}
                        existingPosts={existingPosts}
                        selectedAccounts={selectedAccounts}
                        timezoneString={timezoneString}
                        onPreviousMonth={() => setCurrentMonth(prev => subMonths(prev, 1))}
                        onNextMonth={() => setCurrentMonth(prev => addMonths(prev, 1))}
                        onDayClick={handleDayClick}
                    />

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onClose}
                                className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                ← Previous
                            </button>
                            {/* AI Reasoning for time suggestions */}
                            {optimalTimes.length > 0 && (
                                <TimeSlotReasoning
                                    time={optimalTimes[0].time}
                                    reasons={[
                                        `Based on engagement data from ${optimalTimesData?.dataPoints || 0} posts`,
                                        optimalTimes[0].label || 'Optimal engagement window',
                                        `${optimalTimes[0].lift}% higher engagement vs average`,
                                    ]}
                                />
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Scheduling Summary */}
                            <div className="flex items-center gap-2 text-xs text-[var(--accent-gold)]">
                                <Sparkles className="h-4 w-4" />
                                {isUnifiedMode ? (
                                    <span>
                                        All {selectedAccounts.length} profiles on{' '}
                                        <strong>{format(unifiedDate, 'MMM d')}</strong> at{' '}
                                        <strong>
                                            {formatTime12Hour(unifiedTime)}
                                        </strong>
                                    </span>
                                ) : (
                                    <span>
                                        {selectedAccounts.length} profiles with individual times
                                    </span>
                                )}
                            </div>

                            <Button onClick={handleConfirmSchedule} disabled={submittedRef.current}>
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
