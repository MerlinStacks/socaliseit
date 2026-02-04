'use client';

/**
 * Hook Generator Panel
 * AI-powered opening hooks for short-form content.
 */

import React, { useState, useCallback } from 'react';
import {
    Zap,
    Copy,
    Check,
    RefreshCw,
    Loader2,
} from 'lucide-react';
import {
    generateHooks,
    getStylesForPlatform,
    type GeneratedHook,
    type HookGeneratorConfig,
} from '@/lib/ai/hook-generator';

type Platform = 'tiktok' | 'instagram' | 'youtube' | 'twitter';

export const HookGeneratorPanel: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [platform, setPlatform] = useState<Platform>('tiktok');
    const [hooks, setHooks] = useState<GeneratedHook[]>([]);
    const [loading, setLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const styles = getStylesForPlatform(platform);

    /**
     * Generate hooks.
     */
    const handleGenerate = useCallback(async () => {
        if (!topic.trim()) return;

        setLoading(true);
        try {
            const config: HookGeneratorConfig = {
                topic: topic.trim(),
                platform,
                numHooks: 5,
            };
            const results = await generateHooks(config);
            setHooks(results);
        } catch (err) {
            console.error('Hook generation failed:', err);
        } finally {
            setLoading(false);
        }
    }, [topic, platform]);

    /**
     * Copy hook to clipboard.
     */
    const handleCopy = useCallback(async (hook: GeneratedHook) => {
        await navigator.clipboard.writeText(hook.text);
        setCopiedId(hook.id);
        setTimeout(() => setCopiedId(null), 2000);
    }, []);

    return (
        <div style={containerStyle}>
            {/* Info header */}
            <div style={infoStyle}>
                <Zap size={14} style={{ color: '#f59e0b' }} />
                <span>Generate attention-grabbing opening hooks</span>
            </div>

            {/* Topic input */}
            <div style={inputContainerStyle}>
                <label style={labelStyle}>Topic / Content</label>
                <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="What is your video about? E.g., 'productivity tips', 'morning routine', 'cooking hacks'"
                    style={textareaStyle}
                    rows={2}
                />
            </div>

            {/* Platform selector */}
            <div style={platformContainerStyle}>
                <label style={labelStyle}>Platform</label>
                <div style={platformGridStyle}>
                    {(['tiktok', 'instagram', 'youtube', 'twitter'] as Platform[]).map(p => (
                        <button
                            key={p}
                            onClick={() => setPlatform(p)}
                            style={{
                                ...platformButtonStyle,
                                borderColor: platform === p ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                                backgroundColor: platform === p
                                    ? 'rgba(245, 158, 11, 0.15)'
                                    : 'transparent',
                            }}
                        >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Style tags */}
            <div style={stylesContainerStyle}>
                <span style={stylesLabelStyle}>Recommended styles:</span>
                <div style={styleTagsStyle}>
                    {styles.map(s => (
                        <span key={s.id} style={styleTagStyle}>{s.name}</span>
                    ))}
                </div>
            </div>

            {/* Generate button */}
            <button
                onClick={handleGenerate}
                style={generateButtonStyle}
                disabled={!topic.trim() || loading}
            >
                {loading ? (
                    <>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Generating...
                    </>
                ) : (
                    <>
                        <Zap size={16} />
                        Generate Hooks
                    </>
                )}
            </button>

            {/* Results */}
            {hooks.length > 0 && (
                <div style={resultsStyle}>
                    <h4 style={resultsHeaderStyle}>Generated Hooks</h4>
                    {hooks.map(hook => (
                        <div key={hook.id} style={hookCardStyle}>
                            <p style={hookTextStyle}>{hook.text}</p>
                            <div style={hookFooterStyle}>
                                <span style={hookMetaStyle}>
                                    {hook.characterCount} chars • {hook.style}
                                </span>
                                <button
                                    onClick={() => handleCopy(hook)}
                                    style={copyButtonStyle}
                                >
                                    {copiedId === hook.id ? (
                                        <>
                                            <Check size={12} />
                                            Copied
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={12} />
                                            Copy
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Regenerate */}
                    <button onClick={handleGenerate} style={regenerateButtonStyle}>
                        <RefreshCw size={14} />
                        Generate More
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

const inputContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 500,
};

const textareaStyle: React.CSSProperties = {
    width: '100%',
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    resize: 'vertical',
    fontFamily: 'inherit',
};

const platformContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const platformGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
};

const platformButtonStyle: React.CSSProperties = {
    padding: '8px 4px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 10,
    cursor: 'pointer',
    transition: 'all 0.15s',
};

const stylesContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
};

const stylesLabelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
};

const styleTagsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
};

const styleTagStyle: React.CSSProperties = {
    padding: '2px 6px',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    color: '#f59e0b',
    borderRadius: 4,
    fontSize: 9,
};

const generateButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 16px',
    backgroundColor: '#f59e0b',
    color: '#000',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
};

const resultsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const resultsHeaderStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    margin: 0,
};

const hookCardStyle: React.CSSProperties = {
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
};

const hookTextStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#fff',
    margin: '0 0 8px 0',
    lineHeight: 1.4,
};

const hookFooterStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
};

const hookMetaStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
};

const copyButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 10,
    cursor: 'pointer',
};

const regenerateButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    cursor: 'pointer',
};
