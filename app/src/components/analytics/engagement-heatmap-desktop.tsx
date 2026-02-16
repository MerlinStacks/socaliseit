/**
 * Engagement Heatmap (Desktop)
 * 7×24 grid showing average engagement by day-of-week and hour.
 *
 * Why: This heatmap was implemented on mobile but never surfaced on desktop.
 * Desktop has room for the full 7×24 grid with labels.
 */

'use client';

import { cn } from '@/lib/utils';

interface HeatmapCell {
    day: number;
    hour: number;
    value: number;
}

interface EngagementHeatmapDesktopProps {
    data: HeatmapCell[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = ['12a', '', '', '3a', '', '', '6a', '', '', '9a', '', '', '12p', '', '', '3p', '', '', '6p', '', '', '9p', '', ''];

/**
 * Map value to a CSS colour on a green intensity scale.
 * Why: Mirrors GitHub contribution graph aesthetic.
 */
function getHeatColor(value: number, maxValue: number): string {
    if (value === 0) return 'bg-[var(--bg-tertiary)]';
    const intensity = value / Math.max(maxValue, 1);
    if (intensity > 0.75) return 'bg-emerald-500';
    if (intensity > 0.5) return 'bg-emerald-400';
    if (intensity > 0.25) return 'bg-emerald-300/70';
    return 'bg-emerald-200/50';
}

/**
 * Renders a 7-row × 24-column heatmap grid with day and hour labels.
 */
export function EngagementHeatmapDesktop({ data }: EngagementHeatmapDesktopProps) {
    const maxValue = Math.max(...data.map(c => c.value), 0.01);

    /** Build lookup by "day-hour" key for O(1) access */
    const lookup = new Map<string, number>();
    for (const cell of data) {
        lookup.set(`${cell.day}-${cell.hour}`, cell.value);
    }

    return (
        <div className="card p-5">
            <div className="mb-5">
                <h3 className="font-semibold">Engagement Heatmap</h3>
                <p className="text-sm text-[var(--text-muted)]">Best performing times based on historical data</p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    {/* Hour labels */}
                    <thead>
                        <tr>
                            <th className="w-10" />
                            {HOUR_LABELS.map((label, h) => (
                                <th key={h} className="text-[10px] font-normal text-[var(--text-muted)] pb-1 px-0.5">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {DAY_LABELS.map((dayLabel, d) => (
                            <tr key={d}>
                                <td className="text-xs text-[var(--text-muted)] pr-2 py-0.5 text-right font-medium">
                                    {dayLabel}
                                </td>
                                {Array.from({ length: 24 }, (_, h) => {
                                    const val = lookup.get(`${d}-${h}`) || 0;
                                    return (
                                        <td key={h} className="p-0.5">
                                            <div
                                                className={cn(
                                                    'h-4 w-full rounded-sm transition-colors',
                                                    getHeatColor(val, maxValue)
                                                )}
                                                title={`${dayLabel} ${h}:00 — Score: ${val.toFixed(1)}`}
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-[var(--text-muted)]">
                <span>Less</span>
                <span className="h-3 w-3 rounded-sm bg-[var(--bg-tertiary)]" />
                <span className="h-3 w-3 rounded-sm bg-emerald-200/50" />
                <span className="h-3 w-3 rounded-sm bg-emerald-300/70" />
                <span className="h-3 w-3 rounded-sm bg-emerald-400" />
                <span className="h-3 w-3 rounded-sm bg-emerald-500" />
                <span>More</span>
            </div>
        </div>
    );
}
