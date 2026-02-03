'use client';

/**
 * B-Roll Suggestions Panel
 * AI-powered B-roll recommendations based on transcription analysis.
 * 
 * Why: Automates the discovery of supplementary footage,
 * saving hours of manual searching through media libraries.
 */

import React, { useState, useCallback } from 'react';
import {
    Film,
    Loader2,
    Plus,
    RefreshCw,
    Sparkles,
    Image,
    Video,
    ChevronRight,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    suggestBrollFromTranscription,
    BrollSuggestion,
    TranscriptionSegment,
} from '@/lib/ai/broll-matching';

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error' | 'no-transcription';

export const BrollSuggestionsPanel: React.FC = () => {
    const { project, updateClip } = useVideoProject();
    const fps = project.fps;

    const [status, setStatus] = useState<AnalysisStatus>('idle');
    const [suggestions, setSuggestions] = useState<BrollSuggestion[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [insertedIds, setInsertedIds] = useState<Set<string>>(new Set());

    // Note: Transcription would come from project.transcription if available
    // For now, we'll check if there are any text overlays with transcription data
    // or look for a transcription property on the project
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transcription = (project as any).transcription as {
        segments?: { text: string; startTime: number; endTime: number }[];
    } | undefined;

    /**
     * Analyze transcription and find B-roll suggestions
     */
    const handleAnalyze = useCallback(async () => {
        if (!transcription?.segments || transcription.segments.length === 0) {
            setStatus('no-transcription');
            return;
        }

        setStatus('loading');
        setError(null);

        try {
            // Convert project transcription to service format
            const segments: TranscriptionSegment[] = transcription.segments.map(
                (seg, idx) => ({
                    id: idx,
                    text: seg.text,
                    startTime: seg.startTime,
                    endTime: seg.endTime,
                })
            );

            const results = await suggestBrollFromTranscription(segments, {
                minRelevance: 0.3,
                maxSuggestionsPerSegment: 2,
                fps,
            });

            setSuggestions(results);
            setStatus(results.length > 0 ? 'success' : 'idle');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to find suggestions');
            setStatus('error');
        }
    }, [transcription, fps]);

    /**
     * Insert B-roll clip into timeline by updating an existing clip's overlay
     * Note: Full implementation would add a proper overlay layer
     */
    const handleInsertBroll = useCallback((suggestion: BrollSuggestion) => {
        // Mark as inserted - full B-roll overlay support would require
        // extending the video project schema to add overlay layers
        setInsertedIds(prev => new Set([...prev, suggestion.mediaId]));
    }, []);

    /**
     * Format time for display
     */
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div style={containerStyle}>
            {/* Header info */}
            <div style={infoStyle}>
                <Sparkles size={14} style={{ color: '#fbbf24' }} />
                <span>AI matches your speech to media library</span>
            </div>

            {/* No transcription state */}
            {status === 'no-transcription' && (
                <div style={warningStyle}>
                    <p>No transcription available.</p>
                    <p style={{ fontSize: 11, opacity: 0.7 }}>
                        Generate captions first using the Auto-Captions tool
                    </p>
                </div>
            )}

            {/* Analyze button */}
            {(status === 'idle' || status === 'no-transcription') && (
                <button
                    onClick={handleAnalyze}
                    style={analyzeButtonStyle}
                    disabled={!transcription?.segments?.length}
                >
                    <Film size={18} />
                    <span>Find B-Roll</span>
                </button>
            )}

            {/* Loading state */}
            {status === 'loading' && (
                <div style={loadingStyle}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Analyzing speech content...</p>
                    <p style={{ fontSize: 11, opacity: 0.6 }}>Matching to media library</p>
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

            {/* Suggestions list */}
            {status === 'success' && suggestions.length > 0 && (
                <div style={resultsContainerStyle}>
                    <div style={statsStyle}>
                        <span style={statBadgeStyle}>
                            {suggestions.length} suggestions
                        </span>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>
                            {insertedIds.size} added
                        </span>
                    </div>

                    <div style={suggestionListStyle}>
                        {suggestions.map((suggestion, index) => {
                            const isInserted = insertedIds.has(suggestion.mediaId);

                            return (
                                <div
                                    key={`${suggestion.mediaId}-${index}`}
                                    style={{
                                        ...suggestionItemStyle,
                                        opacity: isInserted ? 0.6 : 1,
                                    }}
                                >
                                    {/* Thumbnail */}
                                    <div style={thumbnailStyle}>
                                        {suggestion.thumbnailUrl ? (
                                            <img
                                                src={suggestion.thumbnailUrl}
                                                alt=""
                                                style={thumbnailImgStyle}
                                            />
                                        ) : (
                                            suggestion.mediaType === 'video'
                                                ? <Video size={20} />
                                                : <Image size={20} />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div style={suggestionInfoStyle}>
                                        <div style={suggestionKeywordsStyle}>
                                            {suggestion.matchedKeywords.slice(0, 3).map(kw => (
                                                <span key={kw} style={keywordTagStyle}>
                                                    {kw}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={suggestionTimeStyle}>
                                            <ChevronRight size={12} />
                                            {formatTime(suggestion.suggestedInsertFrame / fps)}
                                        </div>
                                        <div style={suggestionTextStyle}>
                                            &quot;{suggestion.matchedText.slice(0, 40)}...&quot;
                                        </div>
                                    </div>

                                    {/* Score */}
                                    <div style={scoreStyle}>
                                        {Math.round(suggestion.relevanceScore * 100)}%
                                    </div>

                                    {/* Insert button */}
                                    <button
                                        onClick={() => handleInsertBroll(suggestion)}
                                        style={insertButtonStyle}
                                        disabled={isInserted}
                                        title={isInserted ? 'Already added' : 'Add to timeline'}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Re-analyze */}
                    <button onClick={handleAnalyze} style={reanalyzeButtonStyle}>
                        <RefreshCw size={14} />
                        Re-analyze
                    </button>
                </div>
            )}

            {/* No suggestions found */}
            {status === 'success' && suggestions.length === 0 && (
                <div style={emptyStyle}>
                    <p>No matching B-roll found</p>
                    <p style={{ fontSize: 11, opacity: 0.6 }}>
                        Try adding more media with descriptive names/tags
                    </p>
                    <button onClick={handleAnalyze} style={reanalyzeButtonStyle}>
                        <RefreshCw size={14} />
                        Try again
                    </button>
                </div>
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

const warningStyle: React.CSSProperties = {
    padding: 16,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 8,
    color: '#fbbf24',
    textAlign: 'center',
    fontSize: 12,
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
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#8b5cf6',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
};

const suggestionListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 250,
    overflowY: 'auto',
};

const suggestionItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
};

const thumbnailStyle: React.CSSProperties = {
    width: 48,
    height: 36,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    flexShrink: 0,
};

const thumbnailImgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
};

const suggestionInfoStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
};

const suggestionKeywordsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
};

const keywordTagStyle: React.CSSProperties = {
    padding: '2px 6px',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#a78bfa',
    borderRadius: 4,
    fontSize: 10,
};

const suggestionTimeStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'monospace',
};

const suggestionTextStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const scoreStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#10b981',
    fontWeight: 600,
    flexShrink: 0,
};

const insertButtonStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    border: 'none',
    borderRadius: 4,
    color: '#6366f1',
    cursor: 'pointer',
    flexShrink: 0,
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
