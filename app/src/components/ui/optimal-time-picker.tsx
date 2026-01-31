/**
 * Optimal Time Picker Component
 * AI-suggested time slots for posting with reach improvement indicators
 */

'use client';

import { cn } from '@/lib/utils';
import { Clock, TrendingUp, Sparkles } from 'lucide-react';

export interface TimeSlot {
    id: string;
    /** Time in 24h format, e.g., "14:30" */
    time: string;
    /** Day of week, e.g., "Monday" */
    day: string;
    /** Predicted reach improvement percentage */
    reachImprovement: number;
    /** Whether this is an AI-recommended slot */
    isAiRecommended?: boolean;
    /** Platform-specific, e.g., "instagram", "tiktok" */
    platform?: string;
}

interface OptimalTimePickerProps {
    slots: TimeSlot[];
    selectedId?: string;
    onSelect: (slot: TimeSlot) => void;
    className?: string;
}

/**
 * Displays AI-recommended time slots with reach improvement indicators.
 * Color-coded: green for +30%, yellow for +15%, neutral otherwise.
 */
export function OptimalTimePicker({
    slots,
    selectedId,
    onSelect,
    className,
}: OptimalTimePickerProps) {
    // Sort by reach improvement (highest first)
    const sortedSlots = [...slots].sort((a, b) => b.reachImprovement - a.reachImprovement);

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
                Best Times to Post
            </div>
            <div className="space-y-1.5">
                {sortedSlots.map((slot) => (
                    <TimeSlotItem
                        key={slot.id}
                        slot={slot}
                        isSelected={slot.id === selectedId}
                        onSelect={() => onSelect(slot)}
                    />
                ))}
            </div>
        </div>
    );
}

interface TimeSlotItemProps {
    slot: TimeSlot;
    isSelected: boolean;
    onSelect: () => void;
}

function TimeSlotItem({ slot, isSelected, onSelect }: TimeSlotItemProps) {
    const getImprovementColor = (improvement: number) => {
        if (improvement >= 30) return 'text-[var(--success)]';
        if (improvement >= 15) return 'text-[var(--warning)]';
        return 'text-[var(--text-muted)]';
    };

    const getImprovementBg = (improvement: number) => {
        if (improvement >= 30) return 'bg-[var(--success-light)]';
        if (improvement >= 15) return 'bg-[var(--warning-light)]';
        return 'bg-[var(--bg-tertiary)]';
    };

    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg border transition-all',
                'hover:border-[var(--accent-gold)] active:scale-[0.98]',
                isSelected
                    ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)]'
            )}
        >
            {/* Time Icon */}
            <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                isSelected ? 'bg-[var(--accent-gold)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            )}>
                <Clock className="h-5 w-5" />
            </div>

            {/* Time Info */}
            <div className="flex-1 text-left">
                <p className="font-medium text-[var(--text-primary)]">
                    {formatTime(slot.time)}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                    {slot.day}
                    {slot.platform && ` • ${slot.platform}`}
                </p>
            </div>

            {/* Reach Improvement Badge */}
            <div className={cn(
                'flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                getImprovementBg(slot.reachImprovement),
                getImprovementColor(slot.reachImprovement)
            )}>
                <TrendingUp className="h-3 w-3" />
                +{slot.reachImprovement}%
            </div>

            {/* AI Badge */}
            {slot.isAiRecommended && (
                <div className="flex items-center gap-0.5 text-[var(--accent-gold)]">
                    <Sparkles className="h-3.5 w-3.5" />
                </div>
            )}
        </button>
    );
}

/** Formats 24h time to 12h format with AM/PM */
function formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}
