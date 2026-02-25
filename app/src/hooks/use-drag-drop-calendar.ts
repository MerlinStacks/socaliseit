/**
 * Drag & Drop Calendar Hook
 * Handles drag-drop for rescheduling posts
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { isBefore, startOfDay } from 'date-fns';
import { showErrorToast } from '@/lib/api-error';

export interface DraggablePost {
    id: string;
    caption: string;
    scheduledAt: Date;
    platforms: string[];
}

export interface DropTarget {
    date: Date;
    hour: number;
    /** If true, preserve the original post time instead of using the target hour */
    preserveTime?: boolean;
}

interface UseDragDropCalendarOptions {
    onDrop: (postId: string, newDate: Date, isCopy?: boolean) => Promise<void>;
    onDragStart?: (postId: string) => void;
    onDragEnd?: () => void;
    /** Called when a drop is rejected (e.g., past date) */
    onDropRejected?: (reason: string) => void;
}

interface DragState {
    isDragging: boolean;
    draggedPostId: string | null;
    /** Composite key (postId:platform) for tracking which specific card is being dragged */
    draggedDragKey: string | null;
    dropTarget: DropTarget | null;
}

export function useDragDropCalendar(options: UseDragDropCalendarOptions) {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        draggedPostId: null,
        draggedDragKey: null,
        dropTarget: null,
    });

    const draggedElementRef = useRef<HTMLElement | null>(null);

    const handleDragStart = useCallback((postId: string, event: React.DragEvent, dragKey?: string) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', postId);

        // Use default drag image which is more reliable across browsers
        // The custom drag image logic was causing issues with some browsers/os combinations

        setDragState({
            isDragging: true,
            draggedPostId: postId,
            // Why: Track specific card (postId:platform) for multi-platform posts
            draggedDragKey: dragKey || postId,
            dropTarget: null,
        });

        options.onDragStart?.(postId);
    }, [options]);

    const handleDragOver = useCallback((target: DropTarget, event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        setDragState(prev => ({
            ...prev,
            dropTarget: target,
        }));
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragState(prev => ({
            ...prev,
            dropTarget: null,
        }));
    }, []);

    const handleDrop = useCallback(async (target: DropTarget, event: React.DragEvent) => {
        event.preventDefault();

        const isCopy = event.ctrlKey || event.altKey || event.metaKey;

        const postId = event.dataTransfer.getData('text/plain');
        if (!postId) return;

        // Get original time from data transfer if preserving
        const originalTimeStr = event.dataTransfer.getData('application/x-original-time');

        // Calculate new date
        const newDate = new Date(target.date);

        if (target.preserveTime && originalTimeStr) {
            // Preserve original hours/minutes when moving between days (month view)
            const originalDate = new Date(originalTimeStr);
            newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
        } else {
            // Use target hour (day/week view with specific time slots)
            newDate.setHours(target.hour, 0, 0, 0);
        }

        // EDGE CASE: Reject drops onto past dates
        // Compare against start of today to allow scheduling for later today
        const now = new Date();
        const isPastDate = isBefore(newDate, now);

        if (isPastDate) {
            // Reset drag state (triggers bounce-back in UI)
            setDragState({
                isDragging: false,
                draggedPostId: null,
                draggedDragKey: null,
                dropTarget: null,
            });

            // Notify caller about rejection
            options.onDropRejected?.('Cannot schedule posts in the past');
            options.onDragEnd?.();
            return;
        }

        try {
            await options.onDrop(postId, newDate, isCopy);
        } catch (error) {
            showErrorToast(error, isCopy ? 'Failed to duplicate post' : 'Failed to reschedule post');
        }

        setDragState({
            isDragging: false,
            draggedPostId: null,
            draggedDragKey: null,
            dropTarget: null,
        });

        options.onDragEnd?.();
    }, [options]);

    const handleDragEnd = useCallback(() => {
        setDragState({
            isDragging: false,
            draggedPostId: null,
            draggedDragKey: null,
            dropTarget: null,
        });

        options.onDragEnd?.();
    }, [options]);

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

/**
 * Drop Zone Component props
 */
export interface DropZoneProps {
    date: Date;
    hour: number;
    isActive: boolean;
    isOver: boolean;
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (event: React.DragEvent) => void;
    children?: React.ReactNode;
}

/**
 * Draggable Post Card props
 */
export interface DraggableCardProps {
    post: DraggablePost;
    isDragging: boolean;
    onDragStart: (event: React.DragEvent) => void;
    onDragEnd: () => void;
    children: React.ReactNode;
}

/**
 * Undo stack for drag operations
 */
export interface UndoAction {
    type: 'reschedule';
    postId: string;
    previousDate: Date;
    newDate: Date;
    timestamp: Date;
}

export function useUndoStack(maxSize: number = 20) {
    const [stack, setStack] = useState<UndoAction[]>([]);
    const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

    const push = useCallback((action: UndoAction) => {
        setStack(prev => [...prev.slice(-maxSize + 1), action]);
        setRedoStack([]); // Clear redo on new action
    }, [maxSize]);

    const undo = useCallback((): UndoAction | null => {
        if (stack.length === 0) return null;

        const action = stack[stack.length - 1];
        setStack(prev => prev.slice(0, -1));
        setRedoStack(prev => [...prev, action]);

        return action;
    }, [stack]);

    const redo = useCallback((): UndoAction | null => {
        if (redoStack.length === 0) return null;

        const action = redoStack[redoStack.length - 1];
        setRedoStack(prev => prev.slice(0, -1));
        setStack(prev => [...prev, action]);

        return action;
    }, [redoStack]);

    const clear = useCallback(() => {
        setStack([]);
        setRedoStack([]);
    }, []);

    return {
        canUndo: stack.length > 0,
        canRedo: redoStack.length > 0,
        push,
        undo,
        redo,
        clear,
    };
}

/**
 * Keyboard shortcuts for undo/redo
 */
export function useUndoKeyboard(
    onUndo: () => void,
    onRedo: () => void
) {
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
            event.preventDefault();
            if (event.shiftKey) {
                onRedo();
            } else {
                onUndo();
            }
        }
    }, [onUndo, onRedo]);

    // Why: Must use useEffect for side effects, not at render time
    // Register on mount, cleanup on unmount
    if (typeof window !== 'undefined') {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useState(() => {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        });
    }
}
