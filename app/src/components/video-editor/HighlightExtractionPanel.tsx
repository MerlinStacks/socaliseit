'use client';

/**
 * Highlight Extraction Panel
 * AI-powered detection of engaging moments for short-form content.
 * 
 * Why: Enables creators to quickly extract the best parts of long-form
 * videos for TikTok, Reels, YouTube Shorts, and other platforms.
 */

import React, { useState, useCallback } from 'react';
import {
    Sparkles,
    Loader2,
    RefreshCw,
    Download,
    Clock,
    Zap,
    ChevronRight,
    Check,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    detectHighlights,
    type Highlight,
    type HighlightDetectionConfig,
} from '@/lib/ai/highlight-detection';

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

interface PlatformPreset {
    id: string;
    name: string;
    icon: string;
    maxDuration: number;
    description: string;
}

const PLATFORM_PRESETS: PlatformPreset[] = [
    {
        id: 'tiktok',
        name: 'TikTok',
        icon: '🎵',
        maxDuration: 60,
        description: 'Up to 60s vertical video',
    },
    {
        id: 'instagram',
        name: 'Reels',
        icon: '📱',
        maxDuration: 90,
        description: 'Up to 90s vertical video',
    },
    {
        id: 'youtube',
        name: 'Shorts',
        icon: '▶️',
        maxDuration: 60,
        description: 'Up to 60s vertical video',
    },
    {
        id: 'twitter',
        name: 'X/Twitter',
        icon: '🐦',
        maxDuration: 140,
        description: 'Up to 2:20 any format',
    },
];

export const HighlightExtractionPanel: React.FC = () => {
    const { project } = useVideoProject();
    const fps = project.fps;

    const [status, setStatus] = useState<AnalysisStatus>('idle');
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedPlatform, setSelectedPlatform] = useState<string>('tiktok');
    const [selectedHighlights, setSelectedHighlights] = useState<Set<string>>(new Set());
    const [numHighlights, setNumHighlights] = useState(3);

    const videoClip = project.clips.find(c => c.type === 'video');
    const videoUrl = videoClip?.mediaUrl;
    const totalFrames = project.clips.reduce(
        (max, c) => Math.max(max, c.startFrame + c.durationFrames),
        0
    );
    const videoDuration = totalFrames / fps;

    const activePlatform = PLATFORM_PRESETS.find(p => p.id === selectedPlatform);

    /**
     * Analyze video and detect highlights using AI
     */
    const handleAnalyze = useCallback(async () => {
        if (!videoUrl || totalFrames === 0) {
            setError('Add a video to the timeline first');
            return;
        }

        setStatus('loading');
        setError(null);

        try {
            const config: HighlightDetectionConfig = {
                fps,
                totalFrames,
                minDuration: 5,
                maxDuration: activePlatform?.maxDuration || 60,
                numHighlights,
                platform: selectedPlatform as 'tiktok' | 'instagram' | 'youtube' | 'twitter',
            };

            const result = await detectHighlights(videoUrl, config);

            setHighlights(result.highlights);
            setSelectedHighlights(new Set(result.highlights.map(h => h.id)));
            setStatus('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Highlight detection failed');
            setStatus('error');
        }
    }, [videoUrl, totalFrames, fps, numHighlights, selectedPlatform, activePlatform]);

    /**
     * Toggle highlight selection
     */
    const toggleHighlight = (highlightId: string) => {
        setSelectedHighlights(prev => {
            const next = new Set(prev);
            if (next.has(highlightId)) {
                next.delete(highlightId);
            } else {
                next.add(highlightId);
            }
            return next;
        });
    };

    /**
     * Export selected highlights
     */
    const handleExport = useCallback(() => {
        const selected = highlights.filter(h => selectedHighlights.has(h.id));
        if (selected.length === 0) {
            setError('Select at least one highlight to export');
            return;
        }

        // In production, this would trigger the video export modal
        // with the selected time ranges pre-configured
        alert(`Ready to export ${selected.length} highlight clip(s). Export functionality will use the Video Export Modal.`);
    }, [highlights, selectedHighlights]);

    /**
     * Format time for display
     */
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    /**
     * Get highlight type color
     */
    const getTypeColor = (type: Highlight['type']): string => {
        switch (type) {
            case 'hook': return '#f59e0b';
            case 'peak': return '#10b981';
            case 'climax': return '#6366f1';
            case 'closing': return '#8b5cf6';
            default: return '#64748b';
        }
    };

    return (
        <div style={containerStyle}>
            {/* Info header */}
            <div style={infoStyle}>
                <Sparkles size={14} style={{ color: '#fbbf24' }} />
                <span>Find the best moments for short-form content</span>
            </div>

            {/* Platform selector */}
            {(status === 'idle' || status === 'error') && (
                <div style={platformSelectorStyle}>
                    {PLATFORM_PRESETS.map(platform => (
                        <button
                            key={platform.id}
                            onClick={() => setSelectedPlatform(platform.id)}
                            style={{
                                ...platformButtonStyle,
                                backgroundColor: selectedPlatform === platform.id
                                    ? 'rgba(99, 102, 241, 0.2)'
                                    : 'rgba(255,255,255,0.03)',
                                borderColor: selectedPlatform === platform.id
                                    ? '#6366f1'
                                    : 'rgba(255,255,255,0.1)',
                            }}
                        >
                            <span style={{ fontSize: 16 }}>{platform.icon}</span>
                            <span style={{ fontSize: 11 }}>{platform.name}</span>
                            {selectedPlatform === platform.id && (
                                <Check size={12} style={{ color: '#6366f1' }} />
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Settings */}
            {(status === 'idle' || status === 'error') && (
                <div style={settingsStyle}>
                    <div style={settingRowStyle}>
                        <label style={settingLabelStyle}>
                            Number of highlights: {numHighlights}
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={6}
                            value={numHighlights}
                            onChange={(e) => setNumHighlights(Number(e.target.value))}
                            style={sliderStyle}
                        />
                    </div>
                    {activePlatform && (
                        <div style={platformInfoStyle}>
                            <Clock size={12} />
                            <span>Max {activePlatform.maxDuration}s per clip</span>
                        </div>
                    )}
                </div>
            )}

            {/* Analyze button */}
            {status === 'idle' && (
                <button
                    onClick={handleAnalyze}
                    style={analyzeButtonStyle}
                    disabled={!videoUrl}
                >
                    <Zap size={18} />
                    <span>Find Highlights</span>
                </button>
            )}

            {/* Loading state */}
            {status === 'loading' && (
                <div style={loadingStyle}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Analyzing video content...</p>
                    <p style={{ fontSize: 11, opacity: 0.6 }}>
                        Detecting high-engagement moments
                    </p>
                </div>
            )}

            {/* Error state */}
            {status === 'error' && (
                <div style={errorStyle}>
                    <p>{error}</p>
                    <button onClick={handleAnalyze} style={retryButtonStyle}>
                        <RefreshCw size={14} />
                        Retry
                    </button>
                </div>
            )}

            {/* Results */}
            {status === 'success' && highlights.length > 0 && (
                <div style={resultsContainerStyle}>
                    {/* Stats */}
                    <div style={statsStyle}>
                        <span style={statBadgeStyle}>
                            {highlights.length} highlights found
                        </span>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>
                            {selectedHighlights.size} selected
                        </span>
                    </div>

                    {/* Highlights list */}
                    <div style={highlightListStyle}>
                        {highlights.map((highlight, index) => {
                            const isSelected = selectedHighlights.has(highlight.id);
                            const duration = highlight.endTime - highlight.startTime;

                            return (
                                <button
                                    key={highlight.id}
                                    onClick={() => toggleHighlight(highlight.id)}
                                    style={{
                                        ...highlightItemStyle,
                                        borderColor: isSelected
                                            ? '#6366f1'
                                            : 'rgba(255,255,255,0.1)',
                                        backgroundColor: isSelected
                                            ? 'rgba(99, 102, 241, 0.1)'
                                            : 'rgba(255,255,255,0.02)',
                                    }}
                                >
                                    {/* Type badge */}
                                    <div
                                        style={{
                                            ...typeBadgeStyle,
                                            backgroundColor: `${getTypeColor(highlight.type)}20`,
                                            color: getTypeColor(highlight.type),
                                        }}
                                    >
                                        {highlight.type}
                                    </div>

                                    {/* Info */}
                                    <div style={highlightInfoStyle}>
                                        <div style={highlightTimesStyle}>
                                            {formatTime(highlight.startTime)}
                                            <ChevronRight size={12} />
                                            {formatTime(highlight.endTime)}
                                            <span style={durationBadgeStyle}>
                                                {duration.toFixed(1)}s
                                            </span>
                                        </div>
                                        <div style={highlightReasonStyle}>
                                            {highlight.reason}
                                        </div>
                                    </div>

                                    {/* Score */}
                                    <div style={scoreStyle}>
                                        {Math.round(highlight.score * 100)}%
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Actions */}
                    <div style={actionsStyle}>
                        <button
                            onClick={() => setSelectedHighlights(
                                selectedHighlights.size === highlights.length
                                    ? new Set()
                                    : new Set(highlights.map(h => h.id))
                            )}
                            style={actionButtonStyle}
                        >
                            {selectedHighlights.size === highlights.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <button
                            onClick={handleExport}
                            style={exportButtonStyle}
                            disabled={selectedHighlights.size === 0}
                        >
                            <Download size={14} />
                            Export ({selectedHighlights.size})
                        </button>
                    </div>

                    {/* Re-analyze */}
                    <button onClick={handleAnalyze} style={reanalyzeButtonStyle}>
                        <RefreshCw size={14} />
                        Re-analyze
                    </button>
                </div>
            )}

            {/* No highlights found */}
            {status === 'success' && highlights.length === 0 && (
                <div style={emptyStyle}>
                    <p>No highlights detected</p>
                    <p style={{ fontSize: 11, opacity: 0.6 }}>
                        Try adjusting settings or using a video with more varied content
                    </p>
                    <button onClick={handleAnalyze} style={reanalyzeButtonStyle}>
                        <RefreshCw size={14} />
                        Try again
                    </button>
                </div>
            )}

            {/* No video warning */}
            {!videoUrl && status === 'idle' && (
                <p style={warningStyle}>
                    Add a video clip to find highlights
                </p>
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

const platformSelectorStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6,
};

const platformButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};

const settingsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
};

const settingRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const settingLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
};

const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: '#6366f1',
};

const platformInfoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
};

const analyzeButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 20px',
    backgroundColor: '#f59e0b',
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

const resultsContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const statsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
};

const statBadgeStyle: React.CSSProperties = {
    padding: '4px 10px',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    color: '#f59e0b',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
};

const highlightListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 220,
    overflowY: 'auto',
};

const highlightItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left',
};

const typeBadgeStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
};

const highlightInfoStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
};

const highlightTimesStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    color: '#fff',
    fontFamily: 'monospace',
};

const durationBadgeStyle: React.CSSProperties = {
    marginLeft: 6,
    padding: '1px 6px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
};

const highlightReasonStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const scoreStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#10b981',
    fontWeight: 600,
    flexShrink: 0,
};

const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
};

const actionButtonStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    cursor: 'pointer',
};

const exportButtonStyle: React.CSSProperties = {
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

const reanalyzeButtonStyle: React.CSSProperties = {
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

const emptyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 24,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
};

const warningStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
};
