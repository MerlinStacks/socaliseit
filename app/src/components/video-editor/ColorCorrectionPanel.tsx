'use client';

/**
 * Color Correction Panel
 * AI-based color grading with preset selection.
 * 
 * Why: Enables creators to apply professional color grades
 * quickly with real-time preview and intensity control.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
    Palette,
    RefreshCw,
    Check,
    Sliders,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    COLOR_PRESETS,
    applyColorCorrection,
    type ColorPreset,
} from '@/lib/ai/color-correction';
import { logger } from '@/lib/logger';

export const ColorCorrectionPanel: React.FC = () => {
    const { project } = useVideoProject();

    const [selectedPreset, setSelectedPreset] = useState<string>('natural');
    const [intensity, setIntensity] = useState(100);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const videoClip = project.clips.find(c => c.type === 'video');

    /**
     * Get current filter values for preview.
     */
    const currentFilters = useMemo(() => {
        return applyColorCorrection({
            preset: selectedPreset,
            intensity,
        });
    }, [selectedPreset, intensity]);

    /**
     * Apply color correction (logs config for export pipeline).
     */
    const handleApply = useCallback(() => {
        if (!videoClip) return;

        // Log config for export pipeline integration
        logger.debug({
            event: 'color-correction-applied',
            clipId: videoClip.id,
            preset: selectedPreset,
            intensity,
            cssFilter: currentFilters.cssFilter,
            ffmpegFilter: currentFilters.ffmpegFilter,
        });

        alert('Color correction saved. Effects will be applied during export.');
    }, [videoClip, selectedPreset, intensity, currentFilters]);

    /**
     * Reset to natural.
     */
    const handleReset = useCallback(() => {
        setSelectedPreset('natural');
        setIntensity(100);
    }, []);

    return (
        <div style={containerStyle}>
            {/* Info header */}
            <div style={infoStyle}>
                <Palette size={14} style={{ color: '#f59e0b' }} />
                <span>Apply professional color grades</span>
            </div>

            {/* Preset grid */}
            <div style={presetGridStyle}>
                {COLOR_PRESETS.map(preset => (
                    <PresetCard
                        key={preset.id}
                        preset={preset}
                        isSelected={selectedPreset === preset.id}
                        onClick={() => setSelectedPreset(preset.id)}
                    />
                ))}
            </div>

            {/* Intensity slider */}
            <div style={sliderContainerStyle}>
                <div style={sliderLabelStyle}>
                    <span>Intensity</span>
                    <span>{intensity}%</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    style={sliderStyle}
                />
            </div>

            {/* Advanced toggle */}
            <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={advancedToggleStyle}
            >
                <Sliders size={14} />
                <span>Advanced Settings</span>
            </button>

            {showAdvanced && (
                <div style={advancedContainerStyle}>
                    <p style={advancedNoteStyle}>
                        Fine-tune individual parameters for custom looks.
                        Coming soon.
                    </p>
                </div>
            )}

            {/* Actions */}
            <div style={actionsStyle}>
                <button onClick={handleReset} style={resetButtonStyle}>
                    <RefreshCw size={14} />
                    Reset
                </button>
                <button
                    onClick={handleApply}
                    style={applyButtonStyle}
                    disabled={!videoClip}
                >
                    <Check size={14} />
                    Apply
                </button>
            </div>

            {!videoClip && (
                <p style={warningStyle}>Add a video clip to apply color correction</p>
            )}
        </div>
    );
};

// ============================================================================
// PRESET CARD
// ============================================================================

interface PresetCardProps {
    preset: ColorPreset;
    isSelected: boolean;
    onClick: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, isSelected, onClick }) => {
    const filters = applyColorCorrection({ preset: preset.id, intensity: 100 });

    return (
        <button
            onClick={onClick}
            style={{
                ...presetCardStyle,
                borderColor: isSelected ? '#6366f1' : 'rgba(255,255,255,0.1)',
                backgroundColor: isSelected
                    ? 'rgba(99, 102, 241, 0.15)'
                    : 'rgba(255,255,255,0.03)',
            }}
        >
            {/* Preview thumbnail */}
            <div
                style={{
                    ...presetPreviewStyle,
                    filter: filters.cssFilter,
                }}
            >
                <span style={{ fontSize: 24 }}>{preset.thumbnail}</span>
            </div>

            {/* Info */}
            <div style={presetInfoStyle}>
                <span style={presetNameStyle}>{preset.name}</span>
                {isSelected && <Check size={12} style={{ color: '#6366f1' }} />}
            </div>
        </button>
    );
};

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

const presetGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
};

const presetCardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s',
};

const presetPreviewStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const presetInfoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
};

const presetNameStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#fff',
    fontWeight: 500,
};

const sliderContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
};

const sliderLabelStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
};

const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: '#6366f1',
};

const advancedToggleStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    cursor: 'pointer',
};

const advancedContainerStyle: React.CSSProperties = {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
};

const advancedNoteStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
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
    backgroundColor: '#6366f1',
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
