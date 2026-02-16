/**
 * Follower Growth Chart
 * Multi-line chart showing follower count over time per connected account.
 *
 * Why: PlatformAnalytics stores daily follower snapshots per account,
 * but this was never visualized. Users need to see growth trends to
 * understand which platforms are gaining traction.
 */

'use client';

import { Users } from 'lucide-react';
import type { AccountTimeline } from '@/app/(dashboard)/analytics/analytics-data';

/** Platform colour mapping for chart lines */
const PLATFORM_COLORS: Record<string, string> = {
    instagram: '#E1306C',
    facebook: '#1877F2',
    tiktok: '#000000',
    youtube: '#FF0000',
    pinterest: '#E60023',
    linkedin: '#0A66C2',
    twitter: '#1DA1F2',
    bluesky: '#0085FF',
    google_business: '#34A853',
};

interface FollowerGrowthChartProps {
    accounts: AccountTimeline[];
}

/**
 * Renders a multi-line follower growth chart with one line per connected account.
 * Uses pure CSS/HTML — each line is drawn via SVG polyline for smooth rendering.
 */
export function FollowerGrowthChart({ accounts }: FollowerGrowthChartProps) {
    if (accounts.length === 0 || accounts.every(a => a.timeline.length === 0)) {
        return (
            <div className="card p-5">
                <h3 className="font-semibold mb-1">Follower Growth</h3>
                <p className="text-sm text-[var(--text-muted)] mb-6">Track growth across platforms</p>
                <div className="flex h-48 items-center justify-center">
                    <div className="text-center">
                        <Users className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                        <p className="text-sm text-[var(--text-secondary)]">No follower data synced yet</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Hit Sync to pull latest metrics</p>
                    </div>
                </div>
            </div>
        );
    }

    /* Compute global min/max for Y axis */
    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (const acct of accounts) {
        for (const pt of acct.timeline) {
            if (pt.followers < globalMin) globalMin = pt.followers;
            if (pt.followers > globalMax) globalMax = pt.followers;
        }
    }
    /* Add 10% padding so lines don't hit edges */
    const range = globalMax - globalMin || 1;
    const yMin = Math.max(0, globalMin - range * 0.1);
    const yMax = globalMax + range * 0.1;

    const chartW = 600;
    const chartH = 200;

    /* Max timeline length across all accounts */
    const maxPoints = Math.max(...accounts.map(a => a.timeline.length));

    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h3 className="font-semibold">Follower Growth</h3>
                    <p className="text-sm text-[var(--text-muted)]">Track growth across platforms</p>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 flex-wrap justify-end">
                    {accounts.map(acct => (
                        <div key={acct.id} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                            <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: PLATFORM_COLORS[acct.platform] || '#6B7280' }}
                            />
                            <span>{acct.name}</span>
                            <span className="text-[var(--text-muted)]">
                                ({formatCompact(acct.currentFollowers)})
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="overflow-hidden">
                <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    className="w-full h-48"
                    preserveAspectRatio="none"
                >
                    {/* Grid lines */}
                    {[0.25, 0.5, 0.75].map(pct => (
                        <line
                            key={pct}
                            x1={0} x2={chartW}
                            y1={chartH * pct} y2={chartH * pct}
                            stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 4"
                        />
                    ))}

                    {/* Account lines */}
                    {accounts.map(acct => {
                        if (acct.timeline.length < 2) return null;
                        const color = PLATFORM_COLORS[acct.platform] || '#6B7280';
                        const points = acct.timeline.map((pt, i) => {
                            const x = (i / (maxPoints - 1)) * chartW;
                            const y = chartH - ((pt.followers - yMin) / (yMax - yMin)) * chartH;
                            return `${x},${y}`;
                        }).join(' ');

                        return (
                            <polyline
                                key={acct.id}
                                points={points}
                                fill="none"
                                stroke={color}
                                strokeWidth={2.5}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
            </div>

            {/* X axis labels */}
            <div className="flex justify-between mt-2 text-xs text-[var(--text-muted)]">
                {accounts[0]?.timeline.length > 0 && (
                    <>
                        <span>{accounts[0].timeline[0]?.date}</span>
                        <span>{accounts[0].timeline[accounts[0].timeline.length - 1]?.date}</span>
                    </>
                )}
            </div>
        </div>
    );
}

/** Format large numbers compactly (e.g. 12500 → 12.5K) */
function formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}
