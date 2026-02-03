/**
 * Draggable Post Card Component
 * Post card with drag handle and visual feedback for calendar drag-drop
 * 
 * Why: Enables intuitive rescheduling of posts via drag-and-drop
 * in the calendar interface.
 */

'use client';

import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalendarPost {
    id: string;
    time: string;
    caption: string;
    platform: string;
    status: string;
    thumbnail: string | null;
    pillarColor: string | null;
}

interface DraggablePostCardProps {
    /** The post data */
    post: CalendarPost;
    /** Platform color class mapping */
    platformColors: Record<string, string>;
    /** Click handler when post is clicked */
    onClick: () => void;
    /** Whether to render in compact mode */
    compact?: boolean;
    /** Whether this post is currently being dragged */
    isDragging?: boolean;
    /** Drag start handler */
    onDragStart?: (event: React.DragEvent) => void;
    /** Drag end handler */
    onDragEnd?: () => void;
}

/**
 * Format ISO timestamp to local time (e.g., "7:30 PM")
 */
function formatTimeFromISO(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Post card with drag handle for calendar views.
 * Shows grip icon on hover and provides visual feedback during drag.
 */
export function DraggablePostCard({
    post,
    platformColors,
    onClick,
    compact = false,
    isDragging = false,
    onDragStart,
    onDragEnd,
}: DraggablePostCardProps) {
    const isDraggable = !!onDragStart;

    return (
        <div
            data-testid="calendar-post"
            data-post-id={post.id}
            data-platform={post.platform}
            draggable={isDraggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className={cn(
                'group mb-1 cursor-pointer rounded-lg border-l-[3px] bg-[var(--bg-secondary)]',
                'shadow-sm transition-all hover:shadow-md',
                platformColors[post.platform] || 'border-l-gray-300',
                compact ? 'p-2' : 'p-2.5',
                isDragging && 'opacity-50 rotate-2 scale-95',
                isDraggable && 'cursor-grab active:cursor-grabbing'
            )}
            style={post.pillarColor ? { borderLeftColor: post.pillarColor } : undefined}
            role="button"
            tabIndex={0}
            aria-label={`${post.platform} post at ${formatTimeFromISO(post.time)}: ${post.caption}`}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
        >
            <div className="flex items-start gap-1.5">
                {/* Drag Handle - visible on hover */}
                {isDraggable && (
                    <div
                        className={cn(
                            'flex-shrink-0 opacity-0 group-hover:opacity-50 transition-opacity',
                            'text-[var(--text-muted)] cursor-grab'
                        )}
                        aria-hidden="true"
                    >
                        <GripVertical className="h-4 w-4" />
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-muted)]">
                        {formatTimeFromISO(post.time)}
                    </p>
                    {!compact && (
                        <p className="mt-1 truncate text-sm">
                            {post.caption}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DraggablePostCard;
