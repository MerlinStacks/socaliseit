/**
 * AI Slot Indicator Component
 * Shows subtle visual indicator for AI-recommended posting times
 * 
 * Why: Helps users identify optimal posting windows at a glance
 * without cluttering the calendar interface.
 */

'use client';

import { Sparkles, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiRecommendedSlot } from '@/hooks/use-ai-recommended-slots';

interface AiSlotIndicatorProps {
    /** The AI-recommended slot data */
    slot: AiRecommendedSlot;
    /** Whether to show compact version (icon only) */
    compact?: boolean;
    /** Click handler to create a post at this time */
    onClick?: () => void;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Displays a subtle indicator for AI-recommended posting times.
 * Shows a faded sparkle icon with tooltip on hover.
 */
export function AiSlotIndicator({
    slot,
    compact = false,
    onClick,
    className,
}: AiSlotIndicatorProps) {
    const formattedTime = formatTime(slot.hour, slot.minute);

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group flex items-center gap-1.5 rounded-md transition-all',
                'opacity-40 hover:opacity-80',
                'text-[var(--accent-gold)]',
                compact ? 'p-1' : 'px-2 py-1',
                onClick && 'cursor-pointer hover:bg-[var(--accent-gold)]/10',
                className
            )}
            title={`Best time to post – ${formattedTime}\n${slot.reason}`}
            aria-label={`AI recommends posting at ${formattedTime}: ${slot.reason}`}
        >
            <Sparkles className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />

            {!compact && (
                <span className="text-xs font-medium">
                    {formattedTime}
                </span>
            )}

            {/* Tooltip on hover */}
            <div className={cn(
                'absolute left-full ml-2 z-50 hidden group-hover:block',
                'whitespace-nowrap rounded-lg px-3 py-2',
                'bg-[var(--bg-primary)] border border-[var(--border)] shadow-lg',
                'text-xs text-[var(--text-primary)]'
            )}>
                <div className="flex items-center gap-1.5 font-medium">
                    <Sparkles className="h-3 w-3 text-[var(--accent-gold)]" />
                    Best time to post
                </div>
                <p className="mt-1 text-[var(--text-muted)]">
                    {slot.reason}
                </p>
                <p className="mt-0.5 text-[var(--success)]">
                    +{slot.reachImprovement}% reach
                </p>
            </div>
        </button>
    );
}

/**
 * Inline AI recommendation badge for empty slots
 */
export function AiSlotBadge({
    slot,
    onClick,
    className,
}: Omit<AiSlotIndicatorProps, 'compact'>) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5',
                'bg-[var(--accent-gold)]/5 text-[var(--accent-gold)]',
                'opacity-50 hover:opacity-100 transition-opacity',
                'text-xs',
                className
            )}
            title={`${slot.reason} • +${slot.reachImprovement}% reach`}
        >
            <Sparkles className="h-2.5 w-2.5" />
            <span>AI</span>
        </button>
    );
}

/**
 * Format hour/minute to display time
 */
function formatTime(hour: number, minute: number): string {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: minute > 0 ? '2-digit' : undefined,
        hour12: true,
    });
}
