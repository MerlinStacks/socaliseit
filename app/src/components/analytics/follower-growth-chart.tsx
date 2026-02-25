/**
 * Follower Growth Chart
 * Multi-line chart showing follower count over time per connected account.
 * Upgraded to Recharts with predictive growth projections.
 */

'use client';

import { Users, TrendingUp } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import type { AccountTimeline, TimelinePoint } from '@/app/(dashboard)/analytics/analytics-data';
import { format, addDays, parseISO } from 'date-fns';

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

/** Custom Tooltip */
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/90 backdrop-blur-md p-3 shadow-xl max-w-[200px]">
                <p className="font-semibold text-sm mb-2">{label}</p>
                {payload.map((entry: any, index: number) => {
                    const isPrediction = entry.dataKey.includes('_predicted');
                    return (
                        <div key={index} className="flex items-center justify-between gap-3 text-xs font-medium mb-1">
                            <div className="flex items-center gap-2">
                                <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: entry.stroke, opacity: isPrediction ? 0.5 : 1 }}
                                />
                                <span className={`truncate ${isPrediction ? 'text-[var(--accent-gold)] italic' : 'text-[var(--text-secondary)] capitalize'}`}>
                                    {isPrediction ? 'Predicted' : entry.name}
                                </span>
                            </div>
                            <span>{entry.value.toLocaleString()}</span>
                        </div>
                    );
                })}
            </div>
        );
    }
    return null;
};

/** Normalizes the timeline data array so all accounts share the same X-axis days + projections */
function processChartData(accounts: AccountTimeline[]) {
    if (accounts.length === 0) return [];

    // 1. Gather all unique dates
    const dateSet = new Set<string>();
    accounts.forEach(acc => acc.timeline.forEach(pt => dateSet.add(pt.date)));

    const sortedDates = Array.from(dateSet).sort();
    if (sortedDates.length === 0) return [];

    // 2. Build the historical data points
    const dataPoints: Record<string, any>[] = sortedDates.map(date => {
        const point: any = { date, isPrediction: false };
        accounts.forEach(acc => {
            const match = acc.timeline.find(pt => pt.date === date);
            if (match) point[acc.id] = match.followers;
        });
        return point;
    });

    // 3. Simple Linear Projection (Next 7 Data Points)
    if (dataPoints.length > 2) {
        const lastDate = sortedDates[sortedDates.length - 1];
        const parsedLastDate = new Date(lastDate); // assuming 'YYYY-MM-DD' or simple string that new Date() can parse.
        // Fallback for rough math if it's just 'Jan 1' string format from API
        const isRealDate = !isNaN(parsedLastDate.getTime());

        for (let i = 1; i <= 7; i++) {
            const nextDateStr = isRealDate
                ? format(addDays(parsedLastDate, i), 'MMM d')
                : `+${i}d`;

            const futurePoint: any = { date: nextDateStr, isPrediction: true };

            accounts.forEach(acc => {
                // Calculate average daily velocity over the available timeline
                const t = acc.timeline;
                if (t.length >= 2) {
                    const first = t[0].followers;
                    const last = t[t.length - 1].followers;
                    const dailyVelocity = (last - first) / t.length;

                    futurePoint[`${acc.id}_predicted`] = Math.round(last + (dailyVelocity * i));

                    // Link the first prediction point securely to the last actual point for continuous line
                    if (i === 1) {
                        dataPoints[dataPoints.length - 1][`${acc.id}_predicted`] = last;
                    }
                }
            });
            dataPoints.push(futurePoint);
        }
    }

    return dataPoints;
}


export function FollowerGrowthChart({ accounts }: FollowerGrowthChartProps) {
    if (accounts.length === 0 || accounts.every(a => a.timeline.length === 0)) {
        return (
            <div className="card p-5 h-full flex flex-col">
                <div className="mb-6">
                    <h3 className="font-semibold flex items-center gap-2">
                        Follower Growth <TrendingUp className="h-4 w-4 text-[var(--accent-gold)]" />
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">Track growth and predict future reach</p>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <Users className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                        <p className="text-sm text-[var(--text-secondary)]">No follower data synced yet</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Hit Sync to pull latest metrics</p>
                    </div>
                </div>
            </div>
        );
    }

    const chartData = processChartData(accounts);

    return (
        <div className="card p-5 flex flex-col h-full">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h3 className="font-semibold flex items-center gap-2">
                        Follower Growth <span className="text-[10px] bg-[var(--accent-gold)]/20 text-[var(--accent-gold)] px-2 py-0.5 rounded-full font-bold ml-2">PRO</span>
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">Track historical performance and predicted 7-day trajectory</p>
                </div>
                {/* Custom Compact Legend */}
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {accounts.map(acct => (
                        <div key={acct.id} className="flex items-center gap-1.5 text-xs font-medium bg-[var(--bg-tertiary)] px-2 py-1 rounded-md">
                            <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: PLATFORM_COLORS[acct.platform] || '#6B7280' }}
                            />
                            <span className="capitalize">{acct.platform}</span>
                            <span className="text-[var(--text-muted)]">
                                {formatCompact(acct.currentFollowers)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-[250px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="var(--border)"
                            opacity={0.4}
                        />
                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            tickFormatter={formatCompact}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }} />

                        {/* Render Historical Lines */}
                        {accounts.map(acct => {
                            const color = PLATFORM_COLORS[acct.platform] || '#6B7280';
                            return (
                                <Line
                                    key={acct.id}
                                    type="monotone"
                                    dataKey={acct.id}
                                    name={acct.name}
                                    stroke={color}
                                    strokeWidth={3}
                                    dot={chartData.length === 1 ? { r: 4, strokeWidth: 0, fill: color } : false}
                                    activeDot={{ r: 5, strokeWidth: 0, fill: color }}
                                />
                            );
                        })}

                        {/* Render Predictive Segment Lines */}
                        {accounts.map(acct => {
                            const color = PLATFORM_COLORS[acct.platform] || '#6B7280';
                            return (
                                <Line
                                    key={`${acct.id}_pred`}
                                    type="monotone"
                                    dataKey={`${acct.id}_predicted`}
                                    name={`${acct.name} (Predicted)`}
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                                />
                            );
                        })}

                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/** Format large numbers compactly (e.g. 12500 → 12.5K) */
function formatCompact(n: number | string): string {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (isNaN(num)) return n.toString();
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}
