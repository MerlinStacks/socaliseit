/**
 * Video Performance Card
 * Why: Aggregates video-specific metrics (watch time, avg watch %,
 * replays, skip rate) from PostAnalytics to give creators a dedicated
 * view of how their Reels/TikToks/YouTube Shorts are performing.
 */

'use client';

import { Play, Clock, SkipForward, RefreshCw, Film } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface VideoPerformanceData {
    totalVideoViews: number;
    totalWatchTimeSeconds: number;
    avgWatchPercentage: number;
    totalReplays: number;
    avgSkipRate: number;
    videoCount: number;
}

interface VideoPerformanceCardProps {
    data: VideoPerformanceData;
}

/** Format seconds into human-readable duration */
function formatDuration(seconds: number): string {
    if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
    if (seconds >= 60) return `${(seconds / 60).toFixed(0)}m`;
    return `${seconds.toFixed(0)}s`;
}

/** Format large numbers compactly */
function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/** Single metric row inside the card */
function MetricRow({ icon, label, value, accent }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    accent?: string;
}) {
    return (
        <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2.5">
                <div className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg',
                    accent || 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                )}>
                    {icon}
                </div>
                <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
            </div>
            <span className="text-sm font-bold">{value}</span>
        </div>
    );
}

/**
 * Compact video performance card for the analytics dashboard.
 * Only renders when there's at least 1 video post.
 */
export function VideoPerformanceCard({ data }: VideoPerformanceCardProps) {
    if (data.videoCount === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4"
        >
            <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10">
                    <Film className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold">Video Performance</h3>
                    <p className="text-[10px] text-[var(--text-muted)]">{data.videoCount} video{data.videoCount !== 1 ? 's' : ''} in period</p>
                </div>
            </div>

            <div className="divide-y divide-[var(--border)]">
                <MetricRow
                    icon={<Play className="h-3.5 w-3.5" />}
                    label="Total Views"
                    value={fmt(data.totalVideoViews)}
                    accent="bg-blue-500/10 text-blue-400"
                />
                <MetricRow
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Total Watch Time"
                    value={formatDuration(data.totalWatchTimeSeconds)}
                    accent="bg-emerald-500/10 text-emerald-400"
                />
                {data.avgWatchPercentage > 0 && (
                    <MetricRow
                        icon={<Play className="h-3.5 w-3.5" />}
                        label="Avg Watch %"
                        value={`${data.avgWatchPercentage.toFixed(1)}%`}
                        accent="bg-amber-500/10 text-amber-400"
                    />
                )}
                {data.totalReplays > 0 && (
                    <MetricRow
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        label="Replays"
                        value={fmt(data.totalReplays)}
                        accent="bg-indigo-500/10 text-indigo-400"
                    />
                )}
                {data.avgSkipRate > 0 && (
                    <MetricRow
                        icon={<SkipForward className="h-3.5 w-3.5" />}
                        label="Avg Skip Rate"
                        value={`${(data.avgSkipRate * 100).toFixed(1)}%`}
                        accent="bg-red-500/10 text-red-400"
                    />
                )}
            </div>
        </motion.div>
    );
}
