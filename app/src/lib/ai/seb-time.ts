/**
 * Seb's calendar vocabulary.
 * Why: Seb reasons in the organization's local time everywhere — briefings, chat,
 * and the tools that write posts. These helpers live in their own module so both the
 * advisor and the tool layer can use them without importing each other.
 */
const DEFAULT_TIMEZONE = 'UTC';

export function normalizeSebTimezone(timezone?: string | null): string {
    if (!timezone) return DEFAULT_TIMEZONE;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
        return timezone;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

export function formatSebLocalDate(value: Date | string | null | undefined, timezone: string): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat('en-GB', {
        timeZone: normalizeSebTimezone(timezone),
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: false,
    }).format(date);
}

export function isSameSebLocalDate(left: Date, right: Date, timezone: string): boolean {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: normalizeSebTimezone(timezone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    return formatter.format(left) === formatter.format(right);
}
