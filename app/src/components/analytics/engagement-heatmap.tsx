'use client';

/**
 * Engagement Heatmap Component
 * Visual heatmap showing optimal posting times based on engagement
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Clock, Info } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

import { HeatmapCell } from '@/app/actions/analytics';

interface EngagementHeatmapProps {
    data: HeatmapCell[];
    /** Platform filter */
    platform?: string;
    className?: string;
}

// ============================================================================
// Constants & Helpers
// ============================================================================

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHour(hour: number): string {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    if (hour > 12) return `${hour - 12}pm`;
    return `${hour}am`;
}

function getHeatColor(value: number, max: number): string {
    const ratio = value / max;
    if (ratio < 0.2) return 'bg-gray-100 dark:bg-gray-800';
    if (ratio < 0.4) return 'bg-yellow-200 dark:bg-yellow-900/40';
    if (ratio < 0.6) return 'bg-orange-300 dark:bg-orange-900/60';
    if (ratio < 0.8) return 'bg-red-400 dark:bg-red-900/80';
    return 'bg-green-500 dark:bg-green-600';
}

function getOpacity(value: number, max: number): number {
    // Provide a minimum opacity so it's visible, scale up to 1
    return 0.4 + (value / max) * 0.6;
}

export function EngagementHeatmap({ data, platform, className }: EngagementHeatmapProps) {
    const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

    const maxValue = useMemo(() => Math.max(...data.map((d) => d.value)) || 1, [data]);

    const getCell = (day: number, hour: number): HeatmapCell | undefined => {
        return data.find((d) => d.day === day && d.hour === hour);
    };

    return (
        <div className={cn('card p-6', className)}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient">
                        <Clock className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-lg">Engagement Heatmap</h2>
                        <p className="text-sm text-[var(--text-muted)]">
                            Best times to post {platform ? `on ${platform}` : ''}
                        </p>
                    </div>
                </div>
            </div>

            {/* Heatmap Grid */}
            <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                    {/* Hour Labels */}
                    <div className="flex mb-1">
                        <div className="w-12" /> {/* Spacer for day labels */}
                        {HOURS.filter((h) => h % 3 === 0).map((hour) => (
                            <div
                                key={hour}
                                className="flex-1 text-xs text-[var(--text-muted)] text-center"
                                style={{ width: `${100 / 8}%` }}
                            >
                                {formatHour(hour)}
                            </div>
                        ))}
                    </div>

                    {/* Grid Rows */}
                    {DAYS.map((day, dayIndex) => (
                        <div key={day} className="flex items-center gap-1 mb-1">
                            {/* Day Label */}
                            <div className="w-12 text-xs text-[var(--text-muted)] text-right pr-2">
                                {day}
                            </div>

                            {/* Hour Cells */}
                            <div className="flex-1 flex gap-px">
                                {HOURS.map((hour) => {
                                    const cell = getCell(dayIndex, hour);

                                    // Empty cell if no data
                                    if (!cell) {
                                        return (
                                            <div
                                                key={hour}
                                                className="flex-1 h-6 rounded-sm bg-gray-50 dark:bg-gray-900"
                                            />
                                        );
                                    }

                                    return (
                                        <div
                                            key={hour}
                                            className={cn(
                                                'flex-1 h-6 rounded-sm cursor-pointer transition-all',
                                                getHeatColor(cell.value, maxValue),
                                                hoveredCell === cell && 'ring-2 ring-[var(--text-primary)] relative z-10'
                                            )}
                                            style={{ opacity: getOpacity(cell.value, maxValue) }}
                                            onMouseEnter={() => setHoveredCell(cell)}
                                            onMouseLeave={() => setHoveredCell(null)}
                                            title={`${DAYS[cell.day]} ${formatHour(cell.hour)}: ${cell.value}% engagement`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border)]">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">Low</span>
                    <div className="flex gap-1">
                        <div className="w-4 h-4 rounded-sm bg-gray-100 dark:bg-gray-800" />
                        <div className="w-4 h-4 rounded-sm bg-yellow-200 dark:bg-yellow-900/40" />
                        <div className="w-4 h-4 rounded-sm bg-orange-300 dark:bg-orange-900/60" />
                        <div className="w-4 h-4 rounded-sm bg-red-400 dark:bg-red-900/80" />
                        <div className="w-4 h-4 rounded-sm bg-green-500 dark:bg-green-600" />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">High</span>
                </div>

                <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <Info className="w-3 h-3" />
                    Based on last 30 days
                </div>
            </div>

            {/* Hover Details */}
            {hoveredCell && (
                <div className="mt-4 p-3 rounded-lg bg-[var(--bg-tertiary)] slide-up-fade">
                    <p className="text-sm">
                        <strong>{DAYS[hoveredCell.day]}</strong> at <strong>{formatHour(hoveredCell.hour)}</strong>
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Engagement score: <span className="font-medium text-[var(--accent-gold)]">{hoveredCell.value}%</span>
                    </p>
                </div>
            )}
        </div>
    );
}
