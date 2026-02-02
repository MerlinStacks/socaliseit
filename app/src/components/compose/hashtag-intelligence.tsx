'use client';

/**
 * Hashtag Intelligence Component
 * AI-powered hashtag suggestions with performance metrics
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
    Hash,
    TrendingUp,
    Users,
    BarChart3,
    Plus,
    X,
    Sparkles,
    AlertCircle
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface HashtagSuggestion {
    tag: string;
    category: 'trending' | 'niche' | 'branded' | 'related';
    reach: number;
    competition: 'low' | 'medium' | 'high';
    relevanceScore: number;
}

interface HashtagIntelligenceProps {
    /** Current caption to analyze */
    caption: string;
    /** Platform for optimization */
    platform: string;
    /** Currently selected hashtags */
    selectedHashtags: string[];
    /** Callback when hashtags change */
    onHashtagsChange: (hashtags: string[]) => void;
    className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatReach(reach: number): string {
    if (reach >= 1_000_000) return `${(reach / 1_000_000).toFixed(1)}M`;
    if (reach >= 1_000) return `${(reach / 1_000).toFixed(0)}K`;
    return String(reach);
}

const categoryColors = {
    trending: 'bg-[var(--accent-pink)] text-white',
    niche: 'bg-[var(--success)] text-white',
    branded: 'bg-[var(--accent-gold)] text-white',
    related: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
};

const competitionColors = {
    low: 'text-[var(--success)]',
    medium: 'text-[var(--warning)]',
    high: 'text-[var(--error)]',
};

// ============================================================================
// Main Component
// ============================================================================

export function HashtagIntelligence({
    caption,
    platform,
    selectedHashtags,
    onHashtagsChange,
    className,
}: HashtagIntelligenceProps) {
    const [suggestions, setSuggestions] = useState<HashtagSuggestion[]>([]);

    // Analyze caption and generate suggestions
    const analyzeMutation = useMutation({
        mutationFn: async () => {
            // Simulated API call - would connect to AI service
            await new Promise((r) => setTimeout(r, 1200));

            // Mock suggestions based on caption
            const mockSuggestions: HashtagSuggestion[] = [
                { tag: '#viral', category: 'trending', reach: 45_000_000, competition: 'high', relevanceScore: 0.78 },
                { tag: '#fyp', category: 'trending', reach: 120_000_000, competition: 'high', relevanceScore: 0.92 },
                { tag: '#smallbusiness', category: 'niche', reach: 8_500_000, competition: 'medium', relevanceScore: 0.85 },
                { tag: '#entrepreneur', category: 'niche', reach: 12_000_000, competition: 'medium', relevanceScore: 0.72 },
                { tag: '#socialmediamarketing', category: 'related', reach: 5_200_000, competition: 'low', relevanceScore: 0.88 },
                { tag: '#contentcreator', category: 'related', reach: 9_800_000, competition: 'medium', relevanceScore: 0.81 },
                { tag: '#brandbuilding', category: 'branded', reach: 450_000, competition: 'low', relevanceScore: 0.95 },
            ];

            return mockSuggestions;
        },
        onSuccess: (data) => {
            setSuggestions(data);
        },
    });

    const addHashtag = useCallback((tag: string) => {
        if (!selectedHashtags.includes(tag)) {
            onHashtagsChange([...selectedHashtags, tag]);
        }
    }, [selectedHashtags, onHashtagsChange]);

    const removeHashtag = useCallback((tag: string) => {
        onHashtagsChange(selectedHashtags.filter((h) => h !== tag));
    }, [selectedHashtags, onHashtagsChange]);

    const platformLimits: Record<string, number> = {
        instagram: 30,
        tiktok: 5,
        pinterest: 20,
        linkedin: 5,
        facebook: 10,
    };

    const limit = platformLimits[platform.toLowerCase()] || 30;
    const remaining = limit - selectedHashtags.length;

    return (
        <div className={cn('card p-5', className)}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient">
                        <Hash className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="font-semibold">Hashtag Intelligence</h3>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => analyzeMutation.mutate()}
                    disabled={analyzeMutation.isPending || !caption.trim()}
                    className="btn-interactive"
                >
                    {analyzeMutation.isPending ? (
                        <LoadingSpinner size="sm" />
                    ) : (
                        <Sparkles className="w-4 h-4 mr-1" />
                    )}
                    Analyze
                </Button>
            </div>

            {/* Selected Hashtags */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                        Selected ({selectedHashtags.length}/{limit})
                    </label>
                    {remaining <= 3 && remaining > 0 && (
                        <span className="text-xs text-[var(--warning)]">
                            {remaining} remaining
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 rounded-lg bg-[var(--bg-tertiary)]">
                    {selectedHashtags.length === 0 ? (
                        <span className="text-sm text-[var(--text-muted)]">
                            No hashtags selected
                        </span>
                    ) : (
                        selectedHashtags.map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                            >
                                {tag}
                                <button
                                    onClick={() => removeHashtag(tag)}
                                    className="hover:text-[var(--error)] transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))
                    )}
                </div>
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
                <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                        AI Suggestions
                    </label>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {suggestions.map((suggestion) => {
                            const isSelected = selectedHashtags.includes(suggestion.tag);
                            const atLimit = selectedHashtags.length >= limit;

                            return (
                                <div
                                    key={suggestion.tag}
                                    className={cn(
                                        'flex items-center justify-between p-3 rounded-lg transition-colors',
                                        isSelected
                                            ? 'bg-[var(--accent-gold-light)]'
                                            : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80'
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Category Badge */}
                                        <span className={cn(
                                            'px-2 py-0.5 rounded text-xs font-medium',
                                            categoryColors[suggestion.category]
                                        )}>
                                            {suggestion.category}
                                        </span>

                                        {/* Tag Name */}
                                        <span className="font-medium text-[var(--text-primary)]">
                                            {suggestion.tag}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        {/* Metrics */}
                                        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                                            <span className="flex items-center gap-1" title="Reach">
                                                <Users className="w-3 h-3" />
                                                {formatReach(suggestion.reach)}
                                            </span>
                                            <span className={cn(
                                                'flex items-center gap-1',
                                                competitionColors[suggestion.competition]
                                            )} title="Competition">
                                                <BarChart3 className="w-3 h-3" />
                                                {suggestion.competition}
                                            </span>
                                            <span className="flex items-center gap-1" title="Relevance">
                                                <TrendingUp className="w-3 h-3 text-[var(--accent-gold)]" />
                                                {Math.round(suggestion.relevanceScore * 100)}%
                                            </span>
                                        </div>

                                        {/* Add/Remove Button */}
                                        <button
                                            onClick={() => isSelected ? removeHashtag(suggestion.tag) : addHashtag(suggestion.tag)}
                                            disabled={!isSelected && atLimit}
                                            className={cn(
                                                'p-1.5 rounded transition-colors',
                                                isSelected
                                                    ? 'bg-[var(--error)] text-white hover:bg-[var(--error)]/80'
                                                    : atLimit
                                                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                                                        : 'bg-[var(--accent-gold)] text-white hover:bg-[var(--accent-gold)]/80'
                                            )}
                                        >
                                            {isSelected ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {suggestions.length === 0 && !analyzeMutation.isPending && (
                <div className="text-center py-6 text-[var(--text-muted)]">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                        Click &quot;Analyze&quot; to get AI-powered hashtag suggestions
                    </p>
                </div>
            )}
        </div>
    );
}
