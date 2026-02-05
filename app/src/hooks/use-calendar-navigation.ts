/**
 * useCalendarNavigation - Hook for calendar date navigation and view state
 * Extracted from calendar/page.tsx for better maintainability
 * 
 * Persistence: View mode and selected dates are saved to localStorage
 * so users return to their preferred view and last-viewed date range.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
    startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    addDays, addMonths, subDays, subMonths,
    format, startOfDay, endOfDay, parseISO, isValid
} from 'date-fns';

export type CalendarViewMode = 'day' | 'week' | 'month' | 'timeline';

const STORAGE_KEY = 'socialiseit-calendar-navigation';

/**
 * Safely parse a stored date string, falling back to current date
 */
function parseStoredDate(dateStr: string | undefined, fallback: () => Date): Date {
    if (!dateStr) return fallback();
    try {
        const parsed = parseISO(dateStr);
        return isValid(parsed) ? parsed : fallback();
    } catch {
        return fallback();
    }
}

/**
 * Load navigation state from localStorage
 */
function loadStoredState(): { viewMode: CalendarViewMode; selectedDate: Date; weekStart: Date; monthStart: Date } {
    const defaults = {
        viewMode: 'month' as CalendarViewMode,
        selectedDate: new Date(),
        weekStart: startOfWeek(new Date(), { weekStartsOn: 1 }),
        monthStart: startOfMonth(new Date()),
    };

    if (typeof window === 'undefined') return defaults;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return defaults;

        const parsed = JSON.parse(stored);
        return {
            viewMode: ['day', 'week', 'month', 'timeline'].includes(parsed.viewMode) ? parsed.viewMode : 'month',
            selectedDate: parseStoredDate(parsed.selectedDate, () => new Date()),
            weekStart: parseStoredDate(parsed.weekStart, () => startOfWeek(new Date(), { weekStartsOn: 1 })),
            monthStart: parseStoredDate(parsed.monthStart, () => startOfMonth(new Date())),
        };
    } catch {
        return defaults;
    }
}

/**
 * useCalendarNavigation - Manages calendar navigation state
 * Why: Centralizes navigation logic for Day/Week/Month views
 */
export function useCalendarNavigation() {
    // Initialize from localStorage (with SSR-safe defaults)
    const [isHydrated, setIsHydrated] = useState(false);
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [currentMonthStart, setCurrentMonthStart] = useState(() => startOfMonth(new Date()));
    const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

    // Hydrate from localStorage on mount (client-side only)
    useEffect(() => {
        const stored = loadStoredState();
        setViewMode(stored.viewMode);
        setSelectedDate(stored.selectedDate);
        setCurrentWeekStart(stored.weekStart);
        setCurrentMonthStart(stored.monthStart);
        setIsHydrated(true);
    }, []);

    // Persist state changes to localStorage
    useEffect(() => {
        if (!isHydrated) return; // Don't save until hydrated to avoid overwriting with defaults

        const state = {
            viewMode,
            selectedDate: selectedDate.toISOString(),
            weekStart: currentWeekStart.toISOString(),
            monthStart: currentMonthStart.toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [viewMode, selectedDate, currentWeekStart, currentMonthStart, isHydrated]);

    // Navigation functions
    const goToPreviousDay = useCallback(() => setSelectedDate(prev => subDays(prev, 1)), []);
    const goToNextDay = useCallback(() => setSelectedDate(prev => addDays(prev, 1)), []);
    const goToPreviousWeek = useCallback(() => setCurrentWeekStart(prev => addDays(prev, -7)), []);
    const goToNextWeek = useCallback(() => setCurrentWeekStart(prev => addDays(prev, 7)), []);
    const goToPreviousMonth = useCallback(() => setCurrentMonthStart(prev => subMonths(prev, 1)), []);
    const goToNextMonth = useCallback(() => setCurrentMonthStart(prev => addMonths(prev, 1)), []);

    const goToToday = useCallback(() => {
        const today = new Date();
        setSelectedDate(today);
        setCurrentWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
        setCurrentMonthStart(startOfMonth(today));
    }, []);

    // Dynamic navigation based on view mode
    const goToPrevious = useMemo(() => {
        switch (viewMode) {
            case 'day': return goToPreviousDay;
            case 'week': return goToPreviousWeek;
            case 'month':
            case 'timeline': return goToPreviousMonth;
        }
    }, [viewMode, goToPreviousDay, goToPreviousWeek, goToPreviousMonth]);

    const goToNext = useMemo(() => {
        switch (viewMode) {
            case 'day': return goToNextDay;
            case 'week': return goToNextWeek;
            case 'month':
            case 'timeline': return goToNextMonth;
        }
    }, [viewMode, goToNextDay, goToNextWeek, goToNextMonth]);

    /**
     * Calculate date range based on current view mode
     * Why: API fetching needs start/end dates for the visible range
     */
    const getDateRange = useCallback(() => {
        switch (viewMode) {
            case 'day':
            case 'timeline':
                return { start: startOfDay(selectedDate), end: endOfDay(selectedDate) };
            case 'week':
                return { start: currentWeekStart, end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }) };
            case 'month': {
                const monthStart = startOfMonth(currentMonthStart);
                const monthEnd = endOfMonth(currentMonthStart);
                const firstVisible = startOfWeek(monthStart, { weekStartsOn: 1 });
                const lastVisible = endOfWeek(monthEnd, { weekStartsOn: 1 });
                return { start: firstVisible, end: lastVisible };
            }
        }
    }, [viewMode, selectedDate, currentWeekStart, currentMonthStart]);

    /**
     * Get header text based on view mode
     * Why: Shows current date range in a human-readable format
     */
    const getHeaderText = useCallback(() => {
        switch (viewMode) {
            case 'day':
                return format(selectedDate, 'EEEE, MMMM d, yyyy');
            case 'timeline':
                return `Timeline: ${format(selectedDate, 'MMMM d, yyyy')}`;
            case 'week':
                return `${format(currentWeekStart, 'MMM d')} - ${format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}`;
            case 'month':
                return format(currentMonthStart, 'MMMM yyyy');
        }
    }, [viewMode, selectedDate, currentWeekStart, currentMonthStart]);

    return {
        // State
        selectedDate,
        currentWeekStart,
        currentMonthStart,
        viewMode,

        // Setters
        setSelectedDate,
        setCurrentWeekStart,
        setCurrentMonthStart,
        setViewMode,

        // Navigation
        goToPrevious,
        goToNext,
        goToToday,

        // Computed
        getDateRange,
        getHeaderText,
    };
}
