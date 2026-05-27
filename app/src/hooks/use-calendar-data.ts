/**
 * Shared calendar data utilities for prefetching
 *
 * Why: The sidebar pre-warms the calendar data cache so navigation to
 * /calendar is instant. Both the sidebar prefetch and the calendar hook
 * must use the SAME query key + fetch function.
 *
 * Strategy: Read the persisted navigation state from localStorage
 * (same key that useCalendarNavigation saves to) to compute the EXACT
 * query key the hook will use. This guarantees a React Query cache hit.
 */

import { startOfMonth, startOfWeek } from 'date-fns';

const STORAGE_KEY = 'socialiseit-calendar-navigation';

/** Stale time for calendar data — shared between prefetch and hook */
export const CALENDAR_STALE_TIME = 30_000;

/**
 * Read the stored calendar navigation state and build the matching query key + fetch params.
 * Falls back to 'month' view with current dates if nothing is stored.
 */
function getStoredCalendarState() {
    const now = new Date();
    const defaults = {
        viewMode: 'month',
        selectedDate: now,
        weekStart: startOfWeek(now, { weekStartsOn: 1 }),
        monthStart: startOfMonth(now),
    };

    if (typeof window === 'undefined') return defaults;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return defaults;
        const parsed = JSON.parse(stored);

        return {
            viewMode: parsed.viewMode || 'month',
            selectedDate: parsed.selectedDate ? new Date(parsed.selectedDate) : defaults.selectedDate,
            weekStart: parsed.weekStart ? new Date(parsed.weekStart) : defaults.weekStart,
            monthStart: parsed.monthStart ? new Date(parsed.monthStart) : defaults.monthStart,
        };
    } catch {
        return defaults;
    }
}

/**
 * Build the React Query key matching useCalendarOrchestration.
 * Why: Uses the EXACT same format and values (from localStorage)
 * so the prefetched data populates the right cache entry.
 */
export function buildCalendarQueryKey(orgId?: string, isMobile?: boolean) {
    const state = getStoredCalendarState();
    const effectiveViewMode = isMobile ? 'month' : state.viewMode;
    return [
        'calendar',
        orgId,
        // Why: useCalendarOrchestration uses the month key on mobile because
        // mobile always fetches the full visible month. Must match exactly or
        // post-save prefetches land in a cache entry the calendar never reads.
        effectiveViewMode,
        state.selectedDate.toISOString(),
        state.weekStart.toISOString(),
        state.monthStart.toISOString(),
    ];
}

/**
 * Fetch calendar posts + notes for the stored view/date.
 * Why: Uses the browser timezone for correct date grouping,
 * and computes the date range the same way the hook does.
 */
export async function calendarPrefetchFn() {
    const state = getStoredCalendarState();
    let start: Date, end: Date;

    switch (state.viewMode) {
        case 'day':
            start = new Date(state.selectedDate); start.setHours(0, 0, 0, 0);
            end = new Date(state.selectedDate); end.setHours(23, 59, 59, 999);
            break;
        case 'week':
            start = state.weekStart;
            end = new Date(state.weekStart); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
            break;
        case 'month':
        case 'timeline':
        default: {
            const monthStart = new Date(state.monthStart); monthStart.setDate(1);
            const monthEnd = new Date(state.monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1); monthEnd.setDate(0);
            const firstDow = monthStart.getDay() || 7;
            start = new Date(monthStart); start.setDate(start.getDate() - firstDow + 1);
            const lastDow = monthEnd.getDay() || 7;
            end = new Date(monthEnd); end.setDate(end.getDate() + (7 - lastDow)); end.setHours(23, 59, 59, 999);
            break;
        }
    }

    const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    const [postRes, noteRes] = await Promise.all([
        fetch(`/api/calendar?${params}`, { cache: 'no-store' }),
        fetch(`/api/calendar/notes?${params}`, { cache: 'no-store' }),
    ]);

    if (!postRes.ok) throw new Error('Failed to fetch calendar');

    const postData = await postRes.json();
    const noteData = noteRes.ok ? await noteRes.json() : { notes: {} };
    return { posts: postData.posts, notes: noteData.notes };
}
