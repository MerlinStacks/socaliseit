'use client';

/**
 * Silence Removal Panel
 * UI for detecting and removing silent gaps from video/audio.
 * 
 * Why: Quick way to tighten edits and remove dead air.
 */

import React, { useState, useCallback } from 'react';
import {
    Scissors,
    Loader2,
    Trash2,
    RefreshCw,
    Settings,
    Eye,
    EyeOff,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    analyzeAudioClient,
    SilenceGap,
    SilenceConfig,
    DEFAULT_SILENCE_CONFIG,
    applySilencePadding,
} from '@/lib/ai/audio-analysis';

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export const SilenceRemovalPanel: React.FC = () => {
    const { project, splitClipAtPoints } = useVideoProject();
    const fps = project.fps;

    const [status, setStatus] = useState<AnalysisStatus>('idle');
    const [silenceGaps, setSilenceGaps] = useState<SilenceGap[]>([]);
    const [selectedGaps, setSelectedGaps] = useState<Set<number>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [config, setConfig] = useState<SilenceConfig>(DEFAULT_SILENCE_CONFIG);

    // Get first audio source (video clip or audio clip)
    const audioUrl = project.clips[0]?.mediaUrl || project.audioClips[0]?.mediaUrl;
    const firstClip = project.clips[0];

    /**
     * Analyze audio for silence
     */
    const handleAnalyze = useCallback(async () => {
        if (!audioUrl) {
            setError('No audio source found. Add a video or audio clip first.');
            return;
        }

        setStatus('loading');
        setError(null);

        try {
            const result = await analyzeAudioClient(audioUrl, config, fps);
            const paddedGaps = applySilencePadding(result.silenceGaps, config.paddingMs, fps);
            setSilenceGaps(paddedGaps);
            setSelectedGaps(new Set(paddedGaps.map((_, i) => i))); // Select all by default
            setStatus('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed');
            setStatus('error');
        }
    }, [audioUrl, config, fps]);

    /**
     * Toggle gap selection
     */
    const toggleGap = useCallback((index: number) => {
        setSelectedGaps(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    }, []);

    /**
     * Select/deselect all gaps
     */
    const toggleAllGaps = useCallback(() => {
        if (selectedGaps.size === silenceGaps.length) {
            setSelectedGaps(new Set());
        } else {
            setSelectedGaps(new Set(silenceGaps.map((_, i) => i)));
        }
    }, [selectedGaps.size, silenceGaps.length]);

    /**
     * Apply silence removal to clips
     * Uses splitClipAtPoints to split the clip and keep only non-silent sections
     */
    const handleRemoveSilence = useCallback(() => {
        if (!firstClip) {
            setError('No clip to process');
            return;
        }

        const selectedSilences = silenceGaps.filter((_, i) => selectedGaps.has(i));
        if (selectedSilences.length === 0) {
            setError('No silence gaps selected');
            return;
        }

        // Sort gaps by start frame
        const sortedGaps = [...selectedSilences].sort((a, b) => a.startFrame - b.startFrame);

        // Calculate the ranges to KEEP (inverse of silence gaps)
        const keepRanges: Array<{ start: number; end: number }> = [];
        let currentStart = firstClip.startFrame;

        for (const gap of sortedGaps) {
            // If there's content before this gap, keep it
            if (gap.startFrame > currentStart) {
                keepRanges.push({
                    start: currentStart,
                    end: gap.startFrame,
                });
            }
            // Move past this gap
            currentStart = gap.endFrame;
        }

        // Keep any remaining content after the last gap
        const clipEnd = firstClip.startFrame + firstClip.durationFrames;
        if (currentStart < clipEnd) {
            keepRanges.push({
                start: currentStart,
                end: clipEnd,
            });
        }

        if (keepRanges.length === 0) {
            setError('No content would remain after removing silence');
            return;
        }

        // Apply the split
        splitClipAtPoints(firstClip.id, keepRanges);

        // Calculate total time saved
        const totalSilenceMs = selectedSilences.reduce((acc, g) => acc + g.durationMs, 0);

        // Reset panel state
        setStatus('idle');
        setSilenceGaps([]);
        setSelectedGaps(new Set());

        // Show success feedback (could be a toast in production)
        setError(null);
        alert(`✓ Removed ${selectedSilences.length} silent sections (${(totalSilenceMs / 1000).toFixed(1)}s total). Your clip has been split into ${keepRanges.length} segments.`);
    }, [firstClip, silenceGaps, selectedGaps, splitClipAtPoints]);

    /**
     * Format duration for display
     */
    const formatDuration = (ms: number): string => {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    /**
     * Format time for display
     */
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const totalSilence = silenceGaps
        .filter((_, i) => selectedGaps.has(i))
        .reduce((acc, g) => acc + g.durationMs, 0);

    return (
        <div style={containerStyle}>
            {/* Settings toggle */}
            {(status === 'idle' || status === 'error') && (
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    style={settingsToggleStyle}
                >
                    <Settings size={14} />
                    <span>Settings</span>
                </button>
            )}

            {/* Settings panel */}
            {showSettings && (
                <div style={settingsPanelStyle}>
                    <div style={settingRowStyle}>
                        <label style={settingLabelStyle}>
                            Threshold ({config.thresholdDb} dB)
                        </label>
                        <input
                            type="range"
                            min={-60}
                            max={-20}
                            value={config.thresholdDb}
                            onChange={(e) => setConfig(c => ({ ...c, thresholdDb: Number(e.target.value) }))}
                            style={sliderStyle}
                        />
                        <div style={sliderLabelsStyle}>
                            <span>Quiet</span>
                            <span>Loud</span>
                        </div>
                    </div>

                    <div style={settingRowStyle}>
                        <label style={settingLabelStyle}>
                            Min Duration ({config.minDurationMs}ms)
                        </label>
                        <input
                            type="range"
                            min={100}
                            max={3000}
                            step={100}
                            value={config.minDurationMs}
                            onChange={(e) => setConfig(c => ({ ...c, minDurationMs: Number(e.target.value) }))}
                            style={sliderStyle}
                        />
                        <div style={sliderLabelsStyle}>
                            <span>Short</span>
                            <span>Long</span>
                        </div>
                    </div>

                    <div style={settingRowStyle}>
                        <label style={settingLabelStyle}>
                            Padding ({config.paddingMs}ms)
                        </label>
                        <input
                            type="range"
                            min={0}
                            max={500}
                            step={50}
                            value={config.paddingMs}
                            onChange={(e) => setConfig(c => ({ ...c, paddingMs: Number(e.target.value) }))}
                            style={sliderStyle}
                        />
                        <div style={sliderLabelsStyle}>
                            <span>None</span>
                            <span>More</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Analyze button */}
            {status === 'idle' && (
                <button
                    onClick={handleAnalyze}
                    style={analyzeButtonStyle}
                    disabled={!audioUrl}
                >
                    <Scissors size={18} />
                    <span>Detect Silence</span>
                </button>
            )}

            {/* Loading state */}
            {status === 'loading' && (
                <div style={loadingStyle}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Analyzing audio...</p>
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
            {status === 'success' && (
                <div style={resultContainerStyle}>
                    {/* Summary */}
                    <div style={summaryStyle}>
                        <span>{silenceGaps.length} silent sections found</span>
                        <button onClick={toggleAllGaps} style={selectAllButtonStyle}>
                            {selectedGaps.size === silenceGaps.length ? (
                                <><EyeOff size={12} /> Deselect All</>
                            ) : (
                                <><Eye size={12} /> Select All</>
                            )}
                        </button>
                    </div>

                    {/* Gap list */}
                    <div style={gapListStyle}>
                        {silenceGaps.length === 0 ? (
                            <p style={noGapsStyle}>No significant silence detected</p>
                        ) : (
                            silenceGaps.map((gap, index) => (
                                <button
                                    key={index}
                                    onClick={() => toggleGap(index)}
                                    style={{
                                        ...gapItemStyle,
                                        backgroundColor: selectedGaps.has(index)
                                            ? 'rgba(239, 68, 68, 0.15)'
                                            : 'rgba(255,255,255,0.03)',
                                        borderColor: selectedGaps.has(index)
                                            ? 'rgba(239, 68, 68, 0.3)'
                                            : 'rgba(255,255,255,0.08)',
                                    }}
                                >
                                    <div style={gapInfoStyle}>
                                        <span style={gapTimeStyle}>
                                            {formatTime(gap.startTime)} - {formatTime(gap.endTime)}
                                        </span>
                                        <span style={gapDurationStyle}>
                                            {formatDuration(gap.durationMs)}
                                        </span>
                                    </div>
                                    <div style={gapCheckStyle}>
                                        {selectedGaps.has(index) ? (
                                            <Trash2 size={14} style={{ color: '#ef4444' }} />
                                        ) : (
                                            <div style={uncheckedStyle} />
                                        )}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Apply button */}
                    {selectedGaps.size > 0 && (
                        <div style={applyContainerStyle}>
                            <div style={totalStyle}>
                                Removing: {formatDuration(totalSilence)}
                            </div>
                            <button onClick={handleRemoveSilence} style={applyButtonStyle}>
                                <Scissors size={14} />
                                Remove {selectedGaps.size} Silences
                            </button>
                        </div>
                    )}

                    {/* Re-analyze */}
                    <button onClick={handleAnalyze} style={reanalyzeButtonStyle}>
                        <RefreshCw size={14} />
                        Re-analyze
                    </button>
                </div>
            )}

            {/* No audio warning */}
            {!audioUrl && status === 'idle' && (
                <p style={warningStyle}>
                    Add a video or audio clip to detect silence
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

const settingsToggleStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    cursor: 'pointer',
    alignSelf: 'flex-start',
};

const settingsPanelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
};

const settingRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const settingLabelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
};

const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: '#6366f1',
};

const sliderLabelsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
};

const analyzeButtonStyle: React.CSSProperties = {
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

const summaryStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
};

const selectAllButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 4,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    cursor: 'pointer',
};

const gapListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: 200,
    overflowY: 'auto',
};

const noGapsStyle: React.CSSProperties = {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    padding: 20,
    fontSize: 13,
};

const gapItemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6,
    cursor: 'pointer',
};

const gapInfoStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
};

const gapTimeStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#fff',
    fontFamily: 'monospace',
};

const gapDurationStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
};

const gapCheckStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
};

const uncheckedStyle: React.CSSProperties = {
    width: 14,
    height: 14,
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 3,
};

const applyContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const totalStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
};

const applyButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '12px 16px',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
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

const warningStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
};
