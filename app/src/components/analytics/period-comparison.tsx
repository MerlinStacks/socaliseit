/**
 * Period Comparison Component
 * Side-by-side display of current vs previous period metrics.
 *
 * Why: Change percentages alone lack context. Showing absolute values
 * for both periods lets users see scale, not just direction.
 */

'use client';

import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { PeriodComparisonData } from '@/app/(dashboard)/analytics/analytics-data';

interface PeriodComparisonProps {
    data: PeriodComparisonData;
    rangeName: string;
}

const METRICS: { key: keyof PeriodComparisonData['current']; label: string }[] = [
    { key: 'posts', label: 'Posts' },
    { key: 'likes', label: 'Likes' },
    { key: 'comments', label: 'Comments' },
    { key: 'shares', label: 'Shares' },
    { key: 'reach', label: 'Reach' },
    { key: 'impressions', label: 'Impressions' },
    { key: 'engagementRate', label: 'Eng. Rate' },
];

/**
 * Two-column comparison layout with change indicators.
 */
export function PeriodComparison({ data, rangeName }: PeriodComparisonProps) {
    /** Why: Detect when all values in both periods are zero to avoid a wall of 0→0 rows */
    const hasData = METRICS.some(({ key }) => data.current[key] > 0 || data.previous[key] > 0);

    if (!hasData) {
        return (
            <div className="card p-5">
                <div className="flex items-center gap-2 mb-1">
                    <ArrowRight className="h-4 w-4 text-[var(--accent-gold)]" />
                    <h3 className="font-semibold">Period Comparison</h3>
                </div>
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-gold)]/10 mb-3">
                        <ArrowRight className="h-6 w-6 text-[var(--accent-gold)]" />
                    </div>
                    <p className="text-sm text-[var(--text-muted)] text-center max-w-xs">
                        Period comparison will appear once posts have been published and synced.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
                <ArrowRight className="h-4 w-4 text-[var(--accent-gold)]" />
                <h3 className="font-semibold">Period Comparison</h3>
            </div>

            {/* Header row */}
            <div className="grid grid-cols-[1fr_100px_40px_100px] gap-2 text-xs font-medium text-[var(--text-muted)] mb-2 px-2">
                <span>Metric</span>
                <span className="text-right">Previous</span>
                <span />
                <span className="text-right">Current</span>
            </div>

            <div className="space-y-1">
                {METRICS.map(({ key, label }) => {
                    const curr = data.current[key];
                    const prev = data.previous[key];
                    const change = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
                    const isRate = key === 'engagementRate';

                    return (
                        <div
                            key={key}
                            className="grid grid-cols-[1fr_100px_40px_100px] gap-2 items-center rounded-lg bg-[var(--bg-tertiary)] px-3 py-2"
                        >
                            <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                            <span className="text-sm text-[var(--text-muted)] text-right font-mono">
                                {isRate ? `${prev.toFixed(2)}%` : formatCompact(prev)}
                            </span>
                            <span className="flex justify-center">
                                <ChangeIndicator change={change} />
                            </span>
                            <span className="text-sm font-medium text-right font-mono">
                                {isRate ? `${curr.toFixed(2)}%` : formatCompact(curr)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ChangeIndicator({ change }: { change: number }) {
    if (change > 5) {
        return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
    }
    if (change < -5) {
        return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
    }
    return <Minus className="h-3.5 w-3.5 text-[var(--text-muted)]" />;
}

function formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}
