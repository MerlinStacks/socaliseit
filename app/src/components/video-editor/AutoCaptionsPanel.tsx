'use client';

/**
 * Auto-Captions Panel
 * UI for generating and styling captions from video audio.
 * 
 * Why: Most requested feature for social content creation.
 */

import React, { useState, useCallback } from 'react';
import {
    Captions,
    Loader2,
    Check,
    Download,
    RefreshCw,
    ChevronDown,
    Palette,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    transcribeFromUrl,
    TranscriptionResult,
    splitLongSegments,
    exportToSrt,
    exportToVtt,
} from '@/lib/ai/transcription';
import {
    CAPTION_STYLES,
    CaptionStyle,
    getDefaultCaptionStyle,
} from '@/lib/ai/caption-styles';

type TranscriptionStatus = 'idle' | 'loading' | 'success' | 'error';

export const AutoCaptionsPanel: React.FC = () => {
    const { project, addTextOverlay } = useVideoProject();
    const fps = project.fps;

    const [status, setStatus] = useState<TranscriptionStatus>('idle');
    const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
    const [selectedStyle, setSelectedStyle] = useState<CaptionStyle>(getDefaultCaptionStyle());
    const [error, setError] = useState<string | null>(null);
    const [showStylePicker, setShowStylePicker] = useState(false);

    // Get first video clip URL for transcription
    const videoUrl = project.clips[0]?.mediaUrl;

    /**
     * Generate captions from video audio
     */
    const handleGenerate = useCallback(async () => {
        if (!videoUrl) {
            setError('No video clip found. Add a video first.');
            return;
        }

        setStatus('loading');
        setError(null);

        try {
            const result = await transcribeFromUrl(videoUrl, {
                wordTimestamps: true,
            });

            // Split long segments for better caption display
            const processedSegments = splitLongSegments(result.segments, 3, 8);

            setTranscription({
                ...result,
                segments: processedSegments,
            });
            setStatus('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Transcription failed');
            setStatus('error');
        }
    }, [videoUrl]);

    /**
     * Apply captions as text overlays
     */
    const handleApplyCaptions = useCallback(() => {
        if (!transcription) return;

        // Add each segment as a text overlay
        for (const segment of transcription.segments) {
            const startFrame = Math.round(segment.startTime * fps);
            const endFrame = Math.round(segment.endTime * fps);
            const durationFrames = endFrame - startFrame;

            addTextOverlay({
                text: segment.text,
                startFrame,
                durationFrames,
                position: { x: 540, y: 1600 }, // Bottom center for portrait
                style: {
                    fontSize: selectedStyle.fontSize,
                    fontFamily: selectedStyle.fontFamily,
                    color: selectedStyle.color,
                    backgroundColor: selectedStyle.backgroundColor,
                    fontWeight: selectedStyle.fontWeight === 'normal' ? 'normal' : 'bold',
                },
                animation: (selectedStyle.animation === 'fade' || selectedStyle.animation === 'typewriter')
                    ? selectedStyle.animation
                    : 'none',
            });
        }
    }, [transcription, fps, selectedStyle, addTextOverlay]);

    /**
     * Export captions as SRT file
     */
    const handleExportSrt = useCallback(() => {
        if (!transcription) return;

        const srtContent = exportToSrt(transcription.segments);
        const blob = new Blob([srtContent], { type: 'text/srt' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'captions.srt';
        a.click();
        URL.revokeObjectURL(url);
    }, [transcription]);

    /**
     * Export captions as VTT file
     */
    const handleExportVtt = useCallback(() => {
        if (!transcription) return;

        const vttContent = exportToVtt(transcription.segments);
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'captions.vtt';
        a.click();
        URL.revokeObjectURL(url);
    }, [transcription]);

    return (
        <div style={containerStyle}>
            {/* Generate button */}
            {status === 'idle' && (
                <button
                    onClick={handleGenerate}
                    style={generateButtonStyle}
                    disabled={!videoUrl}
                >
                    <Captions size={18} />
                    <span>Generate Captions</span>
                </button>
            )}

            {/* Loading state */}
            {status === 'loading' && (
                <div style={loadingStyle}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Transcribing audio...</p>
                    <p style={{ fontSize: 11, opacity: 0.6 }}>This may take a minute</p>
                </div>
            )}

            {/* Error state */}
            {status === 'error' && (
                <div style={errorStyle}>
                    <p>{error}</p>
                    <button onClick={handleGenerate} style={retryButtonStyle}>
                        <RefreshCw size={14} />
                        Retry
                    </button>
                </div>
            )}

            {/* Success - show transcription */}
            {status === 'success' && transcription && (
                <div style={resultContainerStyle}>
                    {/* Stats */}
                    <div style={statsStyle}>
                        <Check size={16} style={{ color: '#22c55e' }} />
                        <span>{transcription.segments.length} captions</span>
                        <span>•</span>
                        <span>{Math.round(transcription.duration)}s</span>
                    </div>

                    {/* Style picker */}
                    <div style={stylePickerContainer}>
                        <label style={labelStyle}>Caption Style</label>
                        <button
                            onClick={() => setShowStylePicker(!showStylePicker)}
                            style={styleButtonStyle}
                        >
                            <Palette size={14} />
                            <span>{selectedStyle.name}</span>
                            <ChevronDown size={14} />
                        </button>

                        {showStylePicker && (
                            <div style={styleDropdownStyle}>
                                {CAPTION_STYLES.map(style => (
                                    <button
                                        key={style.id}
                                        onClick={() => {
                                            setSelectedStyle(style);
                                            setShowStylePicker(false);
                                        }}
                                        style={{
                                            ...styleOptionStyle,
                                            backgroundColor: selectedStyle.id === style.id
                                                ? 'rgba(99, 102, 241, 0.2)'
                                                : 'transparent',
                                        }}
                                    >
                                        <span style={{ fontWeight: 600 }}>{style.name}</span>
                                        <span style={{ fontSize: 11, opacity: 0.6 }}>
                                            {style.description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    <div style={previewStyle}>
                        <div style={{
                            ...getCaptionPreviewStyle(selectedStyle),
                            maxWidth: '90%',
                        }}>
                            {transcription.segments[0]?.text || 'Preview caption'}
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={actionsStyle}>
                        <button onClick={handleApplyCaptions} style={applyButtonStyle}>
                            <Check size={14} />
                            Apply to Timeline
                        </button>

                        <div style={exportButtonsStyle}>
                            <button onClick={handleExportSrt} style={exportButtonStyle}>
                                <Download size={12} />
                                SRT
                            </button>
                            <button onClick={handleExportVtt} style={exportButtonStyle}>
                                <Download size={12} />
                                VTT
                            </button>
                        </div>
                    </div>

                    {/* Regenerate */}
                    <button onClick={handleGenerate} style={regenerateButtonStyle}>
                        <RefreshCw size={14} />
                        Regenerate
                    </button>
                </div>
            )}

            {/* No video warning */}
            {!videoUrl && status === 'idle' && (
                <p style={warningStyle}>
                    Add a video clip to generate captions
                </p>
            )}

            {/* Keyframes animation for spinner */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

// Helper to generate caption preview style
function getCaptionPreviewStyle(style: CaptionStyle): React.CSSProperties {
    return {
        fontSize: Math.min(style.fontSize * 0.5, 18),
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight === 'black' ? 900 : style.fontWeight === 'bold' ? 700 : 400,
        color: style.color,
        backgroundColor: style.backgroundColor || 'transparent',
        padding: style.backgroundPadding * 0.5,
        borderRadius: style.borderRadius * 0.5,
        textShadow: style.textShadow,
        textTransform: style.textTransform,
        textAlign: 'center' as const,
    };
}

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const generateButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 20px',
    backgroundColor: '#6366f1',
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

const errorStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
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

const resultContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const statsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 6,
    color: '#22c55e',
    fontSize: 13,
};

const stylePickerContainer: React.CSSProperties = {
    position: 'relative',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
};

const styleButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};

const styleDropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 10,
    maxHeight: 300,
    overflowY: 'auto',
};

const styleOptionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
};

const previewStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    minHeight: 60,
};

const actionsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const applyButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '12px 16px',
    backgroundColor: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
};

const exportButtonsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
};

const exportButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    padding: '8px 12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    cursor: 'pointer',
    justifyContent: 'center',
};

const regenerateButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    cursor: 'pointer',
};

const warningStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
};
