/**
 * UGC Search Client Component
 * Handles hashtag search form for real-time UGC discovery
 */
'use client';

import { useState, useCallback, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Search, X, Loader2, Hash } from 'lucide-react';

interface UGCSearchFormProps {
    onSearch: (hashtags: string[]) => void;
    isSearching?: boolean;
}

/**
 * Component for entering hashtags to search for UGC
 */
export function UGCSearchForm({ onSearch, isSearching }: UGCSearchFormProps) {
    const [hashtagInput, setHashtagInput] = useState('');
    const [hashtags, setHashtags] = useState<string[]>([]);

    const addHashtag = useCallback(() => {
        const trimmed = hashtagInput.trim().replace(/^#/, '');
        if (trimmed && !hashtags.includes(trimmed) && hashtags.length < 5) {
            setHashtags([...hashtags, trimmed]);
            setHashtagInput('');
        }
    }, [hashtagInput, hashtags]);

    const removeHashtag = useCallback((tag: string) => {
        setHashtags(hashtags.filter(h => h !== tag));
    }, [hashtags]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addHashtag();
        }
    }, [addHashtag]);

    const handleSearch = useCallback(() => {
        if (hashtags.length > 0) {
            onSearch(hashtags);
        }
    }, [hashtags, onSearch]);

    return (
        <div className="card p-4 mb-6">
            <h3 className="text-sm font-medium mb-3">Search Hashtags</h3>
            <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        value={hashtagInput}
                        onChange={(e) => setHashtagInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter a hashtag (e.g., yourbrand)"
                        className="input pl-9 w-full"
                        disabled={isSearching}
                    />
                </div>
                <Button
                    variant="secondary"
                    onClick={addHashtag}
                    disabled={!hashtagInput.trim() || hashtags.length >= 5 || isSearching}
                >
                    Add
                </Button>
            </div>

            {/* Hashtag Pills */}
            {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {hashtags.map(tag => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-sm"
                        >
                            #{tag}
                            <button
                                onClick={() => removeHashtag(tag)}
                                className="hover:text-[var(--error)] transition-colors"
                                disabled={isSearching}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--text-muted)]">
                    {hashtags.length}/5 hashtags (max 30 unique per 7 days due to API limits)
                </p>
                <Button
                    onClick={handleSearch}
                    disabled={hashtags.length === 0 || isSearching}
                >
                    {isSearching ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching...
                        </>
                    ) : (
                        <>
                            <Search className="h-4 w-4" />
                            Search for UGC
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
