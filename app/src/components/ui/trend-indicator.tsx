/**
 * TrendIndicator Component
 * Shows percentage change with up/down arrow
 * Why: Provides immediate visual feedback on metric changes vs previous period
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendIndicatorProps {
    current: number;
    previous: number;
    suffix?: string;
    showValue?: boolean;
    className?: string;
}

/**
 * Compact trend indicator showing percentage change.
 * Returns null if no meaningful change detected.
 */
export function TrendIndicator({
    current,
    previous,
    suffix = 'vs last week',
    showValue = false,
    className,
}: TrendIndicatorProps) {
    // Calculate percentage change
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const absoluteChange = Math.abs(change);

    // Only show if change is meaningful (> 0.5%)
    if (absoluteChange < 0.5 && !showValue) return null;

    const isPositive = change > 0;
    const isNeutral = absoluteChange < 0.5;

    const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

    const colorClass = isNeutral
        ? 'text-[var(--text-muted)]'
        : isPositive
            ? 'text-[var(--success)]'
            : 'text-[var(--error)]';

    const bgClass = isNeutral
        ? 'bg-[var(--bg-tertiary)]'
        : isPositive
            ? 'bg-[var(--success-light)]'
            : 'bg-[var(--error-light)]';

    return (
        <div className={cn('flex items-center gap-1.5', className)}>
            <span
                className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                    bgClass,
                    colorClass
                )}
            >
                <Icon className="h-3 w-3" />
                {absoluteChange.toFixed(0)}%
            </span>
            {suffix && (
                <span className="text-xs text-[var(--text-muted)]">{suffix}</span>
            )}
        </div>
    );
}
