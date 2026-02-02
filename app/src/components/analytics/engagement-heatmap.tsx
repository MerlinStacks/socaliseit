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

interface HeatmapCell {
    day: number;
    hour: number;
    value: number;
}

interface EngagementHeatmapProps {
    /** Platform filter */
    platform?: string;
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ============================================================================
// Helper Functions
// ============================================================================

function formatHour(hour: number): string {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}${ampm}`;
}

function getHeatColor(value: number, max: number): string {
    const intensity = value / max;

    if (intensity >= 0.8) return 'bg-[var(--success)]';
    if (intensity >= 0.6) return 'bg-[var(--accent-gold)]';
    if (intensity >= 0.4) return 'bg-[var(--accent-pink)]';
    if (intensity >= 0.2) return 'bg-[var(--warning)]';
    return 'bg-[var(--border)]';
}

function getOpacity(value: number, max: number): number {
    return Math.max(0.3, value / max);
}

// ============================================================================
// Mock Data Generator
// ============================================================================

function generateHeatmapData(): HeatmapCell[] {
    const data: HeatmapCell[] = [];

    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            let baseValue = 20;

            // Morning peak (7-9 AM on weekdays)
            if (hour >= 7 && hour <= 9 && day >= 1 && day <= 5) {
                baseValue = 70 + Math.random() * 20;
            }
            // Lunch peak (12-1 PM)
            else if (hour >= 12 && hour <= 13) {
                baseValue = 60 + Math.random() * 15;
            }
            // Evening peak (6-9 PM)
            else if (hour >= 18 && hour <= 21) {
                baseValue = 80 + Math.random() * 20;
            }
            // Weekend afternoons
            else if ((day === 0 || day === 6) && hour >= 14 && hour <= 18) {
                baseValue = 65 + Math.random() * 15;
            }
            // Late night
            else if (hour >= 22 || hour <= 5) {
                baseValue = 10 + Math.random() * 15;
            }
            // Off-peak
            else {
                baseValue = 25 + Math.random() * 20;
            }

            data.push({
                day,
                hour,
                value: Math.round(baseValue),
            });
        }
    }

    return data;
}

// ============================================================================
// Main Component
// ============================================================================

export function EngagementHeatmap({ platform, className }: EngagementHeatmapProps) {
    const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

    const data = useMemo(() => generateHeatmapData(), []);
    const maxValue = useMemo(() => Math.max(...data.map((d) => d.value)), [data]);

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
                                    if (!cell) return null;

                                    return (
                                        <div
                                            key={hour}
                                            className={cn(
                                                'flex-1 h-6 rounded-sm cursor-pointer transition-all',
                                                getHeatColor(cell.value, maxValue),
                                                hoveredCell === cell && 'ring-2 ring-[var(--text-primary)]'
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
                        <div className="w-4 h-4 rounded-sm bg-[var(--border)]" />
                        <div className="w-4 h-4 rounded-sm bg-[var(--warning)] opacity-50" />
                        <div className="w-4 h-4 rounded-sm bg-[var(--accent-pink)] opacity-70" />
                        <div className="w-4 h-4 rounded-sm bg-[var(--accent-gold)] opacity-85" />
                        <div className="w-4 h-4 rounded-sm bg-[var(--success)]" />
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
                <div className="mt-4 p-3 rounded-lg bg-[var(--bg-tertiary)]">
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
