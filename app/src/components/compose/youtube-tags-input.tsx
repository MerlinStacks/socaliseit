/**
 * YouTube Tags Input Component
 * Why: Provides pill-style tag input with memory system and paste support
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'youtube-tags-history';
const MAX_HISTORY = 50;

interface YouTubeTagsInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    className?: string;
}

/**
 * Get tag history from localStorage
 */
function getTagHistory(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

/**
 * Save tags to history (deduped, limited)
 */
function saveToHistory(newTags: string[]): void {
    if (typeof window === 'undefined') return;
    try {
        const existing = getTagHistory();
        const combined = [...new Set([...newTags, ...existing])].slice(0, MAX_HISTORY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
    } catch {
        // localStorage may be unavailable
    }
}

/**
 * YouTube-style tags input with:
 * - Pill-style tag display with remove buttons
 * - Comma/Enter to add new tags
 * - Paste handler that splits on comma
 * - Recent tags stored in localStorage
 * - Autocomplete suggestions from history
 */
export function YouTubeTagsInput({ tags, onChange, className }: YouTubeTagsInputProps) {
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter suggestions based on input
    useEffect(() => {
        if (!inputValue.trim()) {
            setSuggestions([]);
            return;
        }
        const history = getTagHistory();
        const filtered = history
            .filter(tag =>
                tag.toLowerCase().includes(inputValue.toLowerCase()) &&
                !tags.includes(tag)
            )
            .slice(0, 5);
        setSuggestions(filtered);
        setSelectedSuggestion(-1);
    }, [inputValue, tags]);

    // Close suggestions on click outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /**
     * Add tags from input, handling comma-separated values
     */
    const addTags = useCallback((value: string) => {
        const newTags = value
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0 && !tags.includes(t));

        if (newTags.length > 0) {
            const updated = [...tags, ...newTags];
            onChange(updated);
            saveToHistory(newTags);
        }
        setInputValue('');
        setSuggestions([]);
    }, [tags, onChange]);

    /**
     * Remove a tag by value
     */
    const removeTag = useCallback((tagToRemove: string) => {
        onChange(tags.filter(t => t !== tagToRemove));
    }, [tags, onChange]);

    /**
     * Handle keyboard events
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Add tag on Enter or comma
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
                addTags(suggestions[selectedSuggestion]);
            } else if (inputValue.trim()) {
                addTags(inputValue);
            }
            return;
        }

        // Navigate suggestions
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSuggestion(prev =>
                prev < suggestions.length - 1 ? prev + 1 : prev
            );
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSuggestion(prev => prev > 0 ? prev - 1 : -1);
            return;
        }

        // Remove last tag on backspace if input is empty
        if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
        }
    };

    /**
     * Handle paste with comma-separated support
     */
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text');
        addTags(pastedText);
    };

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            {/* Tags + Input */}
            <div
                className={cn(
                    'flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-2 min-h-[42px]',
                    'focus-within:border-[var(--accent-gold)]'
                )}
                onClick={() => inputRef.current?.focus()}
            >
                {/* Tag Pills */}
                {tags.map((tag, index) => (
                    <span
                        key={`${tag}-${index}`}
                        className="flex items-center gap-1 rounded-full bg-[var(--accent-gold-light)] px-2.5 py-1 text-xs font-medium text-[var(--accent-gold)]"
                    >
                        <Tag className="h-3 w-3" />
                        {tag}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                removeTag(tag);
                            }}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--accent-gold)] hover:text-white transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                ))}

                {/* Input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder={tags.length === 0 ? 'Add tags (comma separated)...' : ''}
                    className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
                />
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg">
                    <div className="p-1 text-xs text-[var(--text-muted)] px-2 pt-2">
                        Previously used
                    </div>
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={suggestion}
                            onClick={() => addTags(suggestion)}
                            className={cn(
                                'w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] transition-colors',
                                index === selectedSuggestion && 'bg-[var(--bg-tertiary)]'
                            )}
                        >
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}

            {/* Helper text */}
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Press Enter or use commas to add tags. Paste comma-separated list to add multiple.
            </p>
        </div>
    );
}
