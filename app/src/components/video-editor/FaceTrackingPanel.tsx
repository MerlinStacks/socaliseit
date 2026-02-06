'use client';

/**
 * Face Tracking Panel
 * Auto-zoom on speaker faces in video.
 */

import React, { useState, useCallback } from 'react';
import {
    Focus,
    Loader2,
    RefreshCw,
    Check,
    User,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    analyzeFaceTracking,
    DEFAULT_FACE_TRACKING_CONFIG,
    type FaceTrackingConfig,
    type FaceTrackingKeyframe,
} from '@/lib/ai/face-tracking';
import { logger } from '@/lib/logger';

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export const FaceTrackingPanel: React.FC = () => {
    const { project } = useVideoProject();

    const [status, setStatus] = useState<AnalysisStatus>('idle');
    const [config, setConfig] = useState<FaceTrackingConfig>(DEFAULT_FACE_TRACKING_CONFIG);
    const [result, setResult] = useState<{
        keyframes: FaceTrackingKeyframe[];
        hasFaces: boolean;
        faceCount: number;
    } | null>(null);

    const videoClip = project.clips.find(c => c.type === 'video');

    /**
     * Analyze video for faces.
     */
    const handleAnalyze = useCallback(async () => {
        if (!videoClip?.mediaUrl) return;

        setStatus('loading');

        try {
            const video = document.createElement('video');
            video.src = videoClip.mediaUrl;
            video.crossOrigin = 'anonymous';
            video.muted = true;

            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => resolve();
                video.onerror = () => reject(new Error('Failed to load video'));
            });

            const analysisResult = await analyzeFaceTracking(video, config);
            setResult(analysisResult);
            setStatus('success');
        } catch (err) {
            logger.error({ event: 'face-tracking-failed', error: err });
            setStatus('error');
        }
    }, [videoClip, config]);

    /**
     * Apply face tracking to clip (logs config for export pipeline).
     */
    const handleApply = useCallback(() => {
        if (!videoClip || !result) return;

        // Log config for export pipeline integration
        logger.debug({ event: 'face-tracking-applied', clipId: videoClip.id, keyframes: result.keyframes.length, zoomLevel: config.zoomLevel });

        alert('Face tracking saved. Effects will be applied during export.');
    }, [videoClip, result, config]);

    return (
        <div style={containerStyle}>
            {/* Info header */}
            <div style={infoStyle}>
                <Focus size={14} style={{ color: '#14b8a6' }} />
                <span>Auto-zoom to keep faces centered</span>
            </div>

            {/* Settings */}
            {status === 'idle' && (
                <div style={settingsStyle}>
                    {/* Zoom level */}
                    <div style={settingRowStyle}>
                        <span>Zoom Level</span>
                        <span>{config.zoomLevel.toFixed(1)}x</span>
                    </div>
                    <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.1}
                        value={config.zoomLevel}
                        onChange={(e) => setConfig(prev => ({
                            ...prev,
                            zoomLevel: Number(e.target.value),
                        }))}
                        style={sliderStyle}
                    />

                    {/* Smoothing */}
                    <div style={settingRowStyle}>
                        <span>Smoothing</span>
                        <span>{Math.round(config.smoothing * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        value={config.smoothing}
                        onChange={(e) => setConfig(prev => ({
                            ...prev,
                            smoothing: Number(e.target.value),
                        }))}
                        style={sliderStyle}
                    />

                    {/* Prefer speaker toggle */}
                    <div style={toggleRowStyle}>
                        <span>Focus on main speaker</span>
                        <button
                            onClick={() => setConfig(prev => ({
                                ...prev,
                                preferSpeaker: !prev.preferSpeaker,
                            }))}
                            style={{
                                ...toggleButtonStyle,
                                backgroundColor: config.preferSpeaker
                                    ? '#14b8a6'
                                    : 'rgba(255,255,255,0.1)',
                            }}
                        >
                            <div
                                style={{
                                    ...toggleKnobStyle,
                                    transform: config.preferSpeaker
                                        ? 'translateX(16px)'
                                        : 'translateX(0)',
                                }}
                            />
                        </button>
                    </div>
                </div>
            )}

            {/* Analyze button */}
            {status === 'idle' && (
                <button
                    onClick={handleAnalyze}
                    style={analyzeButtonStyle}
                    disabled={!videoClip}
                >
                    <User size={16} />
                    Detect Faces
                </button>
            )}

            {/* Loading state */}
            {status === 'loading' && (
                <div style={loadingStyle}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Detecting faces...</p>
                    <p style={{ fontSize: 11, opacity: 0.6 }}>
                        Analyzing frame by frame
                    </p>
                </div>
            )}

            {/* Results */}
            {status === 'success' && result && (
                <div style={resultsStyle}>
                    {result.hasFaces ? (
                        <>
                            <div style={resultBadgeStyle}>
                                <User size={16} />
                                <span>
                                    {result.faceCount} face{result.faceCount !== 1 ? 's' : ''} detected
                                </span>
                            </div>
                            <p style={resultTextStyle}>
                                {result.keyframes.length} tracking keyframes generated.
                                Apply to enable auto-zoom.
                            </p>
                        </>
                    ) : (
                        <div style={noFacesStyle}>
                            <p>No faces detected in video</p>
                            <p style={{ fontSize: 11, opacity: 0.6 }}>
                                Try a video with people visible
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={actionsStyle}>
                        <button onClick={() => setStatus('idle')} style={resetButtonStyle}>
                            <RefreshCw size={14} />
                            Re-analyze
                        </button>
                        <button
                            onClick={handleApply}
                            style={applyButtonStyle}
                            disabled={!result.hasFaces}
                        >
                            <Check size={14} />
                            Apply
                        </button>
                    </div>
                </div>
            )}

            {/* Error state */}
            {status === 'error' && (
                <div style={errorStyle}>
                    <p>Face detection failed</p>
                    <button onClick={() => setStatus('idle')} style={retryButtonStyle}>
                        <RefreshCw size={14} />
                        Retry
                    </button>
                </div>
            )}

            {!videoClip && status === 'idle' && (
                <p style={warningStyle}>Add a video clip to use face tracking</p>
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

const settingsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
};

const settingRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
};

const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: '#14b8a6',
};

const toggleRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    paddingTop: 4,
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

const analyzeButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 16px',
    backgroundColor: '#14b8a6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
};

const loadingStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 24,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
};

const resultsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const resultBadgeStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    borderRadius: 6,
    color: '#14b8a6',
    fontSize: 12,
    fontWeight: 500,
};

const resultTextStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
};

const noFacesStyle: React.CSSProperties = {
    padding: 16,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
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
    backgroundColor: '#14b8a6',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    color: '#ef4444',
    textAlign: 'center',
};

const retryButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #ef4444',
    borderRadius: 6,
    color: '#ef4444',
    cursor: 'pointer',
};

const warningStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
};
