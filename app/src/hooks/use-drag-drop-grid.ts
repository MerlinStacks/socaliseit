/**
 * Drag & Drop Grid Hook
 *
 * Handles drag-drop reordering of scheduled/draft posts within the
 * Instagram grid planner. Published posts are locked in place.
 *
 * Why separate from use-drag-drop-calendar: The calendar drops onto
 * date/time slots. The grid reorders within a flat list — the new
 * scheduledAt is computed from neighboring posts' times, not a target slot.
 */

'use client';

import { useState, useCallback } from 'react';

export interface GridDragState {
    isDragging: boolean;
    draggedPostId: string | null;
    /** Index the dragged item is currently hovering over */
    overIndex: number | null;
}

interface UseGridDragDropOptions {
    /** Called after a successful reorder with the post ID and new scheduledAt */
    onReorder: (postId: string, newScheduledAt: Date) => Promise<void>;
}

/**
 * Compute a scheduledAt that places a post between two neighbors.
 *
 * Strategy:
 * - If both neighbors have times, use the midpoint.
 * - If only before exists (dropping at the end of pending section), add 1 hour.
 * - If only after exists (dropping at the start), subtract 1 hour.
 * - If gap between neighbors is < 2 minutes, shift to before + 1 minute
 *   (avoids sub-minute precision that could confuse the publish worker).
 */
export function computeInsertTime(
    before: Date | null,
    after: Date | null,
): Date {
    if (before && after) {
        const gap = after.getTime() - before.getTime();
        if (gap < 2 * 60_000) {
            // Gap too small — place 1 minute after the earlier post
            return new Date(before.getTime() + 60_000);
        }
        // Midpoint
        return new Date(before.getTime() + Math.floor(gap / 2));
    }
    if (before) {
        // Dropping after the last pending post — 1 hour later
        return new Date(before.getTime() + 60 * 60_000);
    }
    if (after) {
        // Dropping before the first pending post — 1 hour earlier
        return new Date(after.getTime() - 60 * 60_000);
    }
    // No neighbors — shouldn't happen, fall back to now + 1 hour
    return new Date(Date.now() + 60 * 60_000);
}

export function useDragDropGrid({ onReorder }: UseGridDragDropOptions) {
    const [dragState, setDragState] = useState<GridDragState>({
        isDragging: false,
        draggedPostId: null,
        overIndex: null,
    });

    const handleDragStart = useCallback((postId: string, event: React.DragEvent) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', postId);
        setDragState({ isDragging: true, draggedPostId: postId, overIndex: null });
    }, []);

    const handleDragOver = useCallback((index: number, event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragState(prev => ({ ...prev, overIndex: index }));
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragState(prev => ({ ...prev, overIndex: null }));
    }, []);

    /**
     * On drop: compute the new scheduledAt from neighboring posts and fire onReorder.
     * @param pendingPosts - only the pending (draft/scheduled) posts, in grid order
     * @param targetIndex - index within pendingPosts where the item was dropped
     */
    const handleDrop = useCallback(async (
        pendingPosts: Array<{ id: string; scheduledAt: string | null }>,
        targetIndex: number,
        event: React.DragEvent,
    ) => {
        event.preventDefault();
        const postId = event.dataTransfer.getData('text/plain');
        if (!postId) return;

        // Remove the dragged post from the list to compute neighbors correctly
        const withoutDragged = pendingPosts.filter(p => p.id !== postId);

        // Clamp target index after removal
        const clampedIdx = Math.min(targetIndex, withoutDragged.length);

        const beforeRaw = clampedIdx > 0 && withoutDragged[clampedIdx - 1]?.scheduledAt
            ? new Date(withoutDragged[clampedIdx - 1].scheduledAt!)
            : null;
        const afterRaw = clampedIdx < withoutDragged.length && withoutDragged[clampedIdx]?.scheduledAt
            ? new Date(withoutDragged[clampedIdx].scheduledAt!)
            : null;
        // Why (BUG-FIX): Validate dates — empty string or invalid scheduledAt
        // produces Invalid Date which corrupts computeInsertTime.
        const before = beforeRaw && !isNaN(beforeRaw.getTime()) ? beforeRaw : null;
        const after = afterRaw && !isNaN(afterRaw.getTime()) ? afterRaw : null;

        const newTime = computeInsertTime(before, after);

        setDragState({ isDragging: false, draggedPostId: null, overIndex: null });

        await onReorder(postId, newTime);
    }, [onReorder]);

    const handleDragEnd = useCallback(() => {
        setDragState({ isDragging: false, draggedPostId: null, overIndex: null });
    }, []);

    return {
        dragState,
        handlers: {
            onDragStart: handleDragStart,
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
            onDragEnd: handleDragEnd,
        },
    };
}
