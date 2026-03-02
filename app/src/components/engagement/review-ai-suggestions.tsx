'use client';

/**
 * ReviewAiSuggestions — fetches AI-generated reply suggestions for a review
 * and presents them as clickable pills.
 *
 * Improvements over original:
 * - #1: `hasFetched` flag prevents looping back to button after empty result
 * - #7: Uses `apiFetch` instead of raw `fetch`
 * - #11: Uses suggestion text as key instead of array index
 */

import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-error';

interface ReviewAiSuggestionsProps {
    reviewText: string;
    rating: number;
    platform: string;
    onSelect: (text: string) => void;
    disabled: boolean;
}

export function ReviewAiSuggestions({
    reviewText,
    rating,
    platform,
    onSelect,
    disabled,
}: ReviewAiSuggestionsProps) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    /** Why: Prevents the button from reappearing after the API returns an empty array */
    const [hasFetched, setHasFetched] = useState(false);

    const fetchSuggestions = async () => {
        setIsFetching(true);
        try {
            const sentiment =
                rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';
            const normalizedPlatform = platform.toLowerCase().replace(/ /g, '_');
            const data = await apiFetch<{ data?: { suggestions?: string[] } }>(
                '/api/ai/generate-reply',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messageText: reviewText || `${rating}-star review with no text`,
                        messageType: 'review',
                        platform: normalizedPlatform,
                        sentiment,
                        rating,
                    }),
                },
                'Failed to fetch AI suggestions',
            );
            setSuggestions(data.data?.suggestions || []);
        } catch {
            // apiFetch already shows a toast — no extra handling needed
        } finally {
            setIsFetching(false);
            setHasFetched(true);
        }
    };

    // First render or after a reset — show the trigger button
    if (!hasFetched && suggestions.length === 0 && !isFetching) {
        return (
            <Button
                variant="ghost"
                size="sm"
                onClick={fetchSuggestions}
                disabled={disabled || isFetching}
                className="gap-2 mt-2"
                style={{ color: 'var(--accent-gold)' }}
            >
                <Sparkles className="h-3.5 w-3.5" />
                AI reply suggestions
            </Button>
        );
    }

    return (
        <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent-gold)' }}>
                <Sparkles className="h-3 w-3" />
                <span className="font-medium">AI Suggestions</span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 ml-auto interactive-scale"
                    onClick={fetchSuggestions}
                    disabled={isFetching}
                    aria-label="Regenerate suggestions"
                >
                    <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
                </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {isFetching ? (
                    <>
                        <Skeleton className="h-7 w-32 rounded-full" />
                        <Skeleton className="h-7 w-40 rounded-full" />
                    </>
                ) : suggestions.length === 0 ? (
                    <span className="text-xs px-3 py-1" style={{ color: 'var(--text-muted)' }}>
                        No suggestions available — try regenerating.
                    </span>
                ) : (
                    suggestions.map((s) => (
                        <button
                            key={s}
                            onClick={() => onSelect(s)}
                            className="px-3 py-1 text-xs rounded-full border transition-all duration-200 text-left max-w-[240px] truncate hover:shadow-sm"
                            style={{
                                background: 'var(--bg-secondary)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                            title={s}
                        >
                            {s.slice(0, 60)}{s.length > 60 ? '…' : ''}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
