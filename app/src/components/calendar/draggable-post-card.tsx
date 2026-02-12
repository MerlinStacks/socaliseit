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
import { type CalendarPost, formatTimeFromISO } from './calendar-types';
import { PostTypeIcon } from '@/components/compose/post-type-icon';
import type { PostType } from '@/lib/platform-config';

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
    // External posts cannot be dragged (can't reschedule posts published on platform)
    const isDraggable = !!onDragStart && !post.isExternal;

    /**
     * Status color mapping for visual indicators
     * Why: Different statuses need distinct colors for quick recognition
     */
    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
        draft: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Draft' },
        scheduled: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Scheduled' },
        publishing: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Publishing' },
        published: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Published' },
        failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' },
    };

    const statusStyle = statusColors[post.status] || statusColors.draft;


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
                {/* Drag Handle - subtly visible at rest, more prominent on hover */}
                {isDraggable && (
                    <div
                        className={cn(
                            'flex-shrink-0 opacity-30 group-hover:opacity-70 transition-all',
                            'text-[var(--text-muted)] cursor-grab group-hover:-translate-x-0.5'
                        )}
                        aria-hidden="true"
                    >
                        <GripVertical className="h-4 w-4" />
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        {/* Post Type Icon */}
                        {post.postType && (
                            <PostTypeIcon
                                postType={post.postType as PostType}
                                size={14}
                                className="text-[var(--text-muted)] flex-shrink-0"
                            />
                        )}
                        <p className="text-xs text-[var(--text-muted)]">
                            {formatTimeFromISO(post.time)}
                        </p>
                        {/* Status Badge */}
                        <span
                            className={cn(
                                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                statusStyle.bg,
                                statusStyle.text
                            )}
                        >
                            {statusStyle.label}
                        </span>
                        {/* External Post Badge */}
                        {post.isExternal && (
                            <span
                                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-400"
                                title={post.externalUrl ? 'Click to view on platform' : 'External post'}
                            >
                                External
                            </span>
                        )}
                    </div>
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
