/**
 * Schedule Calendar Types
 * Shared types and constants for scheduling components.
 */

import { PLATFORM_COLORS } from '@/lib/platforms/ui';

/**
 * Calendar post type for display
 */
export interface CalendarPost {
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

/**
 * AI-suggested posting time, as returned by /api/analytics/optimal-times
 */
export interface OptimalTimeSuggestion {
    time: string; // HH:mm format
    label: string; // "Thu 4:11 PM"
    lift: number; // % lift vs average engagement
    /** Weekday the ranking was derived from (0 = Sunday) */
    dayOfWeek?: number;
}

/** Ranking for one weekday — index 0 = Sunday … 6 = Saturday */
export interface WeekdaySuggestionBucket {
    suggestions: OptimalTimeSuggestion[];
    dataPoints: number;
}

/** Anything carrying an overall ranking plus optional per-weekday rankings */
export interface OptimalTimesSource {
    suggestions?: OptimalTimeSuggestion[];
    dataPoints?: number;
    byDayOfWeek?: WeekdaySuggestionBucket[];
}

/** Suggestions resolved for one date, with what they are based on */
export interface ResolvedSuggestions {
    times: OptimalTimeSuggestion[];
    dataPoints: number;
    /** False when the weekday had no ranking of its own and the overall one is shown */
    isDaySpecific: boolean;
}

export const DAY_NAMES = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
/**
 * Suggestions for the weekday of the date currently selected.
 *
 * Why: the times on screen have to be for the date on screen, not for whichever
 * weekday performed best. A weekday with too little history has no ranking of
 * its own, so the overall ranking is the next best answer for it.
 */
export function resolveSuggestionsForDay(
    source: OptimalTimesSource | undefined,
    dayOfWeek: number
): ResolvedSuggestions {
    const bucket = source?.byDayOfWeek?.[dayOfWeek];
    if (bucket?.suggestions.length) {
        return { times: bucket.suggestions, dataPoints: bucket.dataPoints, isDaySpecific: true };
    }
    return {
        times: source?.suggestions || [],
        dataPoints: source?.dataPoints || 0,
        isDaySpecific: false,
    };
}

// Derive bg colors from consolidated PLATFORM_COLORS
export const platformColors: Record<string, string> = Object.fromEntries(
    Object.entries(PLATFORM_COLORS).map(([k, v]) => [k, v.bg])
);



export const TIME_OPTIONS = [
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
export function getTimezoneAbbr(): string {
    const now = new Date();
    const tzString = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
    return tzString || 'Local';
}

/**
 * Get user's full timezone string
 */
export function getTimezoneString(): string {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset();
    const hours = Math.floor(Math.abs(offset) / 60);
    const mins = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    return `GMT ${sign}${hours}:${mins.toString().padStart(2, '0')} ${tz.replace('_', ' ')}`;
}
