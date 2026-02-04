/**
 * useCalendarNavigation - Hook for calendar date navigation and view state
 * Extracted from calendar/page.tsx for better maintainability
 */

import { useState, useCallback, useMemo } from 'react';
import {
    startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    addDays, addMonths, subDays, subMonths,
    format, startOfDay, endOfDay
} from 'date-fns';

export type CalendarViewMode = 'day' | 'week' | 'month';

/**
 * useCalendarNavigation - Manages calendar navigation state
 * Why: Centralizes navigation logic for Day/Week/Month views
 */
export function useCalendarNavigation() {
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [currentMonthStart, setCurrentMonthStart] = useState(() => startOfMonth(new Date()));
    const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

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
            case 'month': return goToPreviousMonth;
        }
    }, [viewMode, goToPreviousDay, goToPreviousWeek, goToPreviousMonth]);

    const goToNext = useMemo(() => {
        switch (viewMode) {
            case 'day': return goToNextDay;
            case 'week': return goToNextWeek;
            case 'month': return goToNextMonth;
        }
    }, [viewMode, goToNextDay, goToNextWeek, goToNextMonth]);

    /**
     * Calculate date range based on current view mode
     * Why: API fetching needs start/end dates for the visible range
     */
    const getDateRange = useCallback(() => {
        switch (viewMode) {
            case 'day':
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
