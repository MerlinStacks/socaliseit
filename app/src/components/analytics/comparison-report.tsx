'use client';

/**
 * Comparison Report Component
 * Month-over-month metrics comparison with PDF export
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
    TrendingUp,
    TrendingDown,
    Minus,
    Calendar,
    Download,
    BarChart3,
    Users,
    Eye,
    Heart,
    MessageSquare
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface MetricData {
    name: string;
    icon: typeof TrendingUp;
    current: number;
    previous: number;
    format: 'number' | 'percentage' | 'compact';
}

interface ComparisonReportProps {
    /** Current period label */
    currentPeriod?: string;
    /** Previous period label */
    previousPeriod?: string;
    className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatValue(value: number, format: 'number' | 'percentage' | 'compact'): string {
    switch (format) {
        case 'percentage':
            return `${value.toFixed(1)}%`;
        case 'compact':
            if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
            if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
            return value.toLocaleString();
        default:
            return value.toLocaleString();
    }
}

function getChangeData(current: number, previous: number) {
    if (previous === 0) return { change: 0, percentage: 0, trend: 'neutral' as const };

    const change = current - previous;
    const percentage = ((current - previous) / previous) * 100;
    const trend = change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'neutral' as const;

    return { change, percentage, trend };
}

// ============================================================================
// Main Component
// ============================================================================

export function ComparisonReport({
    currentPeriod = 'This Month',
    previousPeriod = 'Last Month',
    className,
}: ComparisonReportProps) {
    const [isExporting, setIsExporting] = useState(false);

    // Mock metrics data - would come from API
    const metrics: MetricData[] = useMemo(() => [
        { name: 'Total Followers', icon: Users, current: 45230, previous: 42100, format: 'compact' },
        { name: 'Impressions', icon: Eye, current: 892000, previous: 756000, format: 'compact' },
        { name: 'Engagement Rate', icon: Heart, current: 4.8, previous: 4.2, format: 'percentage' },
        { name: 'Total Likes', icon: Heart, current: 28450, previous: 25800, format: 'compact' },
        { name: 'Comments', icon: MessageSquare, current: 1840, previous: 1620, format: 'number' },
        { name: 'Shares', icon: TrendingUp, current: 945, previous: 780, format: 'number' },
    ], []);

    const handleExport = async () => {
        setIsExporting(true);
        // Simulate PDF generation
        await new Promise((r) => setTimeout(r, 1500));

        // In production, would use jsPDF or server-side PDF generation
        const content = `SocialiseIT Analytics Report\n${currentPeriod} vs ${previousPeriod}\n\n` +
            metrics.map((m) => {
                const { percentage } = getChangeData(m.current, m.previous);
                return `${m.name}: ${formatValue(m.current, m.format)} (${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%)`;
            }).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `socialiseit-report-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        setIsExporting(false);
    };

    return (
        <div className={cn('card p-6', className)}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient">
                        <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-lg">Performance Comparison</h2>
                        <p className="text-sm text-[var(--text-muted)]">
                            {currentPeriod} vs {previousPeriod}
                        </p>
                    </div>
                </div>
                <Button
                    variant="secondary"
                    onClick={handleExport}
                    disabled={isExporting}
                    className="btn-interactive"
                >
                    {isExporting ? (
                        <LoadingSpinner size="sm" />
                    ) : (
                        <Download className="w-4 h-4 mr-2" />
                    )}
                    Export PDF
                </Button>
            </div>

            {/* Period Selector */}
            <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-sm font-medium">{currentPeriod}</span>
                <span className="text-sm text-[var(--text-muted)]">compared to</span>
                <span className="text-sm font-medium">{previousPeriod}</span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {metrics.map((metric) => {
                    const { percentage, trend } = getChangeData(metric.current, metric.previous);
                    const Icon = metric.icon;
                    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

                    return (
                        <div
                            key={metric.name}
                            className={cn(
                                'p-4 rounded-xl transition-all',
                                'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80',
                                'interactive-scale-subtle'
                            )}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className="w-4 h-4 text-[var(--text-muted)]" />
                                <span className="text-xs text-[var(--text-muted)]">{metric.name}</span>
                            </div>

                            <p className="text-2xl font-bold text-[var(--text-primary)] mb-1">
                                {formatValue(metric.current, metric.format)}
                            </p>

                            <div className={cn(
                                'flex items-center gap-1 text-sm font-medium',
                                trend === 'up' && 'text-[var(--success)]',
                                trend === 'down' && 'text-[var(--error)]',
                                trend === 'neutral' && 'text-[var(--text-muted)]'
                            )}>
                                <TrendIcon className="w-4 h-4" />
                                <span>{percentage >= 0 ? '+' : ''}{percentage.toFixed(1)}%</span>
                            </div>

                            {/* Comparison Bar */}
                            <div className="mt-3 space-y-1">
                                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                                    <span>{currentPeriod}</span>
                                    <span>{previousPeriod}</span>
                                </div>
                                <div className="flex gap-1 h-2">
                                    <div
                                        className="rounded bg-[var(--accent-gold)]"
                                        style={{
                                            width: `${Math.min((metric.current / Math.max(metric.current, metric.previous)) * 100, 100)}%`
                                        }}
                                    />
                                    <div
                                        className="rounded bg-[var(--border)]"
                                        style={{
                                            width: `${Math.min((metric.previous / Math.max(metric.current, metric.previous)) * 100, 100)}%`
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Summary */}
            <div className="mt-6 p-4 rounded-lg bg-[var(--accent-gold-light)] border border-[var(--accent-gold)]">
                <p className="text-sm text-[var(--text-primary)]">
                    <strong>Summary:</strong> Overall strong growth this period. Follower count increased by 7.4%,
                    and engagement rate improved by 14.3%. Consider maintaining current posting strategy.
                </p>
            </div>
        </div>
    );
}
