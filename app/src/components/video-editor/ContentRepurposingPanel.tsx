'use client';

/**
 * Content Repurposing Panel
 * AI-powered tool to create platform-optimized versions from a single video.
 * 
 * Why: Streamlines multi-platform content creation from one source video.
 */

import React, { useState, useCallback } from 'react';
import {
    Repeat2,
    Loader2,
    Sparkles,
    Check,
    ChevronRight,
    Download,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import { detectHighlights, generatePlatformClips } from '@/lib/ai/highlight-detection';

type RepurposeStatus = 'idle' | 'analyzing' | 'ready' | 'generating' | 'complete';

interface PlatformVariant {
    id: string;
    platform: string;
    name: string;
    aspectRatio: string;
    maxDuration: number; // seconds
    icon: string;
    selected: boolean;
    suggestedClips: ClipSuggestion[];
}

interface ClipSuggestion {
    startFrame: number;
    endFrame: number;
    score: number;
    reason: string;
}

const PLATFORM_PRESETS: Omit<PlatformVariant, 'selected' | 'suggestedClips'>[] = [
    {
        id: 'tiktok',
        platform: 'TikTok',
        name: 'TikTok/Reels',
        aspectRatio: '9:16',
        maxDuration: 60,
        icon: '🎵',
    },
    {
        id: 'ig-story',
        platform: 'Instagram',
        name: 'Instagram Story',
        aspectRatio: '9:16',
        maxDuration: 15,
        icon: '📱',
    },
    {
        id: 'ig-feed',
        platform: 'Instagram',
        name: 'Instagram Feed',
        aspectRatio: '1:1',
        maxDuration: 60,
        icon: '📷',
    },
    {
        id: 'youtube-short',
        platform: 'YouTube',
        name: 'YouTube Shorts',
        aspectRatio: '9:16',
        maxDuration: 60,
        icon: '▶️',
    },
    {
        id: 'youtube',
        platform: 'YouTube',
        name: 'YouTube Video',
        aspectRatio: '16:9',
        maxDuration: 600,
        icon: '🎬',
    },
    {
        id: 'twitter',
        platform: 'X/Twitter',
        name: 'X/Twitter Post',
        aspectRatio: '16:9',
        maxDuration: 140,
        icon: '🐦',
    },
];

export const ContentRepurposingPanel: React.FC = () => {
    const { project } = useVideoProject();
    const fps = project.fps;

    const [status, setStatus] = useState<RepurposeStatus>('idle');
    const [variants, setVariants] = useState<PlatformVariant[]>([]);
    const [activeVariant, setActiveVariant] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const hasVideo = project.clips.some(c => c.type === 'video');
    const videoDuration = project.clips.reduce(
        (max, c) => Math.max(max, c.startFrame + c.durationFrames),
        0
    ) / fps;

    /**
     * Analyze video and generate platform variants using AI highlight detection
     */
    const handleAnalyze = useCallback(async () => {
        if (!hasVideo) {
            setError('Add a video to the timeline first');
            return;
        }

        setStatus('analyzing');
        setError(null);

        try {
            // Get video URL for audio analysis
            const videoClip = project.clips.find(c => c.type === 'video');
            const videoUrl = videoClip?.mediaUrl;
            const totalFrames = Math.floor(videoDuration * fps);

            // Use AI to detect highlights
            const highlightResult = await detectHighlights(videoUrl, {
                fps,
                totalFrames,
                minDuration: 5,
                maxDuration: 60,
                numHighlights: 4,
            });

            // Generate variants with AI-detected suggestions
            const generatedVariants: PlatformVariant[] = PLATFORM_PRESETS.map(preset => {
                const maxFrames = preset.maxDuration * fps;

                if (totalFrames <= maxFrames) {
                    // Video fits entirely
                    return {
                        ...preset,
                        selected: true,
                        suggestedClips: [{
                            startFrame: 0,
                            endFrame: totalFrames,
                            score: 0.95,
                            reason: 'Full video fits platform requirements',
                        }],
                    };
                }

                // Generate platform-specific clips from highlights
                const platformClips = generatePlatformClips(
                    highlightResult.highlights,
                    preset.maxDuration,
                    { fps, totalFrames, minDuration: 5, maxDuration: preset.maxDuration, numHighlights: 3 }
                );

                return {
                    ...preset,
                    selected: true,
                    suggestedClips: platformClips.length > 0 ? platformClips : [{
                        startFrame: 0,
                        endFrame: Math.min(maxFrames, totalFrames),
                        score: 0.8,
                        reason: 'Opening segment',
                    }],
                };
            });

            setVariants(generatedVariants);
            setActiveVariant(generatedVariants[0]?.id || null);
            setStatus('ready');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed');
            setStatus('idle');
        }
    }, [hasVideo, videoDuration, fps, project.clips]);

    /**
     * Toggle variant selection
     */
    const toggleVariant = (variantId: string) => {
        setVariants(prev =>
            prev.map(v =>
                v.id === variantId ? { ...v, selected: !v.selected } : v
            )
        );
    };

    /**
     * Generate selected variants
     */
    const handleGenerate = useCallback(async () => {
        const selected = variants.filter(v => v.selected);
        if (selected.length === 0) {
            setError('Select at least one platform');
            return;
        }

        setStatus('generating');

        // Simulate generation
        await new Promise(resolve => setTimeout(resolve, 3000));

        setStatus('complete');
    }, [variants]);

    /**
     * Format frame to time
     */
    const formatTime = (frame: number): string => {
        const secs = frame / fps;
        const mins = Math.floor(secs / 60);
        const remainingSecs = Math.floor(secs % 60);
        return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
    };

    const activeVariantData = variants.find(v => v.id === activeVariant);
    const selectedCount = variants.filter(v => v.selected).length;

    return (
        <div style={containerStyle}>
            {/* Analyze button */}
            {status === 'idle' && (
                <>
                    <div style={introStyle}>
                        <Repeat2 size={32} style={{ color: '#6366f1' }} />
                        <h3 style={introTitleStyle}>Content Repurposing</h3>
                        <p style={introDescStyle}>
                            Automatically create optimized versions of your video for different platforms.
                        </p>
                    </div>
                    <button
                        onClick={handleAnalyze}
                        style={analyzeButtonStyle}
                        disabled={!hasVideo}
                    >
                        <Sparkles size={18} />
                        <span>Analyze Video</span>
                    </button>
                    {!hasVideo && (
                        <p style={warningStyle}>Add a video clip first</p>
                    )}
                </>
            )}

            {/* Analyzing */}
            {status === 'analyzing' && (
                <div style={loadingStyle}>
                    <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
                    <p style={{ fontWeight: 600 }}>Analyzing content...</p>
                    <p style={{ fontSize: 12, opacity: 0.6 }}>Finding best moments for each platform</p>
                </div>
            )}

            {/* Ready - Platform selection */}
            {status === 'ready' && (
                <div style={readyContainerStyle}>
                    {/* Platform pills */}
                    <div style={platformPillsStyle}>
                        {variants.map(variant => (
                            <button
                                key={variant.id}
                                onClick={() => {
                                    toggleVariant(variant.id);
                                    setActiveVariant(variant.id);
                                }}
                                style={{
                                    ...platformPillStyle,
                                    backgroundColor: variant.selected
                                        ? 'rgba(99, 102, 241, 0.2)'
                                        : 'rgba(255,255,255,0.05)',
                                    borderColor: activeVariant === variant.id
                                        ? '#6366f1'
                                        : variant.selected
                                            ? 'rgba(99, 102, 241, 0.3)'
                                            : 'rgba(255,255,255,0.1)',
                                }}
                            >
                                <span>{variant.icon}</span>
                                <span style={{ fontSize: 11 }}>{variant.name}</span>
                                {variant.selected && (
                                    <Check size={12} style={{ color: '#6366f1' }} />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Active variant details */}
                    {activeVariantData && (
                        <div style={variantDetailStyle}>
                            <div style={variantHeaderStyle}>
                                <span style={{ fontSize: 24 }}>{activeVariantData.icon}</span>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{activeVariantData.name}</div>
                                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                                        {activeVariantData.aspectRatio} • Max {activeVariantData.maxDuration}s
                                    </div>
                                </div>
                            </div>

                            <div style={suggestionsLabelStyle}>Suggested clips:</div>
                            <div style={suggestionsListStyle}>
                                {activeVariantData.suggestedClips.map((clip, index) => (
                                    <div key={index} style={suggestionItemStyle}>
                                        <div style={suggestionTimeStyle}>
                                            {formatTime(clip.startFrame)}
                                            <ChevronRight size={10} />
                                            {formatTime(clip.endFrame)}
                                        </div>
                                        <div style={suggestionReasonStyle}>{clip.reason}</div>
                                        <div style={scoreStyle}>{Math.round(clip.score * 100)}%</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Generate button */}
                    <button
                        onClick={handleGenerate}
                        style={generateButtonStyle}
                        disabled={selectedCount === 0}
                    >
                        <Sparkles size={16} />
                        Generate {selectedCount} Variant{selectedCount !== 1 ? 's' : ''}
                    </button>
                </div>
            )}

            {/* Generating */}
            {status === 'generating' && (
                <div style={loadingStyle}>
                    <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#10b981' }} />
                    <p style={{ fontWeight: 600 }}>Generating variants...</p>
                    <p style={{ fontSize: 12, opacity: 0.6 }}>Creating {selectedCount} platform versions</p>
                </div>
            )}

            {/* Complete */}
            {status === 'complete' && (
                <div style={completeContainerStyle}>
                    <div style={successIconStyle}>
                        <Check size={32} />
                    </div>
                    <h3 style={{ margin: 0, fontWeight: 600 }}>Variants Ready!</h3>
                    <p style={{ fontSize: 12, opacity: 0.7, margin: '8px 0 16px' }}>
                        {selectedCount} platform versions created
                    </p>

                    <div style={variantResultsStyle}>
                        {variants.filter(v => v.selected).map(variant => (
                            <div key={variant.id} style={variantResultItemStyle}>
                                <span>{variant.icon}</span>
                                <span style={{ flex: 1 }}>{variant.name}</span>
                                <button style={downloadBtnStyle}>
                                    <Download size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => setStatus('idle')}
                        style={startOverButtonStyle}
                    >
                        Start Over
                    </button>
                </div>
            )}

            {/* Error display */}
            {error && (
                <div style={errorStyle}>{error}</div>
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

const introStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    textAlign: 'center',
};

const introTitleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
};

const introDescStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.5,
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
    gap: 12,
    padding: 32,
    color: '#fff',
    textAlign: 'center',
};

const readyContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const platformPillsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
};

const platformPillStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    color: '#fff',
    cursor: 'pointer',
};

const variantDetailStyle: React.CSSProperties = {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
};

const variantHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    color: '#fff',
};

const suggestionsLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
};

const suggestionsListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const suggestionItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 4,
};

const suggestionTimeStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#fff',
};

const suggestionReasonStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
};

const scoreStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#10b981',
    fontWeight: 600,
};

const generateButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 20px',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
};

const completeContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    textAlign: 'center',
};

const successIconStyle: React.CSSProperties = {
    width: 64,
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: '50%',
    color: '#10b981',
    marginBottom: 8,
};

const variantResultsStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const variantResultItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
};

const downloadBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    border: 'none',
    borderRadius: 4,
    color: '#6366f1',
    cursor: 'pointer',
};

const startOverButtonStyle: React.CSSProperties = {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 8,
};

const warningStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
};

const errorStyle: React.CSSProperties = {
    padding: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 12,
    textAlign: 'center',
};
