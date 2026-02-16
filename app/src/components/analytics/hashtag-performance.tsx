/**
 * Hashtag Performance Table
 * Ranked list of hashtags by average engagement rate.
 *
 * Why: Users need to know which hashtags actually drive engagement
 * vs which are just habit. This correlates PostHashtag data with
 * PostAnalytics to surface the winners.
 */

'use client';

import { Hash, TrendingUp } from 'lucide-react';
import type { HashtagPerformanceEntry } from '@/app/(dashboard)/analytics/analytics-data';

interface HashtagPerformanceProps {
    data: HashtagPerformanceEntry[];
}

/**
 * Ranked hashtag table with engagement rate, reach, and usage count.
 */
export function HashtagPerformance({ data }: HashtagPerformanceProps) {
    if (data.length === 0) {
        return (
            <div className="card p-5">
                <div className="flex items-center gap-2 mb-1">
                    <Hash className="h-4 w-4 text-blue-500" />
                    <h3 className="font-semibold">Top Hashtags</h3>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                    Add hashtags to your posts to see which ones drive the most engagement.
                </p>
            </div>
        );
    }

    const maxRate = Math.max(...data.map(d => d.avgEngagementRate), 1);

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
                <Hash className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold">Top Hashtags</h3>
                <span className="ml-auto text-xs text-[var(--text-muted)]">
                    By avg engagement
                </span>
            </div>

            <div className="space-y-2">
                {data.map((entry, i) => (
                    <div
                        key={entry.tag}
                        className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2"
                    >
                        {/* Rank */}
                        <span className="text-xs font-bold text-[var(--text-muted)] w-5 text-center">
                            {i + 1}
                        </span>

                        {/* Tag + bar */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium truncate">{entry.tag}</span>
                                <span className="text-xs text-[var(--text-muted)] ml-2 flex-shrink-0">
                                    {entry.avgEngagementRate.toFixed(2)}%
                                </span>
                            </div>
                            <div className="h-1 rounded-full bg-[var(--bg-primary)]">
                                <div
                                    className="h-full rounded-full bg-blue-500 transition-all"
                                    style={{ width: `${(entry.avgEngagementRate / maxRate) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] flex-shrink-0">
                            <span title="Times used">{entry.usageCount}×</span>
                            <span title="Total reach">{formatCompactNum(entry.totalReach)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function formatCompactNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}
