/**
 * Media Drag & Drop Hook
 * Handles drag-drop for moving media items to folders
 */

'use client';

import { useState, useCallback } from 'react';
import { showErrorToast } from '@/lib/api-error';

interface UseMediaDragDropOptions {
    onMoveToFolder: (mediaId: string, folderId: string | null) => Promise<void>;
    onDragStart?: (mediaId: string) => void;
    onDragEnd?: () => void;
}

interface DragState {
    isDragging: boolean;
    draggedMediaId: string | null;
    dropTargetFolderId: string | null;
}

export function useMediaDragDrop(options: UseMediaDragDropOptions) {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        draggedMediaId: null,
        dropTargetFolderId: null,
    });

    const handleDragStart = useCallback((mediaId: string, event: React.DragEvent) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', mediaId);
        event.dataTransfer.setData('application/x-media-id', mediaId);

        setDragState({
            isDragging: true,
            draggedMediaId: mediaId,
            dropTargetFolderId: null,
        });

        options.onDragStart?.(mediaId);
    }, [options]);

    const handleDragOver = useCallback((folderId: string | null, event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        setDragState(prev => ({
            ...prev,
            dropTargetFolderId: folderId,
        }));
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragState(prev => ({
            ...prev,
            dropTargetFolderId: null,
        }));
    }, []);

    const handleDrop = useCallback(async (folderId: string | null, event: React.DragEvent) => {
        event.preventDefault();

        const mediaId = event.dataTransfer.getData('application/x-media-id') ||
            event.dataTransfer.getData('text/plain');

        if (!mediaId) return;

        try {
            await options.onMoveToFolder(mediaId, folderId);
        } catch (error) {
            showErrorToast(error, 'Failed to move media to folder');
        }

        setDragState({
            isDragging: false,
            draggedMediaId: null,
            dropTargetFolderId: null,
        });

        options.onDragEnd?.();
    }, [options]);

    const handleDragEnd = useCallback(() => {
        setDragState({
            isDragging: false,
            draggedMediaId: null,
            dropTargetFolderId: null,
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
 * Props for draggable media items
 */
export interface DraggableMediaProps {
    mediaId: string;
    isDragging: boolean;
    onDragStart: (event: React.DragEvent) => void;
    onDragEnd: () => void;
}

/**
 * Props for folder drop zones
 */
export interface DropZoneFolderProps {
    folderId: string | null;
    isOver: boolean;
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (event: React.DragEvent) => void;
}
