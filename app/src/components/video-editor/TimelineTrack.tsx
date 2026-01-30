'use client';

/**
 * Timeline Track Component
 * Visual representation of clips on the video timeline.
 *
 * Why custom implementation: Need precise frame-level control and
 * drag-to-reposition functionality not available in standard components.
 */
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Film, Image, GripVertical } from 'lucide-react';
import { useVideoProject, useSortedClips, Clip } from '@/hooks/useVideoProject';

interface TimelineTrackProps {
    /** Track height in pixels */
    height?: number;
}

export const TimelineTrack: React.FC<TimelineTrackProps> = ({
    height = 80,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const clips = useSortedClips();
    const {
        zoom,
        currentFrame,
        totalDurationFrames,
        selectedClipId,
        selectClip,
        moveClip,
        setCurrentFrame,
    } = useVideoProject();

    const [dragging, setDragging] = useState<{
        clipId: string;
        startX: number;
        originalFrame: number;
    } | null>(null);

    const [resizing, setResizing] = useState<{
        clipId: string;
        edge: 'start' | 'end';
        startX: number;
        originalTrimStart: number;
        originalTrimEnd: number;
    } | null>(null);

    const trimClipStart = useVideoProject((s) => s.trimClipStart);
    const trimClipEnd = useVideoProject((s) => s.trimClipEnd);

    // Convert frame to pixel position
    const frameToPixel = useCallback((frame: number) => frame * zoom, [zoom]);

    // Convert pixel to frame
    const pixelToFrame = useCallback((pixel: number) => Math.round(pixel / zoom), [zoom]);

    // Timeline width in pixels
    const timelineWidth = frameToPixel(totalDurationFrames) + 200; // Extra padding

    // Handle clicking on empty track area to seek
    const handleTrackClick = useCallback((e: React.MouseEvent) => {
        if (dragging || resizing) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0);
        const frame = pixelToFrame(x);
        setCurrentFrame(Math.max(0, Math.min(frame, totalDurationFrames)));
    }, [pixelToFrame, setCurrentFrame, totalDurationFrames, dragging, resizing]);

    // Drag handlers
    const handleDragStart = useCallback((e: React.MouseEvent, clip: Clip) => {
        e.stopPropagation();
        selectClip(clip.id);
        setDragging({
            clipId: clip.id,
            startX: e.clientX,
            originalFrame: clip.startFrame,
        });
    }, [selectClip]);

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!dragging) return;

        const deltaX = e.clientX - dragging.startX;
        const deltaFrames = pixelToFrame(deltaX);
        const newFrame = Math.max(0, dragging.originalFrame + deltaFrames);
        moveClip(dragging.clipId, newFrame);
    }, [dragging, pixelToFrame, moveClip]);

    const handleDragEnd = useCallback(() => {
        setDragging(null);
    }, []);

    // Resize handlers
    const handleResizeStart = useCallback((
        e: React.MouseEvent,
        clip: Clip,
        edge: 'start' | 'end'
    ) => {
        e.stopPropagation();
        selectClip(clip.id);
        setResizing({
            clipId: clip.id,
            edge,
            startX: e.clientX,
            originalTrimStart: clip.trimStart,
            originalTrimEnd: clip.trimEnd,
        });
    }, [selectClip]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!resizing) return;

        const deltaX = e.clientX - resizing.startX;
        const deltaFrames = pixelToFrame(deltaX);

        if (resizing.edge === 'start') {
            // Trimming start means adjusting trimStart
            const newTrimStart = Math.max(0, resizing.originalTrimStart + deltaFrames);
            trimClipStart(resizing.clipId, newTrimStart);
        } else {
            // Trimming end means adjusting trimEnd
            const newTrimEnd = Math.max(0, resizing.originalTrimEnd - deltaFrames);
            trimClipEnd(resizing.clipId, newTrimEnd);
        }
    }, [resizing, pixelToFrame, trimClipStart, trimClipEnd]);

    const handleResizeEnd = useCallback(() => {
        setResizing(null);
    }, []);

    // Global mouse event listeners for drag/resize
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
                <Film size={14} />
                <span>Video</span>
            </div>

            {/* Scrollable track area */}
            <div
                ref={containerRef}
                style={trackContainerStyle}
                onClick={handleTrackClick}
            >
                <div style={{ ...trackStyle, width: timelineWidth, height }}>
                    {/* Clips */}
                    {clips.map((clip) => (
                        <ClipBlock
                            key={clip.id}
                            clip={clip}
                            isSelected={selectedClipId === clip.id}
                            left={frameToPixel(clip.startFrame)}
                            width={frameToPixel(clip.durationFrames)}
                            height={height - 16}
                            onDragStart={(e) => handleDragStart(e, clip)}
                            onResizeStart={(e, edge) => handleResizeStart(e, clip, edge)}
                            isDragging={dragging?.clipId === clip.id}
                            isResizing={resizing?.clipId === clip.id}
                        />
                    ))}

                    {/* Playhead */}
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

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface ClipBlockProps {
    clip: Clip;
    isSelected: boolean;
    left: number;
    width: number;
    height: number;
    onDragStart: (e: React.MouseEvent) => void;
    onResizeStart: (e: React.MouseEvent, edge: 'start' | 'end') => void;
    isDragging: boolean;
    isResizing: boolean;
}

const ClipBlock: React.FC<ClipBlockProps> = ({
    clip,
    isSelected,
    left,
    width,
    height,
    onDragStart,
    onResizeStart,
    isDragging,
    isResizing,
}) => {
    const minWidth = 30; // Minimum clip width in pixels

    return (
        <div
            style={{
                position: 'absolute',
                left,
                top: 8,
                width: Math.max(minWidth, width),
                height,
                backgroundColor: isSelected
                    ? 'rgba(99, 102, 241, 0.4)'
                    : 'rgba(99, 102, 241, 0.25)',
                border: isSelected
                    ? '2px solid #6366f1'
                    : '1px solid rgba(99, 102, 241, 0.5)',
                borderRadius: 6,
                overflow: 'hidden',
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: isDragging || isResizing ? 0.8 : 1,
                transition: isDragging || isResizing ? 'none' : 'opacity 0.15s',
            }}
            onMouseDown={onDragStart}
        >
            {/* Thumbnail background */}
            {clip.thumbnailUrl && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `url(${clip.thumbnailUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: 0.4,
                    }}
                />
            )}

            {/* Content */}
            <div style={clipContentStyle}>
                {/* Type icon */}
                <div style={clipIconStyle}>
                    {clip.type === 'video' ? <Film size={12} /> : <Image size={12} />}
                </div>

                {/* Name */}
                {width > 80 && (
                    <span style={clipNameStyle}>
                        {clip.name.length > 15 ? clip.name.slice(0, 15) + '...' : clip.name}
                    </span>
                )}
            </div>

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

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
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
    overflowX: 'auto',
    overflowY: 'hidden',
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
    backgroundColor: '#ef4444',
    zIndex: 10,
    pointerEvents: 'none',
};

const clipContentStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: '100%',
    padding: '0 20px 0 8px',
    zIndex: 1,
};

const clipIconStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 4,
    color: '#fff',
    flexShrink: 0,
};

const clipNameStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const resizeHandleStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    [side]: 0,
    width: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    cursor: 'ew-resize',
    color: 'rgba(255,255,255,0.5)',
    opacity: 0.6,
    transition: 'opacity 0.15s',
    zIndex: 2,
});

// Note: Hover effect requires CSS modules or parent state management
// For now, handles are shown with reduced opacity

