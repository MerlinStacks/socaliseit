'use client';

import React from 'react';
import { Trash2, Volume2, Music } from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';

export const AudioProperties: React.FC = () => {
    const {
        project,
        selectedAudioId,
        updateAudioClip,
        removeAudioClip
    } = useVideoProject();

    const selectedClip = React.useMemo(() =>
        project.audioClips.find(c => c.id === selectedAudioId),
        [project.audioClips, selectedAudioId]
    );

    if (!selectedClip) {
        return (
            <div style={emptyStateStyle}>
                <p>Select an audio clip to edit properties</p>
            </div>
        );
    }

    const handleChange = (field: string, value: any) => {
        updateAudioClip(selectedClip.id, { [field]: value });
    };

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <h3 style={titleStyle}>Audio Properties</h3>
                <button
                    onClick={() => removeAudioClip(selectedClip.id)}
                    style={deleteButtonStyle}
                    title="Delete clip"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            <div style={contentStyle}>
                {/* Info */}
                <div style={sectionStyle}>
                    <div style={infoRowStyle}>
                        <Music size={16} color="rgba(255,255,255,0.5)" />
                        <span style={fileNameStyle} title={selectedClip.name}>
                            {selectedClip.name}
                        </span>
                    </div>
                </div>

                {/* Volume */}
                <div style={sectionStyle}>
                    <label style={labelStyle}>Volume</label>
                    <div style={controlRowStyle}>
                        <Volume2 size={16} color="rgba(255,255,255,0.5)" />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedClip.volume}
                            onChange={(e) => handleChange('volume', parseFloat(e.target.value))}
                            style={sliderStyle}
                        />
                        <span style={valueStyle}>{Math.round(selectedClip.volume * 100)}%</span>
                    </div>
                </div>

                {/* Timing */}
                <div style={sectionStyle}>
                    <label style={labelStyle}>Timing (Frames)</label>
                    <div style={gridStyle}>
                        <div>
                            <label style={subLabelStyle}>Start</label>
                            <input
                                type="number"
                                value={selectedClip.startFrame}
                                onChange={(e) => handleChange('startFrame', parseInt(e.target.value) || 0)}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={subLabelStyle}>Duration</label>
                            <input
                                type="number"
                                value={selectedClip.durationFrames}
                                onChange={(e) => handleChange('durationFrames', parseInt(e.target.value) || 1)}
                                style={inputStyle}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Styles
const containerStyle: React.CSSProperties = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
};

const deleteButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: 6,
    color: '#ef4444',
    cursor: 'pointer',
    transition: 'all 0.2s',
};

const contentStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
};

const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
};

const infoRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
};

const fileNameStyle: React.CSSProperties = {
    fontSize: 13,
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
};

const controlRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
};

const sliderStyle: React.CSSProperties = {
    flex: 1,
    height: 4,
    borderRadius: 2,
    accentColor: '#6366f1',
};

const valueStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    width: 36,
    textAlign: 'right',
};

const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
};

const subLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    outline: 'none',
};

const emptyStateStyle: React.CSSProperties = {
    padding: 20,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
};
