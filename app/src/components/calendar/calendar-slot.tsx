/**
 * Calendar Slot Component
 * Unified slot component with click-to-create, drop zone, and AI recommendations
 * 
 * Why: Provides consistent interaction patterns across all calendar views
 * with visual feedback for create, drop, and AI-recommended slots.
 */

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiSlotBadge } from './ai-slot-indicator';
import { AiRecommendedSlot } from '@/hooks/use-ai-recommended-slots';

interface CalendarSlotProps {
    /** The date for this slot */
    date: Date;
    /** Hour in 24h format (0-23) */
    hour: number;
    /** Whether this slot is currently a drag target */
    isDropTarget?: boolean;
    /** Whether this slot is currently being hovered during drag */
    isDropHover?: boolean;
    /** AI recommendation data if this is a recommended slot */
    aiSlot?: AiRecommendedSlot | null;
    /** Click handler to create new post */
    onSlotClick?: () => void;
    /** Drag over handler */
    onDragOver?: (e: React.DragEvent) => void;
    /** Drag leave handler */
    onDragLeave?: () => void;
    /** Drop handler */
    onDrop?: (e: React.DragEvent) => void;
    /** Additional CSS classes */
    className?: string;
    /** Child elements (post cards) */
    children?: React.ReactNode;
}

/**
 * Calendar time slot with unified interaction patterns.
 * Shows "+" on hover, highlights as drop zone, displays AI recommendations.
 */
export function CalendarSlot({
    date,
    hour,
    isDropTarget = false,
    isDropHover = false,
    aiSlot,
    onSlotClick,
    onDragOver,
    onDragLeave,
    onDrop,
    className,
    children,
}: CalendarSlotProps) {
    const [isHovered, setIsHovered] = useState(false);
    const hasChildren = !!children && (Array.isArray(children) ? children.length > 0 : true);
    const showCreateButton = isHovered && !hasChildren && onSlotClick;
    const showAiIndicator = !hasChildren && aiSlot && !isHovered;

    return (
        <div
            className={cn(
                'relative min-h-[60px] p-2 transition-all',
                'border-l border-[var(--border)]',
                // Drop zone highlighting
                isDropTarget && 'bg-[var(--accent-gold)]/5',
                isDropHover && 'bg-[var(--accent-gold)]/15 ring-2 ring-[var(--accent-gold)] ring-inset',
                // Hover state for creating
                isHovered && !isDropTarget && 'bg-[var(--bg-tertiary)]/50',
                // Cursor
                onSlotClick && 'cursor-pointer',
                className
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(e) => {
                // Only trigger if clicking on the slot itself, not on children
                if (e.target === e.currentTarget && onSlotClick) {
                    onSlotClick();
                }
            }}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver?.(e);
            }}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            data-testid="calendar-slot"
            data-date={date.toISOString()}
            data-hour={hour}
            role="button"
            tabIndex={onSlotClick ? 0 : undefined}
            onKeyDown={(e) => {
                if (onSlotClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSlotClick();
                }
            }}
            aria-label={`Time slot at ${formatHour(hour)} on ${date.toLocaleDateString()}`}
        >
            {/* Post cards */}
            {children}

            {/* AI Recommended indicator */}
            {showAiIndicator && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <AiSlotBadge
                        slot={aiSlot}
                        onClick={onSlotClick}
                        className="pointer-events-auto"
                    />
                </div>
            )}

            {/* Create button on hover */}
            {showCreateButton && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSlotClick();
                    }}
                    className={cn(
                        'absolute inset-0 flex items-center justify-center',
                        'bg-[var(--bg-tertiary)]/30 transition-opacity',
                        'opacity-0 hover:opacity-100'
                    )}
                    aria-label="Create new post"
                >
                    <div className={cn(
                        'flex items-center gap-1 rounded-full px-3 py-1.5',
                        'bg-[var(--accent-gold)] text-white text-sm font-medium',
                        'shadow-lg transform hover:scale-105 transition-transform'
                    )}>
                        <Plus className="h-4 w-4" />
                        <span>New Post</span>
                    </div>
                </button>
            )}

            {/* Drop zone indicator during drag */}
            {isDropHover && (
                <div className={cn(
                    'absolute inset-0 flex items-center justify-center pointer-events-none',
                    'border-2 border-dashed border-[var(--accent-gold)] rounded-lg'
                )}>
                    <span className="text-sm font-medium text-[var(--accent-gold)]">
                        Drop to reschedule
                    </span>
                </div>
            )}
        </div>
    );
}

/**
 * Format hour to display string
 */
function formatHour(hour: number): string {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        hour12: true,
    });
}

export default CalendarSlot;
