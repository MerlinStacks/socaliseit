/**
 * DST-Aware Scheduling Utilities
 * Handles edge cases during Daylight Saving Time transitions
 * 
 * Why: During DST transitions, times can be skipped (spring forward)
 * or ambiguous (fall back). This module helps handle these cases
 * to prevent scheduling issues.
 */

import { logger } from './logger';

/**
 * Check if a scheduled time falls in a DST transition gap.
 * During "spring forward", times like 2:00 AM - 2:59 AM don't exist.
 * 
 * @param date - The date to check
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns true if the time is in a DST gap
 */
export function isInDstGap(date: Date, timezone: string): boolean {
    try {
        // Why (BUG-08): The previous implementation compared local hours,
        // which false-positived at midnight (23→0 = diff 23 > 1) and
        // false-negatived for sub-hour transitions (Lord Howe Island: 30 min).
        // Comparing UTC offsets before vs after detects the actual transition.
        const before = new Date(date.getTime() - 60 * 60 * 1000);
        const offsetBefore = getTimezoneOffset(before, timezone);
        const offsetNow = getTimezoneOffset(date, timezone);

        // If offset changed AND clock moved forward (offset decreased), it's a gap
        return offsetNow !== offsetBefore && offsetNow < offsetBefore;
    } catch (error) {
        logger.warn({ timezone, error }, 'Error checking DST gap');
        return false;
    }
}

/**
 * Adjust scheduled time to avoid DST gaps.
 * If the time falls in a gap, moves it forward to the next valid time.
 * 
 * @param date - The scheduled date
 * @param timezone - IANA timezone string
 * @returns Adjusted date that falls on a valid time
 */
export function adjustForDstGap(date: Date, timezone: string): Date {
    if (!isInDstGap(date, timezone)) {
        return date;
    }

    logger.info({
        originalTime: date.toISOString(),
        timezone
    }, 'Adjusting scheduled time to avoid DST gap');

    // Move forward by 1 hour to escape the gap
    return new Date(date.getTime() + 60 * 60 * 1000);
}

/**
 * Check if a time is ambiguous due to DST "fall back".
 * During fall back, times like 1:30 AM occur twice.
 * 
 * @param date - The date to check
 * @param timezone - IANA timezone string
 * @returns true if the time is ambiguous
 */
export function isAmbiguousDstTime(date: Date, timezone: string): boolean {
    try {
        // Create two dates 2 hours apart centered on the given time
        const before = new Date(date.getTime() - 60 * 60 * 1000);
        const after = new Date(date.getTime() + 60 * 60 * 1000);

        // Get UTC offsets for before and after
        const beforeOffset = getTimezoneOffset(before, timezone);
        const afterOffset = getTimezoneOffset(after, timezone);

        // If offsets differ, we're near a DST transition
        // During fall back, the offset would change (e.g., -4 to -5)
        return beforeOffset !== afterOffset;
    } catch (error) {
        logger.warn({ timezone, error }, 'Error checking DST ambiguity');
        return false;
    }
}

/**
 * Get the UTC offset in minutes for a date in a specific timezone.
 */
function getTimezoneOffset(date: Date, timezone: string): number {
    try {
        const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
        const tzString = date.toLocaleString('en-US', { timeZone: timezone });

        const utcDate = new Date(utcString);
        const tzDate = new Date(tzString);

        return (utcDate.getTime() - tzDate.getTime()) / (1000 * 60);
    } catch {
        return 0;
    }
}

/**
 * Format a date for consistent scheduling across timezones.
 * Always stores in UTC for the database, converts for display.
 * 
 * @param date - Date to format
 * @param timezone - User's timezone for display
 * @returns Object with both UTC and local representations
 */
export function formatScheduledTime(date: Date, timezone: string): {
    utc: Date;
    local: string;
    isAmbiguous: boolean;
    wasAdjusted: boolean;
} {
    const isInGap = isInDstGap(date, timezone);
    const adjusted = isInGap ? adjustForDstGap(date, timezone) : date;
    const isAmbiguous = isAmbiguousDstTime(adjusted, timezone);

    const localFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'long',
    });

    return {
        utc: adjusted,
        local: localFormatter.format(adjusted),
        isAmbiguous,
        wasAdjusted: isInGap,
    };
}
