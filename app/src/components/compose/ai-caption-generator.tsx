/**
 * AI Caption Generator Component
 * UI for generating on-brand captions with AI
 * Supports both "Improve Draft" mode (refine existing text) and "Generate New" mode
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Sparkles, Loader2, Copy, RefreshCw, Check,
    Zap, TrendingUp, Clock, Edit3, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Generation mode - improve existing draft or create new from description */
type GenerationMode = 'improve' | 'generate';

interface AICaptionGeneratorProps {
    onSelect: (caption: string, hashtags: string[]) => void;
    platform: string;
    /** Current draft text from the editor - enables "Improve Draft" mode */
    currentDraft?: string;
    className?: string;
}

export function AICaptionGenerator({ onSelect, platform, currentDraft, className }: AICaptionGeneratorProps) {
    // Auto-select mode based on whether there's a draft
    const [mode, setMode] = useState<GenerationMode>(currentDraft?.trim() ? 'improve' : 'generate');
    const [prompt, setPrompt] = useState('');
    const [contentType, setContentType] = useState<string>('product');
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [copied, setCopied] = useState(false);

    // Reset result when mode changes
    useEffect(() => {
        setResult(null);
        setPrompt('');
    }, [mode]);

    const contentTypes = [
        { id: 'product', label: 'Product', icon: '🛍️' },
        { id: 'educational', label: 'Educational', icon: '💡' },
        { id: 'behind-the-scenes', label: 'Behind the Scenes', icon: '🎬' },
        { id: 'promotional', label: 'Promotional', icon: '🔥' },
        { id: 'engagement', label: 'Engagement', icon: '💬' },
    ];

    const improvementSuggestions = [
        { id: 'engaging', label: 'More engaging', icon: '🎯' },
        { id: 'shorter', label: 'Make it shorter', icon: '✂️' },
        { id: 'professional', label: 'More professional', icon: '👔' },
        { id: 'casual', label: 'More casual', icon: '😊' },
        { id: 'emojis', label: 'Add emojis', icon: '✨' },
        { id: 'hashtags', label: 'Add hashtags', icon: '#️⃣' },
    ];

    const handleGenerate = async () => {
        // In improve mode, we need either prompt OR current draft
        // In generate mode, we need the prompt
        if (mode === 'generate' && !prompt.trim()) return;
        if (mode === 'improve' && !currentDraft?.trim()) return;

        setIsGenerating(true);

        // Simulate API call - in production this would call OpenRouter
        await new Promise((r) => setTimeout(r, 1500));

        // Mock result based on mode
        if (mode === 'improve') {
            // Improved version of the draft
            const improvedCaption = currentDraft?.trim() || '';
            setResult({
                caption: `✨ ${improvedCaption}\n\nWe're so excited to share this with you! Drop a comment and let us know what you think 💬\n\n#trending #fyp`,
                hashtags: ['#trending', '#fyp', '#viral', '#explore', '#newpost'],
                viralityScore: 0.88,
                brandVoiceScore: 0.95,
                suggestions: [
                    'Caption improved with stronger hook',
                    'Added call-to-action for engagement',
                ],
            });
        } else {
            // Generate new from description
            setResult({
                caption: `✨ Exciting news! ${prompt}\n\nWe've been working on something special and can't wait to share it with you. This is exactly what you've been asking for!\n\nTap the link in bio to learn more 🔗`,
                hashtags: ['#newpost', '#trending', '#viral', '#fyp', '#explore'],
                viralityScore: 0.85,
                brandVoiceScore: 0.92,
                suggestions: [
                    'Add a question to boost engagement',
                    'Best time to post: 7:30 PM today',
                ],
            });
        }

        setIsGenerating(false);
    };

    const handleCopy = () => {
        if (!result) return;
        navigator.clipboard.writeText(result.caption + '\n\n' + result.hashtags.join(' '));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleUse = () => {
        if (!result) return;
        onSelect(result.caption, result.hashtags);
    };

    return (
        <div className={cn('card p-5', className)}>
            <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient">
                    <Sparkles className="h-4 w-4 text-white" />
                </div>
                <h3 className="font-semibold">AI Caption Generator</h3>
            </div>

            {/* Mode Toggle Tabs */}
            <div className="mb-4 flex rounded-lg bg-[var(--bg-tertiary)] p-1">
                <button
                    onClick={() => setMode('improve')}
                    disabled={!currentDraft?.trim()}
                    className={cn(
                        'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        mode === 'improve' && currentDraft?.trim()
                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                        !currentDraft?.trim() && 'opacity-50 cursor-not-allowed'
                    )}
                >
                    <Edit3 className="h-4 w-4" />
                    Improve Draft
                </button>
                <button
                    onClick={() => setMode('generate')}
                    className={cn(
                        'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        mode === 'generate'
                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    )}
                >
                    <FileText className="h-4 w-4" />
                    Generate New
                </button>
            </div>

            {/* Mode-specific content */}
            {mode === 'improve' ? (
                <>
                    {/* Current Draft Preview */}
                    <div className="mb-4">
                        <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">
                            Your current draft
                        </label>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3">
                            <p className="text-sm text-[var(--text-secondary)] line-clamp-4">
                                {currentDraft || 'No draft text yet'}
                            </p>
                            {currentDraft && currentDraft.length > 200 && (
                                <p className="mt-1 text-xs text-[var(--text-muted)]">
                                    {currentDraft.length} characters
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Improvement Suggestions */}
                    <div className="mb-4">
                        <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">
                            Quick improvements
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {improvementSuggestions.map((suggestion) => (
                                <button
                                    key={suggestion.id}
                                    onClick={() => setPrompt(suggestion.label)}
                                    className={cn(
                                        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                                        prompt === suggestion.label
                                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)] font-medium'
                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80'
                                    )}
                                >
                                    <span>{suggestion.icon}</span>
                                    {suggestion.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Custom improvement prompt */}
                    <div className="mb-4">
                        <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">
                            Or describe how to improve it
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., Make it more conversational and add a call-to-action..."
                            className="min-h-[60px] w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                        />
                    </div>
                </>
            ) : (
                <>
                    {/* Content Type */}
                    <div className="mb-4">
                        <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">
                            Content Type
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {contentTypes.map((type) => (
                                <button
                                    key={type.id}
                                    onClick={() => setContentType(type.id)}
                                    className={cn(
                                        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                                        contentType === type.id
                                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)] font-medium'
                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80'
                                    )}
                                >
                                    <span>{type.icon}</span>
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Prompt */}
                    <div className="mb-4">
                        <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">
                            What's your post about?
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe your post content, key points, or paste product details..."
                            className="min-h-[80px] w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                        />
                    </div>
                </>
            )}

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || (mode === 'generate' && !prompt.trim()) || (mode === 'improve' && !currentDraft?.trim())}
                className="w-full mb-4"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {mode === 'improve' ? 'Improving...' : 'Generating...'}
                    </>
                ) : (
                    <>
                        <Sparkles className="h-4 w-4" />
                        {mode === 'improve' ? 'Improve Caption' : 'Generate Caption'}
                    </>
                )}
            </Button>

            {/* Result */}
            {result && (
                <div className="space-y-4 animate-slide-up">
                    {/* Caption Preview */}
                    <div className="rounded-lg bg-[var(--bg-tertiary)] p-4">
                        <p className="whitespace-pre-wrap text-sm">{result.caption}</p>
                        <div className="mt-3 flex flex-wrap gap-1">
                            {result.hashtags.map((tag) => (
                                <span
                                    key={tag}
                                    className="rounded-full bg-[var(--accent-gold-light)] px-2 py-0.5 text-xs text-[var(--accent-gold)]"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Scores */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingUp className="h-4 w-4 text-[var(--accent-gold)]" />
                                <span className="text-xs text-[var(--text-muted)]">Virality Score</span>
                            </div>
                            <p className="text-lg font-bold">{Math.round(result.viralityScore * 100)}%</p>
                        </div>
                        <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Zap className="h-4 w-4 text-[var(--accent-gold)]" />
                                <span className="text-xs text-[var(--text-muted)]">Brand Match</span>
                            </div>
                            <p className="text-lg font-bold">{Math.round(result.brandVoiceScore * 100)}%</p>
                        </div>
                    </div>

                    {/* Suggestions */}
                    <div className="space-y-2">
                        {result.suggestions.map((suggestion, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                <Clock className="h-3 w-3 text-[var(--accent-gold)]" />
                                {suggestion}
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={handleCopy} className="flex-1">
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? 'Copied!' : 'Copy'}
                        </Button>
                        <Button variant="secondary" onClick={handleGenerate} className="flex-1">
                            <RefreshCw className="h-4 w-4" />
                            Regenerate
                        </Button>
                        <Button onClick={handleUse} className="flex-1">
                            Use This
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

interface GenerationResult {
    caption: string;
    hashtags: string[];
    viralityScore: number;
    brandVoiceScore: number;
    suggestions: string[];
}

/**
 * Compact AI Assist button for inline use
 */
interface AIAssistButtonProps {
    onClick: () => void;
    isLoading?: boolean;
}

export function AIAssistButton({ onClick, isLoading }: AIAssistButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-[var(--accent-gold)] bg-[var(--accent-gold-light)] px-3 py-1.5 text-sm text-[var(--accent-gold)] transition-colors hover:bg-[var(--accent-gold)] hover:text-white disabled:opacity-50"
        >
            {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Sparkles className="h-4 w-4" />
            )}
            AI Assist
        </button>
    );
}
