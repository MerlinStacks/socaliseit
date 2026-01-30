'use client';

/**
 * VideoTimeline Component
 * Frame-based scrubber and playback controls for the video editor.
 * 
 * Why separate from canvas: Timeline logic is complex and benefits from
 * isolation. Can be reused with different preview implementations.
 */
import React, { useCallback, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Repeat } from 'lucide-react';

export interface VideoTimelineProps {
    currentFrame: number;
    durationInFrames: number;
    fps: number;
    isPlaying: boolean;
    isLooping: boolean;
    onSeek: (frame: number) => void;
    onPlay: () => void;
    onPause: () => void;
    onToggleLoop: () => void;
}

/**
 * Format frame number as timecode (MM:SS:FF)
 */
const formatTimecode = (frame: number, fps: number): string => {
    const totalSeconds = Math.floor(frame / fps);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const frames = frame % fps;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
};

export const VideoTimeline: React.FC<VideoTimelineProps> = ({
    currentFrame,
    durationInFrames,
    fps,
    isPlaying,
    isLooping,
    onSeek,
    onPlay,
    onPause,
    onToggleLoop,
}) => {
    const progressPercent = useMemo(
        () => (currentFrame / durationInFrames) * 100,
        [currentFrame, durationInFrames]
    );

    const handleScrub = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onSeek(parseInt(e.target.value, 10));
        },
        [onSeek]
    );

    const skipBack = useCallback(() => {
        onSeek(Math.max(0, currentFrame - fps)); // Skip 1 second back
    }, [onSeek, currentFrame, fps]);

    const skipForward = useCallback(() => {
        onSeek(Math.min(durationInFrames, currentFrame + fps)); // Skip 1 second forward
    }, [onSeek, currentFrame, fps, durationInFrames]);

    const goToStart = useCallback(() => onSeek(0), [onSeek]);
    const goToEnd = useCallback(() => onSeek(durationInFrames - 1), [onSeek, durationInFrames]);

    return (
        <div
            className="video-timeline"
            style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: 12,
                padding: 16,
                border: '1px solid rgba(255,255,255,0.1)',
            }}
        >
            {/* Progress bar */}
            <div style={{ marginBottom: 16 }}>
                <div
                    style={{
                        position: 'relative',
                        height: 8,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        borderRadius: 4,
                        overflow: 'hidden',
                    }}
                >
                    {/* Progress fill */}
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            height: '100%',
                            width: `${progressPercent}%`,
                            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                            borderRadius: 4,
                            transition: 'width 0.1s linear',
                        }}
                    />
                </div>

                {/* Hidden range input for scrubbing */}
                <input
                    type="range"
                    min={0}
                    max={durationInFrames - 1}
                    value={currentFrame}
                    onChange={handleScrub}
                    style={{
                        position: 'absolute',
                        width: '100%',
                        height: 24,
                        marginTop: -16,
                        opacity: 0,
                        cursor: 'pointer',
                    }}
                />
            </div>

            {/* Controls row */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                {/* Left: Timecode */}
                <div
                    style={{
                        fontFamily: 'monospace',
                        fontSize: 14,
                        color: 'rgba(255,255,255,0.7)',
                        minWidth: 100,
                    }}
                >
                    {formatTimecode(currentFrame, fps)} / {formatTimecode(durationInFrames, fps)}
                </div>

                {/* Center: Playback controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        onClick={goToStart}
                        style={buttonStyle}
                        title="Go to start"
                    >
                        <SkipBack size={16} />
                    </button>

                    <button onClick={skipBack} style={buttonStyle} title="Skip back 1s">
                        <SkipBack size={14} />
                    </button>

                    <button
                        onClick={isPlaying ? onPause : onPlay}
                        style={{
                            ...buttonStyle,
                            backgroundColor: '#6366f1',
                            width: 48,
                            height: 48,
                        }}
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>

                    <button onClick={skipForward} style={buttonStyle} title="Skip forward 1s">
                        <SkipForward size={14} />
                    </button>

                    <button onClick={goToEnd} style={buttonStyle} title="Go to end">
                        <SkipForward size={16} />
                    </button>
                </div>

                {/* Right: Loop toggle */}
                <div style={{ minWidth: 100, textAlign: 'right' }}>
                    <button
                        onClick={onToggleLoop}
                        style={{
                            ...buttonStyle,
                            backgroundColor: isLooping
                                ? 'rgba(99, 102, 241, 0.3)'
                                : 'transparent',
                            border: isLooping
                                ? '1px solid #6366f1'
                                : '1px solid rgba(255,255,255,0.2)',
                        }}
                        title="Toggle loop"
                    >
                        <Repeat size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
};
