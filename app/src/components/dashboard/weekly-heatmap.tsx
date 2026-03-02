/**
 * WeeklyHeatmap — Client component for timezone-aware weekly post counts
 *
 * Why: The server runs in UTC, so grouping posts by day server-side assigns
 * near-midnight posts to the wrong day for users in non-UTC timezones.
 * This component receives raw scheduledAt ISO strings and groups them
 * client-side using the browser's local timezone.
 */

'use client';

import { useMemo } from 'react';
import { startOfWeek, addDays, format } from 'date-fns';

interface WeeklyHeatmapProps {
    /** ISO date strings of scheduled posts from the current week */
    scheduledDates: string[];
    /** Optional size variant for mobile vs desktop */
    variant?: 'default' | 'compact';
}

/**
 * Displays a 7-day heatmap showing scheduled post counts per day.
 * Groups dates by the user's browser timezone.
 */
export function WeeklyHeatmap({ scheduledDates, variant = 'default' }: WeeklyHeatmapProps) {
    const days = useMemo(() => {
        // Why: Compute week boundaries in the browser's local timezone
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });

        return Array.from({ length: 7 }, (_, i) => {
            const date = addDays(weekStart, i);
            const dateStr = format(date, 'yyyy-MM-dd');

            // Why: Compare using local date strings so timezone is applied
            const count = scheduledDates.filter(iso => {
                const d = new Date(iso);
                return format(d, 'yyyy-MM-dd') === dateStr;
            }).length;

            return {
                name: format(date, 'EEE'),
                count,
            };
        });
    }, [scheduledDates]);

    const isCompact = variant === 'compact';

    return (
        <div className={`grid grid-cols-7 ${isCompact ? 'gap-2' : 'gap-3'}`}>
            {days.map((day) => (
                <div key={day.name} className="text-center">
                    <p className={`${isCompact ? 'mb-1.5 text-[10px]' : 'mb-2 text-xs'} font-medium text-[var(--text-muted)]`}>
                        {day.name}
                    </p>
                    <div
                        className={`aspect-square rounded-lg flex items-center justify-center ${isCompact ? 'text-xs' : 'text-sm'} font-semibold ${day.count >= 3
                            ? 'bg-[var(--accent-gold)] text-white'
                            : day.count >= 1
                                ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                            }`}
                    >
                        {day.count}
                    </div>
                </div>
            ))}
        </div>
    );
}

