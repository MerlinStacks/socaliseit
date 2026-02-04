'use client';

/**
 * Thumbnail Generator Panel
 * AI-scored frame extraction for video thumbnails.
 */

import React, { useState, useCallback } from 'react';
import {
    Image,
    Loader2,
    Download,
    RefreshCw,
    Star,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    extractThumbnailCandidates,
    type ThumbnailCandidate,
    type ThumbnailConfig,
    DEFAULT_THUMBNAIL_CONFIG,
} from '@/lib/ai/thumbnail-generator';

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export const ThumbnailGeneratorPanel: React.FC = () => {
    const { project } = useVideoProject();

    const [status, setStatus] = useState<AnalysisStatus>('idle');
    const [candidates, setCandidates] = useState<ThumbnailCandidate[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [config, setConfig] = useState<ThumbnailConfig>(DEFAULT_THUMBNAIL_CONFIG);

    const videoClip = project.clips.find(c => c.type === 'video');

    /**
     * Extract thumbnail candidates.
     */
    const handleAnalyze = useCallback(async () => {
        if (!videoClip?.mediaUrl) return;

        setStatus('loading');

        try {
            // Create video element for analysis
            const video = document.createElement('video');
            video.src = videoClip.mediaUrl;
            video.crossOrigin = 'anonymous';
            video.muted = true;

            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => resolve();
                video.onerror = () => reject(new Error('Failed to load video'));
            });

            const results = await extractThumbnailCandidates(video, config);
            setCandidates(results);
            setSelectedId(results[0]?.id || null);
            setStatus('success');
        } catch (err) {
            console.error('Thumbnail extraction failed:', err);
            setStatus('error');
        }
    }, [videoClip, config]);

    /**
     * Download selected thumbnail.
     */
    const handleDownload = useCallback(() => {
        const selected = candidates.find(c => c.id === selectedId);
        if (!selected) return;

        const link = document.createElement('a');
        link.download = `thumbnail-${Date.now()}.jpg`;
        link.href = selected.dataUrl;
        link.click();
    }, [candidates, selectedId]);

    /**
     * Format time for display.
     */
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div style={containerStyle}>
            {/* Info header */}
            <div style={infoStyle}>
                <Image size={14} style={{ color: '#ec4899' }} />
                <span>Extract AI-scored thumbnail frames</span>
            </div>

            {/* Config */}
            {status === 'idle' && (
                <div style={configStyle}>
                    <div style={configRowStyle}>
                        <span>Number of candidates</span>
                        <select
                            value={config.numCandidates}
                            onChange={(e) => setConfig(prev => ({
                                ...prev,
                                numCandidates: Number(e.target.value),
                            }))}
                            style={selectStyle}
                        >
                            {[4, 6, 8, 12].map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>
                    <div style={configRowStyle}>
                        <span>Prefer faces</span>
                        <input
                            type="checkbox"
                            checked={config.preferFaces}
                            onChange={(e) => setConfig(prev => ({
                                ...prev,
                                preferFaces: e.target.checked,
                            }))}
                            style={checkboxStyle}
                        />
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
                    <Star size={16} />
                    Find Best Frames
                </button>
            )}

            {/* Loading state */}
            {status === 'loading' && (
                <div style={loadingStyle}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Analyzing video frames...</p>
                    <p style={{ fontSize: 11, opacity: 0.6 }}>
                        Scoring sharpness, faces, composition
                    </p>
                </div>
            )}

            {/* Results */}
            {status === 'success' && candidates.length > 0 && (
                <div style={resultsStyle}>
                    {/* Selected preview */}
                    {selectedId && (
                        <div style={previewContainerStyle}>
                            <img
                                src={candidates.find(c => c.id === selectedId)?.dataUrl}
                                alt="Selected thumbnail"
                                style={previewImageStyle}
                            />
                        </div>
                    )}

                    {/* Candidate grid */}
                    <div style={candidateGridStyle}>
                        {candidates.map(candidate => (
                            <button
                                key={candidate.id}
                                onClick={() => setSelectedId(candidate.id)}
                                style={{
                                    ...candidateButtonStyle,
                                    borderColor: selectedId === candidate.id
                                        ? '#ec4899'
                                        : 'rgba(255,255,255,0.1)',
                                }}
                            >
                                <img
                                    src={candidate.dataUrl}
                                    alt={`Thumbnail at ${formatTime(candidate.time)}`}
                                    style={candidateImageStyle}
                                />
                                <div style={candidateInfoStyle}>
                                    <span style={candidateTimeStyle}>
                                        {formatTime(candidate.time)}
                                    </span>
                                    <span style={candidateScoreStyle}>
                                        {Math.round(candidate.score * 100)}%
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Actions */}
                    <div style={actionsStyle}>
                        <button onClick={handleAnalyze} style={reanalyzeButtonStyle}>
                            <RefreshCw size={14} />
                            Re-analyze
                        </button>
                        <button
                            onClick={handleDownload}
                            style={downloadButtonStyle}
                            disabled={!selectedId}
                        >
                            <Download size={14} />
                            Download
                        </button>
                    </div>
                </div>
            )}

            {/* Error state */}
            {status === 'error' && (
                <div style={errorStyle}>
                    <p>Failed to extract thumbnails</p>
                    <button onClick={handleAnalyze} style={retryButtonStyle}>
                        <RefreshCw size={14} />
                        Retry
                    </button>
                </div>
            )}

            {!videoClip && status === 'idle' && (
                <p style={warningStyle}>Add a video clip to generate thumbnails</p>
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

const configStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
};

const configRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
};

const selectStyle: React.CSSProperties = {
    padding: '4px 8px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 4,
    color: '#fff',
    fontSize: 11,
};

const checkboxStyle: React.CSSProperties = {
    accentColor: '#ec4899',
};

const analyzeButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 16px',
    backgroundColor: '#ec4899',
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

const previewContainerStyle: React.CSSProperties = {
    borderRadius: 8,
    overflow: 'hidden',
    border: '2px solid #ec4899',
};

const previewImageStyle: React.CSSProperties = {
    width: '100%',
    height: 'auto',
    display: 'block',
};

const candidateGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
};

const candidateButtonStyle: React.CSSProperties = {
    position: 'relative',
    padding: 0,
    backgroundColor: 'transparent',
    border: '2px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    overflow: 'hidden',
    cursor: 'pointer',
};

const candidateImageStyle: React.CSSProperties = {
    width: '100%',
    height: 50,
    objectFit: 'cover',
    display: 'block',
};

const candidateInfoStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 6px',
    backgroundColor: 'rgba(0,0,0,0.7)',
};

const candidateTimeStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'monospace',
};

const candidateScoreStyle: React.CSSProperties = {
    fontSize: 9,
    color: '#10b981',
    fontWeight: 600,
};

const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
};

const reanalyzeButtonStyle: React.CSSProperties = {
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

const downloadButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    padding: '10px 12px',
    backgroundColor: '#ec4899',
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
