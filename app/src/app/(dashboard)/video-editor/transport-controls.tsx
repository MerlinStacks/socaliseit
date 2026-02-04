/**
 * Video Editor Transport Controls
 * Playback controls, zoom, and loop toggle.
 */

'use client';

import React from 'react';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    ZoomIn,
    ZoomOut,
    Repeat,
} from 'lucide-react';
import { formatTimecode } from '@/lib/formatters';
import {
    transportStyle,
    timecodeStyle,
    transportButtonStyle,
    playButtonStyle,
} from './styles';

interface TransportControlsProps {
    currentFrame: number;
    totalDurationFrames: number;
    fps: number;
    isPlaying: boolean;
    isLooping: boolean;
    zoom: number;
    onTogglePlay: () => void;
    onSeek: (frame: number) => void;
    onSetZoom: (zoom: number) => void;
    onToggleLoop: () => void;
}

/**
 * Transport bar with play/pause, frame navigation, and zoom controls.
 */
export function TransportControls({
    currentFrame,
    totalDurationFrames,
    fps,
    isPlaying,
    isLooping,
    zoom,
    onTogglePlay,
    onSeek,
    onSetZoom,
    onToggleLoop,
}: TransportControlsProps) {
    return (
        <div style={transportStyle}>
            <div style={timecodeStyle}>
                {formatTimecode(currentFrame, fps)} / {formatTimecode(totalDurationFrames, fps)}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                    onClick={() => onSeek(0)}
                    style={transportButtonStyle}
                    title="Go to start"
                >
                    <SkipBack size={16} />
                </button>
                <button
                    onClick={() => onSeek(Math.max(0, currentFrame - fps))}
                    style={transportButtonStyle}
                    title="Back 1 second"
                >
                    <SkipBack size={14} />
                </button>
                <button
                    onClick={onTogglePlay}
                    style={playButtonStyle}
                    title={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button
                    onClick={() => onSeek(Math.min(totalDurationFrames, currentFrame + fps))}
                    style={transportButtonStyle}
                    title="Forward 1 second"
                >
                    <SkipForward size={14} />
                </button>
                <button
                    onClick={() => onSeek(totalDurationFrames)}
                    style={transportButtonStyle}
                    title="Go to end"
                >
                    <SkipForward size={16} />
                </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Zoom controls */}
                <button
                    onClick={() => onSetZoom(zoom / 1.5)}
                    style={transportButtonStyle}
                    title="Zoom out"
                >
                    <ZoomOut size={14} />
                </button>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', minWidth: 40, textAlign: 'center' }}>
                    {Math.round(zoom * 100)}%
                </span>
                <button
                    onClick={() => onSetZoom(zoom * 1.5)}
                    style={transportButtonStyle}
                    title="Zoom in"
                >
                    <ZoomIn size={14} />
                </button>

                {/* Loop toggle */}
                <button
                    onClick={onToggleLoop}
                    style={{
                        ...transportButtonStyle,
                        backgroundColor: isLooping
                            ? 'rgba(99, 102, 241, 0.3)'
                            : 'transparent',
                        border: isLooping
                            ? '1px solid #6366f1'
                            : '1px solid rgba(255,255,255,0.2)',
                    }}
                    title="Toggle loop"
                >
                    <Repeat size={14} />
                </button>
            </div>
        </div>
    );
}
