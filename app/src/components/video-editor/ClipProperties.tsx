'use client';

/**
 * Clip Properties Panel
 * Properties editor for the currently selected clip.
 *
 * Why separate panel: Allows detailed editing without cluttering the
 * main timeline. Mirrors behavior of professional video editors.
 */
import React, { useCallback } from 'react';
import { Film, Image, Volume2, VolumeX, Trash2, Clock, Scissors } from 'lucide-react';
import { useVideoProject, useSelectedClip } from '@/hooks/useVideoProject';

interface ClipPropertiesProps {
    fps?: number;
}

/**
 * Formats frame count as timecode (MM:SS:FF)
 */
const formatTimecode = (frames: number, fps: number): string => {
    const totalSeconds = Math.floor(frames / fps);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const remainingFrames = frames % fps;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(remainingFrames).padStart(2, '0')}`;
};

export const ClipProperties: React.FC<ClipPropertiesProps> = ({ fps = 30 }) => {
    const selectedClip = useSelectedClip();
    const { updateClip, removeClip, trimClipStart, trimClipEnd } = useVideoProject();

    const handleVolumeChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (!selectedClip) return;
            updateClip(selectedClip.id, { volume: parseFloat(e.target.value) });
        },
        [selectedClip, updateClip]
    );

    const handleTrimStartChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (!selectedClip) return;
            trimClipStart(selectedClip.id, parseInt(e.target.value, 10));
        },
        [selectedClip, trimClipStart]
    );

    const handleTrimEndChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (!selectedClip) return;
            trimClipEnd(selectedClip.id, parseInt(e.target.value, 10));
        },
        [selectedClip, trimClipEnd]
    );

    const handleDelete = useCallback(() => {
        if (!selectedClip) return;
        if (window.confirm(`Delete "${selectedClip.name}"?`)) {
            removeClip(selectedClip.id);
        }
    }, [selectedClip, removeClip]);

    if (!selectedClip) {
        return (
            <div style={containerStyle}>
                <div style={emptyStateStyle}>
                    <Scissors size={24} style={{ color: 'rgba(255,255,255,0.3)' }} />
                    <p style={emptyTextStyle}>Select a clip to edit</p>
                </div>
            </div>
        );
    }

    const maxTrimStart = selectedClip.sourceDurationFrames - selectedClip.trimEnd - 30;
    const maxTrimEnd = selectedClip.sourceDurationFrames - selectedClip.trimStart - 30;

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <div style={headerIconStyle}>
                    {selectedClip.type === 'video' ? <Film size={16} /> : <Image size={16} />}
                </div>
                <div style={headerTitleStyle}>
                    <h3 style={titleStyle}>{selectedClip.name}</h3>
                    <span style={subtitleStyle}>
                        {selectedClip.type === 'video' ? 'Video Clip' : 'Image'}
                    </span>
                </div>
            </div>

            {/* Timing info */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <Clock size={14} />
                    <span>Timing</span>
                </div>

                <div style={infoRowStyle}>
                    <span style={labelStyle}>Duration</span>
                    <span style={valueStyle}>
                        {formatTimecode(selectedClip.durationFrames, fps)}
                    </span>
                </div>

                <div style={infoRowStyle}>
                    <span style={labelStyle}>Source</span>
                    <span style={valueStyle}>
                        {formatTimecode(selectedClip.sourceDurationFrames, fps)}
                    </span>
                </div>

                <div style={infoRowStyle}>
                    <span style={labelStyle}>Position</span>
                    <span style={valueStyle}>
                        {formatTimecode(selectedClip.startFrame, fps)}
                    </span>
                </div>
            </div>

            {/* Trim controls */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <Scissors size={14} />
                    <span>Trim</span>
                </div>

                <div style={sliderGroupStyle}>
                    <div style={sliderLabelRowStyle}>
                        <span style={sliderLabelStyle}>Trim Start</span>
                        <span style={sliderValueStyle}>
                            {formatTimecode(selectedClip.trimStart, fps)}
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={maxTrimStart}
                        value={selectedClip.trimStart}
                        onChange={handleTrimStartChange}
                        style={sliderStyle}
                    />
                </div>

                <div style={sliderGroupStyle}>
                    <div style={sliderLabelRowStyle}>
                        <span style={sliderLabelStyle}>Trim End</span>
                        <span style={sliderValueStyle}>
                            {formatTimecode(selectedClip.trimEnd, fps)}
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={maxTrimEnd}
                        value={selectedClip.trimEnd}
                        onChange={handleTrimEndChange}
                        style={sliderStyle}
                    />
                </div>
            </div>

            {/* Volume control (for video clips) */}
            {selectedClip.type === 'video' && (
                <div style={sectionStyle}>
                    <div style={sectionHeaderStyle}>
                        {selectedClip.volume > 0 ? (
                            <Volume2 size={14} />
                        ) : (
                            <VolumeX size={14} />
                        )}
                        <span>Audio</span>
                    </div>

                    <div style={sliderGroupStyle}>
                        <div style={sliderLabelRowStyle}>
                            <span style={sliderLabelStyle}>Volume</span>
                            <span style={sliderValueStyle}>
                                {Math.round(selectedClip.volume * 100)}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={selectedClip.volume}
                            onChange={handleVolumeChange}
                            style={sliderStyle}
                        />
                    </div>
                </div>
            )}

            {/* Delete button */}
            <div style={deleteContainerStyle}>
                <button onClick={handleDelete} style={deleteButtonStyle}>
                    <Trash2 size={14} />
                    Delete Clip
                </button>
            </div>
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
};

const emptyStateStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    padding: 20,
};

const emptyTextStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    margin: 0,
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
};

const headerIconStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderRadius: 8,
    color: '#6366f1',
};

const headerTitleStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflow: 'hidden',
};

const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const subtitleStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
};

const sectionStyle: React.CSSProperties = {
    padding: 12,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
};

const infoRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
};

const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
};

const valueStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#fff',
};

const sliderGroupStyle: React.CSSProperties = {
    marginBottom: 12,
};

const sliderLabelRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
};

const sliderLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
};

const sliderValueStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.8)',
};

const sliderStyle: React.CSSProperties = {
    width: '100%',
    height: 4,
    appearance: 'none',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    cursor: 'pointer',
};

const deleteContainerStyle: React.CSSProperties = {
    marginTop: 'auto',
    padding: 12,
};

const deleteButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
};
