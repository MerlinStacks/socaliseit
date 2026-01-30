'use client';

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Type, GripVertical } from 'lucide-react';
import { useVideoProject, TextOverlay } from '@/hooks/useVideoProject';

interface TimelineTextTrackProps {
    height?: number;
}

export const TimelineTextTrack: React.FC<TimelineTextTrackProps> = ({
    height = 40,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const {
        zoom,
        currentFrame,
        totalDurationFrames,
        selectedTextId,
        selectText,
        project,
        updateTextOverlay,
    } = useVideoProject();

    // Sort text overlays by start frame
    const textOverlays = React.useMemo(() =>
        [...project.textOverlays].sort((a, b) => a.startFrame - b.startFrame),
        [project.textOverlays]
    );

    const [dragging, setDragging] = useState<{
        id: string;
        startX: number;
        originalFrame: number;
    } | null>(null);

    const [resizing, setResizing] = useState<{
        id: string;
        edge: 'start' | 'end';
        startX: number;
        originalStart: number;
        originalDuration: number;
    } | null>(null);

    // Convert frame to pixel position
    const frameToPixel = useCallback((frame: number) => frame * zoom, [zoom]);
    const pixelToFrame = useCallback((pixel: number) => Math.round(pixel / zoom), [zoom]);

    // Timeline width
    const timelineWidth = frameToPixel(totalDurationFrames) + 200;

    // Drag handlers
    const handleDragStart = useCallback((e: React.MouseEvent, text: TextOverlay) => {
        e.stopPropagation();
        selectText(text.id);
        setDragging({
            id: text.id,
            startX: e.clientX,
            originalFrame: text.startFrame,
        });
    }, [selectText]);

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!dragging) return;

        const deltaX = e.clientX - dragging.startX;
        const deltaFrames = pixelToFrame(deltaX);
        const newFrame = Math.max(0, dragging.originalFrame + deltaFrames);

        updateTextOverlay(dragging.id, { startFrame: newFrame });
    }, [dragging, pixelToFrame, updateTextOverlay]);

    const handleDragEnd = useCallback(() => {
        setDragging(null);
    }, []);

    // Resize handlers
    const handleResizeStart = useCallback((
        e: React.MouseEvent,
        text: TextOverlay,
        edge: 'start' | 'end'
    ) => {
        e.stopPropagation();
        selectText(text.id);
        setResizing({
            id: text.id,
            edge,
            startX: e.clientX,
            originalStart: text.startFrame,
            originalDuration: text.durationFrames,
        });
    }, [selectText]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!resizing) return;

        const deltaX = e.clientX - resizing.startX;
        const deltaFrames = pixelToFrame(deltaX);

        if (resizing.edge === 'start') {
            // Adjust start frame and duration
            // New start cannot be after end (start + duration)
            const maxStart = resizing.originalStart + resizing.originalDuration - 5; // Min 5 frames
            const newStart = Math.min(Math.max(0, resizing.originalStart + deltaFrames), maxStart);
            const newDuration = resizing.originalDuration - (newStart - resizing.originalStart);

            updateTextOverlay(resizing.id, {
                startFrame: newStart,
                durationFrames: newDuration
            });
        } else {
            // Adjust only duration
            const minDuration = 5;
            const newDuration = Math.max(minDuration, resizing.originalDuration + deltaFrames);
            updateTextOverlay(resizing.id, { durationFrames: newDuration });
        }
    }, [resizing, pixelToFrame, updateTextOverlay]);

    const handleResizeEnd = useCallback(() => {
        setResizing(null);
    }, []);

    // Global listeners
    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
            return () => {
                window.removeEventListener('mousemove', handleDragMove);
                window.removeEventListener('mouseup', handleDragEnd);
            };
        }
    }, [dragging, handleDragMove, handleDragEnd]);

    useEffect(() => {
        if (resizing) {
            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeEnd);
            return () => {
                window.removeEventListener('mousemove', handleResizeMove);
                window.removeEventListener('mouseup', handleResizeEnd);
            };
        }
    }, [resizing, handleResizeMove, handleResizeEnd]);

    return (
        <div style={containerStyle}>
            {/* Track label */}
            <div style={labelStyle}>
                <Type size={14} />
                <span>Text</span>
            </div>

            {/* Scrollable track area */}
            <div style={trackContainerStyle}>
                <div style={{ ...trackStyle, width: timelineWidth, height }}>
                    {textOverlays.map((text) => (
                        <TextBlock
                            key={text.id}
                            text={text}
                            isSelected={selectedTextId === text.id}
                            left={frameToPixel(text.startFrame)}
                            width={frameToPixel(text.durationFrames)}
                            height={height - 12}
                            onDragStart={(e) => handleDragStart(e, text)}
                            onResizeStart={(e, edge) => handleResizeStart(e, text, edge)}
                            isDragging={dragging?.id === text.id}
                        />
                    ))}

                    {/* Playhead (optional, usually handled by parent or main track) */}
                    {/* keeping it here for alignment visual reference if needed, but opacity 0 */}
                    <div
                        style={{
                            ...playheadStyle,
                            left: frameToPixel(currentFrame),
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

// Subcomponent
interface TextBlockProps {
    text: TextOverlay;
    isSelected: boolean;
    left: number;
    width: number;
    height: number;
    onDragStart: (e: React.MouseEvent) => void;
    onResizeStart: (e: React.MouseEvent, edge: 'start' | 'end') => void;
    isDragging: boolean;
}

const TextBlock: React.FC<TextBlockProps> = ({
    text,
    isSelected,
    left,
    width,
    height,
    onDragStart,
    onResizeStart,
    isDragging,
}) => {
    return (
        <div
            style={{
                position: 'absolute',
                left,
                top: 6,
                width: Math.max(20, width),
                height,
                backgroundColor: isSelected ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.25)', // Purple/Violet for text
                border: isSelected ? '2px solid #a855f7' : '1px solid rgba(168, 85, 247, 0.5)',
                borderRadius: 4,
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: isDragging ? 0.8 : 1,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                color: '#fff',
                fontSize: 11,
            }}
            onMouseDown={onDragStart}
        >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {text.text}
            </span>

            {/* Resize handles */}
            <div
                style={resizeHandleStyle('left')}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    onResizeStart(e, 'start');
                }}
            >
                <GripVertical size={10} />
            </div>
            <div
                style={resizeHandleStyle('right')}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    onResizeStart(e, 'end');
                }}
            >
                <GripVertical size={10} />
            </div>
        </div>
    );
};

// Styles (reused from TimelineTrack where possible or similar)
const containerStyle: React.CSSProperties = {
    display: 'flex',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginTop: 4, // Spacing between tracks
};

const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 12px',
    minWidth: 80,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
};

const trackContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'hidden', // Sync scroll handled by parent if possible, but for now independent
    // TODO: Ideally bind scroll sync
    overflowX: 'auto',
};

const trackStyle: React.CSSProperties = {
    position: 'relative',
    minHeight: '100%',
    backgroundImage: `
        repeating-linear-gradient(
            90deg,
            rgba(255,255,255,0.03) 0px,
            rgba(255,255,255,0.03) 1px,
            transparent 1px,
            transparent 60px
        )
    `,
};

const playheadStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.5)',
    zIndex: 10,
    pointerEvents: 'none',
};

const resizeHandleStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    [side]: 0,
    width: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    cursor: 'ew-resize',
    color: 'rgba(255,255,255,0.5)',
    zIndex: 2,
});
