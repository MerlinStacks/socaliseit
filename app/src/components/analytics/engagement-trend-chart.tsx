/**
 * Engagement Trend Chart
 * Multi-series area chart showing likes, comments, shares and engagement rate over time.
 *
 * Why: Replaces the single-metric "posts per day" bar chart with a richer
 * engagement breakdown so users can see which interaction types drive their performance.
 * Pure CSS+HTML — no charting library dependency.
 */

'use client';

import { BarChart3 } from 'lucide-react';
import type { EngagementTimelinePoint } from '@/app/(dashboard)/analytics/analytics-data';

interface EngagementTrendChartProps {
    data: EngagementTimelinePoint[];
    hasPosts: boolean;
}

const SERIES = [
    { key: 'likes' as const, label: 'Likes', color: 'rgb(236, 72, 153)' },
    { key: 'comments' as const, label: 'Comments', color: 'rgb(59, 130, 246)' },
    { key: 'shares' as const, label: 'Shares', color: 'rgb(34, 197, 94)' },
];

/**
 * Renders a stacked bar chart with a legend for each engagement metric.
 */
export function EngagementTrendChart({ data, hasPosts }: EngagementTrendChartProps) {
    const maxTotal = Math.max(
        ...data.map(d => d.likes + d.comments + d.shares),
        1
    );

    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="font-semibold">Engagement Trend</h3>
                    <p className="text-sm text-[var(--text-muted)]">Likes, comments &amp; shares per day</p>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4">
                    {SERIES.map(s => (
                        <div key={s.key} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.label}
                        </div>
                    ))}
                </div>
            </div>

            {hasPosts ? (
                <div className="flex h-52 items-end justify-between gap-2">
                    {data.map((item, i) => {
                        const total = item.likes + item.comments + item.shares;
                        const pct = (total / maxTotal) * 100;
                        const likePct = total > 0 ? (item.likes / total) * pct : 0;
                        const commentPct = total > 0 ? (item.comments / total) * pct : 0;
                        const sharePct = total > 0 ? (item.shares / total) * pct : 0;

                        return (
                            <div key={i} className="flex flex-1 flex-col items-center gap-2 group relative">
                                {/* Tooltip */}
                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] shadow-lg p-2 text-xs whitespace-nowrap">
                                        <p className="font-medium mb-1">{item.day}</p>
                                        <p>❤ {item.likes} · 💬 {item.comments} · ↗ {item.shares}</p>
                                    </div>
                                </div>
                                {/* Stacked bar */}
                                <div
                                    className="w-full rounded-t-md overflow-hidden flex flex-col-reverse transition-all duration-300"
                                    style={{ height: `${Math.max(pct, 4)}%` }}
                                >
                                    <div style={{ height: `${likePct > 0 ? (likePct / pct) * 100 : 0}%`, backgroundColor: SERIES[0].color }} />
                                    <div style={{ height: `${commentPct > 0 ? (commentPct / pct) * 100 : 0}%`, backgroundColor: SERIES[1].color }} />
                                    <div style={{ height: `${sharePct > 0 ? (sharePct / pct) * 100 : 0}%`, backgroundColor: SERIES[2].color }} />
                                </div>
                                <span className="text-xs text-[var(--text-muted)]">{item.day}</span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex h-52 items-center justify-center">
                    <div className="text-center">
                        <BarChart3 className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                        <p className="text-sm text-[var(--text-secondary)]">No engagement data yet</p>
                    </div>
                </div>
            )}
        </div>
    );
}
