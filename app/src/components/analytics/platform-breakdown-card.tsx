/**
 * Platform Breakdown Card
 * Why: Shows engagement distribution across connected platforms as a
 * horizontal bar chart. Lets users see which platform drives the most
 * engagement at a glance.
 */

'use client';

import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Hex brand colors for bar chart rendering */
const BAR_COLORS: Record<string, string> = {
    instagram: '#E1306C', facebook: '#1877F2', youtube: '#FF0000',
    tiktok: '#00F2EA', pinterest: '#E60023', linkedin: '#0A66C2',
    bluesky: '#0085FF', threads: '#000000', google_business: '#4285F4',
};

export interface PlatformBreakdownEntry {
    platform: string;
    totalEngagement: number;
    postCount: number;
    avgEngagementRate: number;
}

interface PlatformBreakdownCardProps {
    data: PlatformBreakdownEntry[];
}

/** Format large numbers compactly */
function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/** Platform display names */
const LABELS: Record<string, string> = {
    instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube',
    tiktok: 'TikTok', pinterest: 'Pinterest', linkedin: 'LinkedIn',
    bluesky: 'Bluesky', threads: 'Threads', google_business: 'Google',
};

/**
 * Horizontal bar chart showing total engagement per platform.
 * Only renders when there's data for at least one platform.
 */
export function PlatformBreakdownCard({ data }: PlatformBreakdownCardProps) {
    if (data.length === 0) return null;

    const maxEngagement = Math.max(...data.map(d => d.totalEngagement), 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4"
        >
            <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-gold-light)]">
                    <BarChart3 className="h-4 w-4 text-[var(--accent-gold)]" />
                </div>
                <h3 className="text-sm font-semibold">Platform Breakdown</h3>
            </div>

            <div className="space-y-3">
                {data.map((entry) => {
                    const pct = (entry.totalEngagement / maxEngagement) * 100;
                    const color = BAR_COLORS[entry.platform] || '#888';
                    const label = LABELS[entry.platform] || entry.platform;

                    return (
                        <div key={entry.platform}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: color }}
                                    />
                                    <span className="text-xs font-medium">{label}</span>
                                    <span className="text-[10px] text-[var(--text-muted)]">
                                        {entry.postCount} post{entry.postCount !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold">{fmt(entry.totalEngagement)}</span>
                                    <span className={cn(
                                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                                        entry.avgEngagementRate >= 3
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : entry.avgEngagementRate >= 1
                                                ? 'bg-amber-500/10 text-amber-400'
                                                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                                    )}>
                                        {entry.avgEngagementRate.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                            <div className="h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.6, ease: 'easeOut' }}
                                    className="h-full rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
}
