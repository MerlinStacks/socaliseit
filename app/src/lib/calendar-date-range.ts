import { tz } from '@date-fns/tz';
import { addDays, endOfDay, isValid, parseISO, startOfDay } from 'date-fns';

/** Interpret calendar days in the viewer's timezone, never the server's TZ. */
export function calendarDateRange(startParam: string | null, endParam: string | null, timezone: string, now = new Date()) {
    // Validate before querying so a bad IANA zone/date becomes a client error.
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(now);
    const context = { in: tz(timezone) };
    const startValue = startParam === null ? now : parseISO(startParam, context);
    if (!isValid(startValue)) throw new RangeError('Invalid calendar start date');
    const start = startOfDay(startValue, context);
    const endValue = endParam === null ? addDays(start, 6, context) : parseISO(endParam, context);
    if (!isValid(endValue)) throw new RangeError('Invalid calendar end date');
    const end = endOfDay(endValue, context);
    if (start > end) throw new RangeError('Calendar start must not follow end');

    // Keep plain UTC Dates at the Prisma/API boundary, not TZDate's offset ISO format.
    return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}
