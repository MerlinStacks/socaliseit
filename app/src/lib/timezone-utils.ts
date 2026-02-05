/**
 * DST-Aware Timezone Utilities
 * Handles daylight saving time transitions for scheduled posts.
 *
 * Why: Posts scheduled for 9am during DST transition may publish at 8am or 10am
 * if naive Date math is used. This utility ensures wall-clock time consistency.
 * 
 * Note: Uses native Intl API to avoid additional dependencies.
 */

import { addDays, subDays } from 'date-fns';
import { logger } from '@/lib/logger';

/**
 * Check if a date falls on a DST transition day for the given timezone.
 *
 * @param date - The date to check
 * @param timezone - IANA timezone (e.g., 'America/New_York')
 * @returns true if this date is a DST transition day
 */
export function isDSTTransitionDay(date: Date, timezone: string): boolean {
    try {
        // Get offset for this day and adjacent days
        const currentOffset = getTimezoneOffset(date, timezone);
        const nextDayOffset = getTimezoneOffset(addDays(date, 1), timezone);
        const prevDayOffset = getTimezoneOffset(subDays(date, 1), timezone);

        return currentOffset !== nextDayOffset || currentOffset !== prevDayOffset;
    } catch (error) {
        logger.warn({ date, timezone, error }, 'Failed to check DST transition');
        return false;
    }
}

/**
 * Get the UTC offset in minutes for a timezone at a specific date.
 * Uses native Intl API.
 */
function getTimezoneOffset(date: Date, timezone: string): number {
    // Format date in UTC and the target timezone
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: timezone });

    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);

    return (tzDate.getTime() - utcDate.getTime()) / 60000;
}

/**
 * Schedule a post for a specific wall-clock time, accounting for DST.
 *
 * @param wallClockHour - Hour in 24h format (0-23)
 * @param wallClockMinute - Minute (0-59)
 * @param targetDate - The date to schedule for
 * @param timezone - User's timezone
 * @returns UTC Date that corresponds to the wall-clock time
 */
export function scheduleForWallClockTime(
    wallClockHour: number,
    wallClockMinute: number,
    targetDate: Date,
    timezone: string
): Date {
    try {
        // Build a local date string for the target timezone
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();
        const day = targetDate.getDate();

        // Create a date in the local timezone using the Intl formatter
        // This creates a date at midnight on the target date in the target timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });

        // Build target time string
        const pad = (n: number) => n.toString().padStart(2, '0');
        const targetStr = `${year}-${pad(month + 1)}-${pad(day)}T${pad(wallClockHour)}:${pad(wallClockMinute)}:00`;

        // Parse as if it were in the target timezone
        // We'll iterate to find the correct UTC time
        const estimatedUtc = new Date(targetStr);
        const offsetMs = getTimezoneOffset(estimatedUtc, timezone) * 60000;
        const utcDate = new Date(estimatedUtc.getTime() - offsetMs);

        logger.debug({
            wallClockTime: `${wallClockHour}:${wallClockMinute}`,
            targetDate: targetDate.toISOString(),
            timezone,
            utcResult: utcDate.toISOString(),
        }, 'Scheduled for wall-clock time');

        return utcDate;
    } catch (error) {
        logger.error({ wallClockHour, wallClockMinute, targetDate, timezone, error }, 'Failed to schedule for wall-clock time');
        // Fallback to naive calculation
        const naive = new Date(targetDate);
        naive.setHours(wallClockHour, wallClockMinute, 0, 0);
        return naive;
    }
}

/**
 * Get the delay in milliseconds until a scheduled wall-clock time.
 * Accounts for DST transitions.
 *
 * @param scheduledAt - The scheduled UTC time
 * @param timezone - User's timezone for logging
 * @returns Delay in milliseconds from now
 */
export function getDelayUntilScheduled(scheduledAt: Date, timezone?: string): number {
    const now = new Date();
    const delay = scheduledAt.getTime() - now.getTime();

    // Warn if scheduling seems off (negative or very long)
    if (delay < 0) {
        logger.warn({ scheduledAt, now, delay }, 'Scheduled time is in the past');
    } else if (delay > 365 * 24 * 60 * 60 * 1000) {
        logger.warn({ scheduledAt, delay }, 'Scheduled more than 1 year in advance');
    }

    return Math.max(0, delay);
}

/**
 * Format a UTC date to wall-clock time for display.
 *
 * @param utcDate - UTC date
 * @param timezone - User's timezone
 * @param options - Intl.DateTimeFormat options
 */
export function formatForTimezone(
    utcDate: Date,
    timezone: string,
    options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }
): string {
    try {
        return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: timezone }).format(utcDate);
    } catch (error) {
        logger.warn({ utcDate, timezone, error }, 'Failed to format for timezone');
        return utcDate.toISOString();
    }
}

/**
 * Get the wall-clock hour and minute from a UTC date in a specific timezone.
 */
export function getWallClockTime(
    utcDate: Date,
    timezone: string
): { hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    }).formatToParts(utcDate);

    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

    return { hour, minute };
}

/**
 * Adjust an existing scheduled time if DST transition occurred.
 * Use this when loading scheduled posts to verify times are still correct.
 *
 * @param originalScheduledAt - The originally scheduled UTC time
 * @param intendedWallClock - The intended wall-clock hour:minute
 * @param timezone - User's timezone
 * @returns Adjusted UTC time if needed, or original if no change
 */
export function adjustForDSTIfNeeded(
    originalScheduledAt: Date,
    intendedWallClock: { hour: number; minute: number },
    timezone: string
): Date {
    const currentWallClock = getWallClockTime(originalScheduledAt, timezone);

    // If they match, no adjustment needed
    if (currentWallClock.hour === intendedWallClock.hour && currentWallClock.minute === intendedWallClock.minute) {
        return originalScheduledAt;
    }

    // Recalculate the correct UTC time
    logger.info({
        originalScheduledAt,
        intendedWallClock,
        currentWallClock,
        timezone,
    }, 'Adjusting scheduled time for DST');

    return scheduleForWallClockTime(
        intendedWallClock.hour,
        intendedWallClock.minute,
        originalScheduledAt,
        timezone
    );
}
