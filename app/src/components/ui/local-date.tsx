/**
 * LocalDate — Client component for timezone-aware date formatting
 *
 * Why: Server components render in UTC (Docker), so dates formatted with
 * date-fns `format()` show UTC times. This component defers formatting to
 * the browser, which applies the user's local timezone automatically.
 */

'use client';

/**
 * Renders a date in the user's local timezone.
 *
 * @param date - ISO string or Date to format
 * @param formatStr - Intl.DateTimeFormat options preset: 'short' = "Mar 2, 9:15 AM"
 */
export function LocalDate({
    date,
    className,
}: {
    date: string | Date;
    className?: string;
}) {
    const d = typeof date === 'string' ? new Date(date) : date;

    // Why: Intl.DateTimeFormat automatically uses the browser's timezone
    const formatted = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(d);

    return <span className={className}>{formatted}</span>;
}
