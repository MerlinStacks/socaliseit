/**
 * Best Time to Post Card
 * Shows the top 3 predicted posting slots from historical engagement data.
 *
 * Why: The engagement predictor and heatmap already compute best times
 * server-side, but this was never surfaced as a user-friendly summary card.
 */

'use client';

import { Zap, Clock } from 'lucide-react';

interface BestTimeSlot {
    day: string;
    hour: string;
    score: number;
}

interface BestTimeCardProps {
    slots: BestTimeSlot[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Derive best time slots from the engagement heatmap data.
 * Why: Reuses heatmap data already fetched instead of a separate query.
 */
export function deriveBestSlots(
    heatmapData: Array<{ day: number; hour: number; value: number }>
): BestTimeSlot[] {
    return heatmapData
        .filter(cell => cell.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map(cell => ({
            day: DAY_NAMES[cell.day] || 'Unknown',
            hour: formatHour(cell.hour),
            score: cell.value,
        }));
}

/** Format 24h number to 12h AM/PM */
function formatHour(h: number): string {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/**
 * Renders a compact card showing the top 3 best times to post.
 */
export function BestTimeCard({ slots }: BestTimeCardProps) {
    if (slots.length === 0) {
        return (
            <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-4 w-4 text-[var(--accent-gold)]" />
                    <h3 className="font-semibold text-sm">Best Times to Post</h3>
                </div>
                <div className="flex h-20 items-center justify-center">
                    <p className="text-sm text-[var(--text-muted)] text-center px-2">Post more to unlock best-time insights (10+ published posts needed)</p>
                </div>
            </div>
        );
    }

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
                <Zap className="h-4 w-4 text-[var(--accent-gold)]" />
                <h3 className="font-semibold text-sm">Best Times to Post</h3>
            </div>
            <div className="space-y-3">
                {slots.map((slot, i) => (
                    <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border)] px-3 py-2.5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                                <Clock className="h-4 w-4 text-[var(--accent-gold)]" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">{slot.day}</p>
                                <p className="text-xs text-[var(--text-muted)]">{slot.hour}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-[var(--accent-gold)]">
                                {slot.score.toFixed(1)}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">score</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
