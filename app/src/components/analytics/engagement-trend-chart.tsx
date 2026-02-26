/**
 * Engagement Trend Chart
 * Multi-series area chart showing likes, comments, shares and engagement rate over time.
 * Redesigned to use Recharts for beautiful, animated gradients and interactive tooltips.
 */

'use client';

import { BarChart3 } from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import type { EngagementTimelinePoint } from '@/app/(dashboard)/analytics/analytics-data';

interface EngagementTrendChartProps {
    data: EngagementTimelinePoint[];
    hasPosts: boolean;
}

const SERIES = [
    { key: 'likes' as const, label: 'Likes', color1: '#ec4899', color2: '#f472b6' },      // Pink
    { key: 'comments' as const, label: 'Comments', color1: '#3b82f6', color2: '#60a5fa' }, // Blue
    { key: 'shares' as const, label: 'Shares', color1: '#22c55e', color2: '#4ade80' },     // Green
];

/** Custom Tooltip with glassmorphism */
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/90 backdrop-blur-md p-3 shadow-xl">
                <p className="font-semibold text-sm mb-2">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-xs font-medium mb-1">
                        <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.stroke }}
                        />
                        <span className="capitalize text-[var(--text-secondary)]">{entry.name}:</span>
                        <span>{entry.value.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export function EngagementTrendChart({ data, hasPosts }: EngagementTrendChartProps) {
    if (!hasPosts || data.length === 0) {
        return (
            <div className="card p-5 h-full flex flex-col">
                <div className="mb-6">
                    <h3 className="font-semibold">Engagement Trend</h3>
                    <p className="text-sm text-[var(--text-muted)]">Likes, comments &amp; shares per day</p>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <BarChart3 className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                        <p className="text-sm text-[var(--text-secondary)]">No engagement data yet</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="card p-5 flex flex-col h-full">
            <div className="mb-6">
                <h3 className="font-semibold">Engagement Trend</h3>
                <p className="text-sm text-[var(--text-muted)]">Likes, comments &amp; shares per day</p>
            </div>

            <div className="flex-1 min-h-[250px] w-full mt-2 relative">
                <div className="absolute inset-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                {SERIES.map((s) => (
                                    <linearGradient key={s.key} id={`color-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={s.color1} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={s.color2} stopOpacity={0} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="var(--border)"
                                opacity={0.4}
                            />
                            <XAxis
                                dataKey="day"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                            {/* Render Areas from back to front (bottom to top in code) */}
                            {SERIES.slice().reverse().map((s) => (
                                <Area
                                    key={s.key}
                                    type="monotone"
                                    dataKey={s.key}
                                    name={s.label}
                                    stroke={s.color1}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill={`url(#color-${s.key})`}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
