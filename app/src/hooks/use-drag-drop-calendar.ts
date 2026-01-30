/**
 * Drag & Drop Calendar Hook
 * Handles drag-drop for rescheduling posts
 */

'use client';

import { useState, useCallback, useRef } from 'react';

export interface DraggablePost {
    id: string;
    caption: string;
    scheduledAt: Date;
    platforms: string[];
}

export interface DropTarget {
    date: Date;
    hour: number;
}

interface UseDragDropCalendarOptions {
    onDrop: (postId: string, newDate: Date) => Promise<void>;
    onDragStart?: (postId: string) => void;
    onDragEnd?: () => void;
}

interface DragState {
    isDragging: boolean;
    draggedPostId: string | null;
    dropTarget: DropTarget | null;
}

export function useDragDropCalendar(options: UseDragDropCalendarOptions) {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        draggedPostId: null,
        dropTarget: null,
    });

    const draggedElementRef = useRef<HTMLElement | null>(null);

    const handleDragStart = useCallback((postId: string, event: React.DragEvent) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', postId);

        // Create custom drag image
        const dragImage = event.currentTarget.cloneNode(true) as HTMLElement;
        dragImage.style.opacity = '0.8';
        dragImage.style.transform = 'rotate(3deg)';
        document.body.appendChild(dragImage);
        event.dataTransfer.setDragImage(dragImage, 0, 0);
        setTimeout(() => document.body.removeChild(dragImage), 0);

        setDragState({
            isDragging: true,
            draggedPostId: postId,
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

        const postId = event.dataTransfer.getData('text/plain');
        if (!postId) return;

        // Calculate new date
        const newDate = new Date(target.date);
        newDate.setHours(target.hour, 0, 0, 0);

        try {
            await options.onDrop(postId, newDate);
        } catch (error) {
            console.error('Failed to reschedule post:', error);
        }

        setDragState({
            isDragging: false,
            draggedPostId: null,
            dropTarget: null,
        });

        options.onDragEnd?.();
    }, [options]);

    const handleDragEnd = useCallback(() => {
        setDragState({
            isDragging: false,
            draggedPostId: null,
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

    // Register on mount
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }
}
