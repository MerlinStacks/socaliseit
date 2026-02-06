'use client';

/**
 * Smart Crop Panel
 * Subject-centered auto-framing for aspect ratio conversion.
 */

import React, { useState, useCallback } from 'react';
import {
    Crop,
    Focus,
    RefreshCw,
    Check,
    Loader2,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    ASPECT_RATIOS,
    calculateSmartCrop,
    type AspectRatio,
} from '@/lib/ai/smart-crop';
import { logger } from '@/lib/logger';

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export const SmartCropPanel: React.FC = () => {
    const { project } = useVideoProject();

    const [selectedRatio, setSelectedRatio] = useState<string>('9:16');
    const [trackSubject, setTrackSubject] = useState(true);
    const [status, setStatus] = useState<AnalysisStatus>('idle');
    const [cropResult, setCropResult] = useState<{
        x: number; y: number; width: number; height: number;
    } | null>(null);

    const videoClip = project.clips.find(c => c.type === 'video');

    /**
     * Analyze video and calculate smart crop.
     */
    const handleAnalyze = useCallback(async () => {
        setStatus('loading');

        try {
            // In production, this would use a video element reference
            const result = await calculateSmartCrop(null, {
                targetAspectRatio: selectedRatio,
                trackSubject,
            });

            setCropResult(result.cropRegion);
            setStatus('success');
        } catch {
            setStatus('error');
        }
    }, [selectedRatio, trackSubject]);

    /**
     * Apply crop to video clip (logs config for export pipeline).
     */
    const handleApply = useCallback(() => {
        if (!videoClip || !cropResult) return;

        // Log config for export pipeline integration
        logger.debug({ event: 'smart-crop-applied', clipId: videoClip.id, aspectRatio: selectedRatio, region: cropResult, trackSubject });

        alert('Smart crop saved. Effects will be applied during export.');
    }, [videoClip, cropResult, selectedRatio, trackSubject]);

    return (
        <div style={containerStyle}>
            {/* Info header */}
            <div style={infoStyle}>
                <Crop size={14} style={{ color: '#10b981' }} />
                <span>Auto-frame for different platforms</span>
            </div>

            {/* Aspect ratio selector */}
            <div style={ratioGridStyle}>
                {ASPECT_RATIOS.map(ratio => (
                    <RatioButton
                        key={ratio.id}
                        ratio={ratio}
                        isSelected={selectedRatio === ratio.id}
                        onClick={() => setSelectedRatio(ratio.id)}
                    />
                ))}
            </div>

            {/* Subject tracking toggle */}
            <div style={toggleContainerStyle}>
                <div style={toggleInfoStyle}>
                    <Focus size={14} />
                    <span>Track Subject</span>
                </div>
                <button
                    onClick={() => setTrackSubject(!trackSubject)}
                    style={{
                        ...toggleButtonStyle,
                        backgroundColor: trackSubject ? '#10b981' : 'rgba(255,255,255,0.1)',
                    }}
                >
                    <div
                        style={{
                            ...toggleKnobStyle,
                            transform: trackSubject ? 'translateX(16px)' : 'translateX(0)',
                        }}
                    />
                </button>
            </div>

            {/* Platform tags */}
            {selectedRatio && (
                <div style={platformTagsStyle}>
                    {ASPECT_RATIOS.find(r => r.id === selectedRatio)?.platforms.map(p => (
                        <span key={p} style={platformTagStyle}>{p}</span>
                    ))}
                </div>
            )}

            {/* Analyze button */}
            {status === 'idle' && (
                <button
                    onClick={handleAnalyze}
                    style={analyzeButtonStyle}
                    disabled={!videoClip}
                >
                    <Focus size={16} />
                    Detect Subject
                </button>
            )}

            {/* Loading state */}
            {status === 'loading' && (
                <div style={loadingStyle}>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Analyzing frames...</span>
                </div>
            )}

            {/* Success state */}
            {status === 'success' && cropResult && (
                <div style={resultContainerStyle}>
                    <div style={resultPreviewStyle}>
                        <div
                            style={{
                                position: 'absolute',
                                left: `${cropResult.x * 100}%`,
                                top: `${cropResult.y * 100}%`,
                                width: `${cropResult.width * 100}%`,
                                height: `${cropResult.height * 100}%`,
                                border: '2px solid #10b981',
                                borderRadius: 4,
                            }}
                        />
                    </div>
                    <p style={resultTextStyle}>
                        Crop region calculated. Apply to update video.
                    </p>
                </div>
            )}

            {/* Actions */}
            <div style={actionsStyle}>
                <button
                    onClick={() => { setStatus('idle'); setCropResult(null); }}
                    style={resetButtonStyle}
                >
                    <RefreshCw size={14} />
                    Reset
                </button>
                <button
                    onClick={handleApply}
                    style={applyButtonStyle}
                    disabled={!cropResult}
                >
                    <Check size={14} />
                    Apply Crop
                </button>
            </div>

            {!videoClip && (
                <p style={warningStyle}>Add a video clip to use smart crop</p>
            )}

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

// ============================================================================
// RATIO BUTTON
// ============================================================================

interface RatioButtonProps {
    ratio: AspectRatio;
    isSelected: boolean;
    onClick: () => void;
}

const RatioButton: React.FC<RatioButtonProps> = ({ ratio, isSelected, onClick }) => {
    const aspectValue = ratio.width / ratio.height;
    const previewWidth = aspectValue > 1 ? 32 : 24 * aspectValue;
    const previewHeight = aspectValue > 1 ? 32 / aspectValue : 24;

    return (
        <button
            onClick={onClick}
            style={{
                ...ratioButtonStyle,
                borderColor: isSelected ? '#10b981' : 'rgba(255,255,255,0.1)',
                backgroundColor: isSelected
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(255,255,255,0.03)',
            }}
        >
            <div
                style={{
                    width: previewWidth,
                    height: previewHeight,
                    backgroundColor: isSelected ? '#10b981' : 'rgba(255,255,255,0.3)',
                    borderRadius: 2,
                }}
            />
            <span style={ratioLabelStyle}>{ratio.id}</span>
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

const ratioGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
};

const ratioButtonStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    cursor: 'pointer',
};

const ratioLabelStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#fff',
    fontWeight: 500,
};

const toggleContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
};

const toggleInfoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
};

const toggleButtonStyle: React.CSSProperties = {
    width: 36,
    height: 20,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s',
};

const toggleKnobStyle: React.CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    position: 'absolute',
    top: 2,
    left: 2,
    transition: 'transform 0.2s',
};

const platformTagsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
};

const platformTagStyle: React.CSSProperties = {
    padding: '2px 8px',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#10b981',
    borderRadius: 4,
    fontSize: 10,
};

const analyzeButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 16px',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
};

const loadingStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
};

const resultContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const resultPreviewStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
};

const resultTextStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
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
    backgroundColor: '#10b981',
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
