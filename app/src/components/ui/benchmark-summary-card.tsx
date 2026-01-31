/**
 * Benchmark Summary Cards Component
 * Status-aware cards for competitor comparison with trend indicators
 */

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface BenchmarkMetric {
    id: string;
    label: string;
    value: string | number;
    /** Average value for comparison */
    average: number;
    /** Current value for percentage calculation */
    currentValue: number;
    /** Ranking position, e.g., "#4 in Engagement" */
    rank?: string;
    /** Unit for display, e.g., "%", "K" */
    unit?: string;
}

interface BenchmarkSummaryCardProps {
    metric: BenchmarkMetric;
    className?: string;
}

/**
 * Displays a benchmark metric with relative performance indicator.
 * Green for above average, red for below, yellow for within 5%.
 */
export function BenchmarkSummaryCard({ metric, className }: BenchmarkSummaryCardProps) {
    const difference = metric.currentValue - metric.average;
    const percentDiff = ((difference / metric.average) * 100).toFixed(1);

    const getTrendInfo = () => {
        const absDiff = Math.abs(difference);
        const threshold = metric.average * 0.05; // 5% threshold for "neutral"

        if (absDiff < threshold) {
            return {
                icon: Minus,
                color: 'text-[var(--text-muted)]',
                bgColor: 'bg-[var(--bg-tertiary)]',
                label: 'avg',
            };
        }

        if (difference > 0) {
            return {
                icon: TrendingUp,
                color: 'text-[var(--success)]',
                bgColor: 'bg-[var(--success-light)]',
                label: `+${percentDiff}%`,
            };
        }

        return {
            icon: TrendingDown,
            color: 'text-[var(--error)]',
            bgColor: 'bg-[var(--error-light)]',
            label: `${percentDiff}%`,
        };
    };

    const trend = getTrendInfo();
    const TrendIcon = trend.icon;

    return (
        <div
            className={cn(
                'rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4',
                'card-hover',
                className
            )}
        >
            {/* Label */}
            <p className="text-sm font-medium text-[var(--text-muted)]">
                {metric.label}
            </p>

            {/* Value */}
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                {metric.value}
                {metric.unit && <span className="text-lg font-normal text-[var(--text-muted)]">{metric.unit}</span>}
            </p>

            {/* Comparison Row */}
            <div className="mt-3 flex items-center justify-between">
                {/* Trend Badge */}
                <div className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                    trend.bgColor,
                    trend.color
                )}>
                    <TrendIcon className="h-3 w-3" />
                    <span>vs avg {metric.average}{metric.unit || ''}</span>
                </div>

                {/* Rank Badge */}
                {metric.rank && (
                    <span className="text-xs font-medium text-[var(--accent-gold)]">
                        {metric.rank}
                    </span>
                )}
            </div>
        </div>
    );
}

interface BenchmarkSummaryGridProps {
    metrics: BenchmarkMetric[];
    className?: string;
}

/**
 * Grid layout for multiple benchmark cards
 */
export function BenchmarkSummaryGrid({ metrics, className }: BenchmarkSummaryGridProps) {
    return (
        <div className={cn(
            'grid gap-4 sm:grid-cols-2 lg:grid-cols-4',
            className
        )}>
            {metrics.map((metric) => (
                <BenchmarkSummaryCard key={metric.id} metric={metric} />
            ))}
        </div>
    );
}
