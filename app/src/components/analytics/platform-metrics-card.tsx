/**
 * Platform Metrics Card
 * Why: Renders platform-specific metrics from the `platformMetrics` JSON field
 * on PostAnalytics. Each platform stores different metric keys — this component
 * maps them to human-readable labels with appropriate formatting.
 */

'use client';

import {
    SkipForward, RefreshCw, Clock, ArrowRight,
    ArrowLeft, LogOut, Repeat, Quote, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Known platform metric keys and their display config */
const METRIC_CONFIG: Record<string, { label: string; icon: React.ReactNode; format?: 'percent' | 'duration' | 'number' }> = {
    // Instagram Reels
    ig_reels_avg_watch_time: { label: 'Avg Watch Time', icon: <Clock className="h-3.5 w-3.5" />, format: 'duration' },
    ig_reels_total_play_time: { label: 'Total Play Time', icon: <Clock className="h-3.5 w-3.5" />, format: 'duration' },
    clips_replays_count: { label: 'Replays', icon: <RefreshCw className="h-3.5 w-3.5" /> },
    ig_reels_video_view_total_time: { label: 'Total View Time', icon: <Clock className="h-3.5 w-3.5" />, format: 'duration' },
    plays: { label: 'Plays', icon: <RefreshCw className="h-3.5 w-3.5" /> },
    skip_rate: { label: 'Skip Rate', icon: <SkipForward className="h-3.5 w-3.5" />, format: 'percent' },

    // Instagram Stories
    taps_forward: { label: 'Taps Forward', icon: <ArrowRight className="h-3.5 w-3.5" /> },
    taps_back: { label: 'Taps Back', icon: <ArrowLeft className="h-3.5 w-3.5" /> },
    exits: { label: 'Exits', icon: <LogOut className="h-3.5 w-3.5" /> },
    replies: { label: 'Replies', icon: <Quote className="h-3.5 w-3.5" /> },

    // Threads
    reposts: { label: 'Reposts', icon: <Repeat className="h-3.5 w-3.5" /> },
    quotes: { label: 'Quotes', icon: <Quote className="h-3.5 w-3.5" /> },

    // Pinterest
    outbound_clicks: { label: 'Outbound Clicks', icon: <ExternalLink className="h-3.5 w-3.5" /> },
};

interface PlatformMetricsCardProps {
    /** The raw platformMetrics JSON object from PostAnalytics */
    metrics: Record<string, unknown> | null;
    /** Optional additional CSS classes */
    className?: string;
}

/** Format a metric value based on its type */
function formatValue(value: unknown, format?: string): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);

    if (format === 'percent') return `${(num * 100).toFixed(1)}%`;
    if (format === 'duration') {
        // Why: Duration comes in seconds from the API
        if (num >= 3600) return `${(num / 3600).toFixed(1)}h`;
        if (num >= 60) return `${(num / 60).toFixed(1)}m`;
        return `${num.toFixed(0)}s`;
    }
    return num.toLocaleString();
}

/**
 * Renders platform-specific metrics as a compact grid of stat pills.
 * Only shows metrics that have known display config — unknown keys are ignored.
 */
export function PlatformMetricsCard({ metrics, className }: PlatformMetricsCardProps) {
    if (!metrics || typeof metrics !== 'object') return null;

    const entries = Object.entries(metrics)
        .filter(([key, val]) => METRIC_CONFIG[key] && val !== null && val !== undefined)
        .map(([key, val]) => ({ key, config: METRIC_CONFIG[key], value: val }));

    if (entries.length === 0) return null;

    return (
        <div className={cn('rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4', className)}>
            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                Platform Insights
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {entries.map(({ key, config, value }) => (
                    <div
                        key={key}
                        className="flex items-center gap-2.5 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2.5"
                    >
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                            {config.icon}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-[var(--text-muted)] leading-none mb-0.5">{config.label}</p>
                            <p className="text-sm font-bold leading-none">{formatValue(value, config.format)}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
