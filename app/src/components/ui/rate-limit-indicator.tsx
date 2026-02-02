'use client';

/**
 * API Rate Limit Indicator
 * Displays current API usage and remaining limits
 */

import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

interface RateLimitData {
    /** API name or endpoint group */
    name: string;
    /** Requests used in current window */
    used: number;
    /** Maximum requests allowed */
    limit: number;
    /** Seconds until limit resets */
    resetsIn?: number;
}

interface RateLimitIndicatorProps {
    data: RateLimitData;
    className?: string;
    /** Compact mode for inline use */
    compact?: boolean;
}

/**
 * Get status based on usage percentage
 */
function getStatus(used: number, limit: number): 'safe' | 'warning' | 'critical' {
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return 'critical';
    if (percentage >= 70) return 'warning';
    return 'safe';
}

const statusColors = {
    safe: 'text-[var(--success)] bg-[var(--success-light)]',
    warning: 'text-[var(--warning)] bg-[var(--warning-light)]',
    critical: 'text-[var(--error)] bg-[var(--error-light)]',
};

const statusBarColors = {
    safe: 'bg-[var(--success)]',
    warning: 'bg-[var(--warning)]',
    critical: 'bg-[var(--error)]',
};

/**
 * Format seconds to human-readable time
 */
function formatResetTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
}

/**
 * API Rate Limit Indicator Component
 * Shows visual feedback for API usage
 */
export function RateLimitIndicator({ data, className, compact = false }: RateLimitIndicatorProps) {
    const status = getStatus(data.used, data.limit);
    const percentage = Math.min((data.used / data.limit) * 100, 100);
    const remaining = data.limit - data.used;

    if (compact) {
        return (
            <div className={cn('inline-flex items-center gap-2', className)}>
                {status === 'safe' && <CheckCircle className="w-4 h-4 text-[var(--success)]" />}
                {status === 'warning' && <TrendingUp className="w-4 h-4 text-[var(--warning)]" />}
                {status === 'critical' && <AlertTriangle className="w-4 h-4 text-[var(--error)]" />}
                <span className="text-sm text-[var(--text-secondary)]">
                    {remaining.toLocaleString()} / {data.limit.toLocaleString()}
                </span>
            </div>
        );
    }

    return (
        <div className={cn('p-4 rounded-lg bg-[var(--bg-tertiary)]', className)}>
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                        {data.name}
                    </span>
                    <span className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        statusColors[status]
                    )}>
                        {status === 'safe' && 'Healthy'}
                        {status === 'warning' && 'Elevated'}
                        {status === 'critical' && 'Near Limit'}
                    </span>
                </div>
                {data.resetsIn && (
                    <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <Clock className="w-3 h-3" />
                        Resets in {formatResetTime(data.resetsIn)}
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden mb-2">
                <div
                    className={cn(
                        'h-full rounded-full transition-all duration-500',
                        statusBarColors[status]
                    )}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {/* Stats */}
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
                <span>{data.used.toLocaleString()} used</span>
                <span>{remaining.toLocaleString()} remaining</span>
            </div>
        </div>
    );
}

/**
 * Grouped rate limit display for multiple APIs
 */
interface RateLimitGroupProps {
    title?: string;
    limits: RateLimitData[];
    className?: string;
}

export function RateLimitGroup({ title, limits, className }: RateLimitGroupProps) {
    return (
        <div className={cn('space-y-3', className)}>
            {title && (
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    {title}
                </h3>
            )}
            {limits.map((limit) => (
                <RateLimitIndicator key={limit.name} data={limit} />
            ))}
        </div>
    );
}

/**
 * Hook-friendly version that fetches rate limit data
 * (Placeholder - would need actual API endpoint)
 */
export function useRateLimits() {
    // This would typically fetch from an API
    // For now, return mock data
    const mockLimits: RateLimitData[] = [
        { name: 'Instagram API', used: 450, limit: 500, resetsIn: 1800 },
        { name: 'TikTok API', used: 180, limit: 1000, resetsIn: 3600 },
        { name: 'Pinterest API', used: 95, limit: 100, resetsIn: 300 },
    ];

    return {
        limits: mockLimits,
        isLoading: false,
        error: null,
    };
}
