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
        // Create formatter for the target timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
        });

        // Get timestamps for 1 hour before and after
        const before = new Date(date.getTime() - 60 * 60 * 1000);
        const after = new Date(date.getTime() + 60 * 60 * 1000);

        // If the hour jumps by more than 1, we're near a DST transition
        const timeParts = formatter.formatToParts(date);
        const hourPart = timeParts.find(p => p.type === 'hour');
        const currentHour = hourPart ? parseInt(hourPart.value, 10) : 0;

        const beforeParts = formatter.formatToParts(before);
        const beforeHourPart = beforeParts.find(p => p.type === 'hour');
        const beforeHour = beforeHourPart ? parseInt(beforeHourPart.value, 10) : 0;

        // During spring forward, the hour before 2 AM would be 1 AM,
        // and the hour after would be 3 AM (skipping 2 AM)
        // This is a simplified check - actual gap detection is complex
        const hourDiff = Math.abs(currentHour - beforeHour);
        return hourDiff > 1;
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
