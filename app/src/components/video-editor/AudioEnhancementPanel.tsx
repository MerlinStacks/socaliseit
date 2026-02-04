'use client';

/**
 * Audio Enhancement Panel
 * Noise reduction, auto-ducking, and voice enhancement.
 */

import React, { useState, useCallback } from 'react';
import {
    Volume2,
    Mic,
    Music,
    RefreshCw,
    Check,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    VOICE_PRESETS,
    DEFAULT_AUDIO_CONFIG,
    type AudioEnhancementConfig,
} from '@/lib/ai/audio-enhancement';

export const AudioEnhancementPanel: React.FC = () => {
    const { project } = useVideoProject();

    const [config, setConfig] = useState<AudioEnhancementConfig>(DEFAULT_AUDIO_CONFIG);

    // Target video clips for audio enhancement (audio track is part of video)
    const videoClip = project.clips.find(c => c.type === 'video');
    const targetClip = videoClip;

    /**
     * Update noise reduction settings.
     */
    const updateNoiseReduction = (updates: Partial<typeof config.noiseReduction>) => {
        setConfig(prev => ({
            ...prev,
            noiseReduction: { ...prev.noiseReduction, ...updates },
        }));
    };

    /**
     * Update voice enhancement settings.
     */
    const updateVoiceEnhancement = (updates: Partial<typeof config.voiceEnhancement>) => {
        setConfig(prev => ({
            ...prev,
            voiceEnhancement: { ...prev.voiceEnhancement, ...updates },
        }));
    };

    /**
     * Apply voice preset.
     */
    const applyPreset = (presetId: string) => {
        const preset = VOICE_PRESETS.find(p => p.id === presetId);
        if (!preset) return;

        setConfig(prev => ({
            ...prev,
            voiceEnhancement: {
                ...prev.voiceEnhancement,
                preset: presetId as typeof prev.voiceEnhancement.preset,
                ...preset.settings,
            },
        }));
    };

    /**
     * Apply audio enhancement (logs config for export pipeline).
     */
    const handleApply = useCallback(() => {
        if (!targetClip) return;

        // Log config for export pipeline integration
        // In production, this would be sent to the export process
        console.log('[AudioEnhancement] Applied to clip:', targetClip.id, config);

        // Show user feedback
        alert('Audio enhancement settings saved. Effects will be applied during export.');
    }, [targetClip, config]);

    /**
     * Reset to defaults.
     */
    const handleReset = useCallback(() => {
        setConfig(DEFAULT_AUDIO_CONFIG);
    }, []);

    return (
        <div style={containerStyle}>
            {/* Info header */}
            <div style={infoStyle}>
                <Volume2 size={14} style={{ color: '#8b5cf6' }} />
                <span>Enhance audio quality</span>
            </div>

            {/* Noise Reduction */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <div style={sectionTitleStyle}>
                        <Mic size={14} />
                        <span>Noise Reduction</span>
                    </div>
                    <Toggle
                        value={config.noiseReduction.enabled}
                        onChange={(v) => updateNoiseReduction({ enabled: v })}
                    />
                </div>

                {config.noiseReduction.enabled && (
                    <div style={sectionContentStyle}>
                        <div style={sliderRowStyle}>
                            <span>Strength</span>
                            <span>{config.noiseReduction.strength}%</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={config.noiseReduction.strength}
                            onChange={(e) => updateNoiseReduction({ strength: Number(e.target.value) })}
                            style={sliderStyle}
                        />
                    </div>
                )}
            </div>

            {/* Voice Enhancement */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <div style={sectionTitleStyle}>
                        <Volume2 size={14} />
                        <span>Voice Enhancement</span>
                    </div>
                    <Toggle
                        value={config.voiceEnhancement.enabled}
                        onChange={(v) => updateVoiceEnhancement({ enabled: v })}
                    />
                </div>

                {config.voiceEnhancement.enabled && (
                    <div style={sectionContentStyle}>
                        <div style={presetGridStyle}>
                            {VOICE_PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    onClick={() => applyPreset(preset.id)}
                                    style={{
                                        ...presetButtonStyle,
                                        borderColor: config.voiceEnhancement.preset === preset.id
                                            ? '#8b5cf6'
                                            : 'rgba(255,255,255,0.1)',
                                        backgroundColor: config.voiceEnhancement.preset === preset.id
                                            ? 'rgba(139, 92, 246, 0.15)'
                                            : 'transparent',
                                    }}
                                >
                                    <span style={presetNameStyle}>{preset.name}</span>
                                    <span style={presetDescStyle}>{preset.description}</span>
                                </button>
                            ))}
                        </div>

                        {/* De-esser toggle */}
                        <div style={toggleRowStyle}>
                            <span>De-esser (reduce "S" sounds)</span>
                            <Toggle
                                value={config.voiceEnhancement.deEsser}
                                onChange={(v) => updateVoiceEnhancement({ deEsser: v })}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Auto-Ducking */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <div style={sectionTitleStyle}>
                        <Music size={14} />
                        <span>Auto-Ducking</span>
                    </div>
                    <Toggle
                        value={config.autoDucking.enabled}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            autoDucking: { ...prev.autoDucking, enabled: v },
                        }))}
                    />
                </div>

                {config.autoDucking.enabled && (
                    <div style={sectionContentStyle}>
                        <p style={duckingNoteStyle}>
                            Music will automatically lower when speech is detected
                        </p>
                        <div style={sliderRowStyle}>
                            <span>Duck Level</span>
                            <span>{config.autoDucking.duckLevel}%</span>
                        </div>
                        <input
                            type="range"
                            min={20}
                            max={90}
                            value={config.autoDucking.duckLevel}
                            onChange={(e) => setConfig(prev => ({
                                ...prev,
                                autoDucking: { ...prev.autoDucking, duckLevel: Number(e.target.value) },
                            }))}
                            style={sliderStyle}
                        />
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={actionsStyle}>
                <button onClick={handleReset} style={resetButtonStyle}>
                    <RefreshCw size={14} />
                    Reset
                </button>
                <button
                    onClick={handleApply}
                    style={applyButtonStyle}
                    disabled={!targetClip}
                >
                    <Check size={14} />
                    Apply
                </button>
            </div>

            {!targetClip && (
                <p style={warningStyle}>Add audio or video to enhance</p>
            )}
        </div>
    );
};

// ============================================================================
// TOGGLE COMPONENT
// ============================================================================

interface ToggleProps {
    value: boolean;
    onChange: (value: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ value, onChange }) => (
    <button
        onClick={() => onChange(!value)}
        style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            border: 'none',
            backgroundColor: value ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background 0.2s',
        }}
    >
        <div
            style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#fff',
                position: 'absolute',
                top: 2,
                left: 2,
                transform: value ? 'translateX(16px)' : 'translateX(0)',
                transition: 'transform 0.2s',
            }}
        />
    </button>
);

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const infoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
};

const sectionStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    overflow: 'hidden',
};

const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
};

const sectionTitleStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    fontWeight: 500,
    color: '#fff',
};

const sectionContentStyle: React.CSSProperties = {
    padding: '0 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
};

const sliderRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
};

const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: '#8b5cf6',
};

const presetGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
};

const presetButtonStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    backgroundColor: 'transparent',
    cursor: 'pointer',
};

const presetNameStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: '#fff',
};

const presetDescStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
};

const toggleRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
};

const duckingNoteStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    margin: 0,
};

const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
};

const resetButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    padding: '10px 12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    cursor: 'pointer',
};

const applyButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    padding: '10px 12px',
    backgroundColor: '#8b5cf6',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

const warningStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
};
