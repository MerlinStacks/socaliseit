'use client';

/**
 * Beat Sync Panel
 * UI for detecting music beats and syncing cuts/effects to rhythm.
 * 
 * Why: Creates engaging, rhythm-matched montages for music-driven content.
 */

import React, { useState, useCallback } from 'react';
import {
    Music,
    Loader2,
    Plus,
    Zap,
    RefreshCw,
    Settings,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    detectBeats,
    Beat,
} from '@/lib/ai/audio-analysis';

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export const BeatSyncPanel: React.FC = () => {
    const { project } = useVideoProject();
    const fps = project.fps;

    const [status, setStatus] = useState<AnalysisStatus>('idle');
    const [beats, setBeats] = useState<Beat[]>([]);
    const [bpm, setBpm] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [sensitivity, setSensitivity] = useState(0.3);

    // Get first audio source
    const audioUrl = project.clips[0]?.mediaUrl || project.audioClips[0]?.mediaUrl;

    /**
     * Analyze audio for beats
     */
    const handleAnalyze = useCallback(async () => {
        if (!audioUrl) {
            setError('No audio source found. Add a video or audio clip first.');
            return;
        }

        setStatus('loading');
        setError(null);

        try {
            const result = await detectBeats(audioUrl, fps);
            setBeats(result.beats);
            setBpm(result.bpm);
            setStatus('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed');
            setStatus('error');
        }
    }, [audioUrl, fps]);

    /**
     * Add beat markers to timeline (visual only for now)
     */
    const handleAddBeatMarkers = useCallback(() => {
        // In a full implementation, this would add visual markers
        // to the timeline component
        alert(`Would add ${beats.length} beat markers to timeline at ${Math.round(bpm)} BPM`);
    }, [beats, bpm]);

    /**
     * Auto-cut clips at beat points
     */
    const handleAutoCut = useCallback(() => {
        if (project.clips.length === 0) {
            setError('Add clips to the timeline first');
            return;
        }

        // In a full implementation, this would split clips at beat points
        alert(`Would split clips at ${beats.length} beat points for rhythm-matched editing`);
    }, [project.clips.length, beats.length]);

    /**
     * Format time for display
     */
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(2);
        return `${mins}:${secs.padStart(5, '0')}`;
    };

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
                            Sensitivity ({(sensitivity * 100).toFixed(0)}%)
                        </label>
                        <input
                            type="range"
                            min={0.1}
                            max={0.9}
                            step={0.1}
                            value={sensitivity}
                            onChange={(e) => setSensitivity(Number(e.target.value))}
                            style={sliderStyle}
                        />
                        <div style={sliderLabelsStyle}>
                            <span>Less beats</span>
                            <span>More beats</span>
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
                    <Music size={18} />
                    <span>Detect Beats</span>
                </button>
            )}

            {/* Loading state */}
            {status === 'loading' && (
                <div style={loadingStyle}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Analyzing rhythm...</p>
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
                    {/* BPM display */}
                    <div style={bpmDisplayStyle}>
                        <div style={bpmValueStyle}>{Math.round(bpm)}</div>
                        <div style={bpmLabelStyle}>BPM</div>
                    </div>

                    {/* Beat count */}
                    <div style={statsStyle}>
                        <span>{beats.length} beats detected</span>
                        <span>•</span>
                        <span>{beats.length > 0 ? formatTime(beats[beats.length - 1].time) : '0:00'} total</span>
                    </div>

                    {/* Beat preview list */}
                    <div style={beatListStyle}>
                        {beats.slice(0, 10).map((beat, index) => (
                            <div key={index} style={beatItemStyle}>
                                <span style={beatIndexStyle}>#{index + 1}</span>
                                <span style={beatTimeStyle}>{formatTime(beat.time)}</span>
                                <div
                                    style={{
                                        ...beatStrengthStyle,
                                        width: `${beat.strength * 100}%`,
                                    }}
                                />
                            </div>
                        ))}
                        {beats.length > 10 && (
                            <div style={moreBeatsStyle}>
                                +{beats.length - 10} more beats
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div style={actionsStyle}>
                        <button onClick={handleAddBeatMarkers} style={actionButtonStyle}>
                            <Plus size={14} />
                            Add Markers
                        </button>
                        <button onClick={handleAutoCut} style={actionButtonPrimaryStyle}>
                            <Zap size={14} />
                            Auto-Cut at Beats
                        </button>
                    </div>

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
                    Add a video or audio clip to detect beats
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
    gap: 12,
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
    backgroundColor: '#8b5cf6',
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

const bpmDisplayStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 8,
    border: '1px solid rgba(139, 92, 246, 0.3)',
};

const bpmValueStyle: React.CSSProperties = {
    fontSize: 36,
    fontWeight: 700,
    color: '#8b5cf6',
    fontFamily: 'monospace',
};

const bpmLabelStyle: React.CSSProperties = {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: 500,
};

const statsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
};

const beatListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: 150,
    overflowY: 'auto',
};

const beatItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
};

const beatIndexStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    width: 24,
};

const beatTimeStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#fff',
    fontFamily: 'monospace',
    width: 60,
};

const beatStrengthStyle: React.CSSProperties = {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 4,
};

const moreBeatsStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    padding: 8,
};

const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
};

const actionButtonStyle: React.CSSProperties = {
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

const actionButtonPrimaryStyle: React.CSSProperties = {
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
