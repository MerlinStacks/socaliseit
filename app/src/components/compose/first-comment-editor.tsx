/**
 * First Comment Editor
 * For platforms that support auto-posting a first comment with per-platform override
 */

'use client';

import { useState, useCallback } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Platform } from '@/lib/platform-config';

interface FirstCommentEditorProps {
    value: string;
    onChange: (value: string) => void;
    platform: Platform;
    /** Global first comment used as placeholder when no override is set */
    defaultValue?: string;
}

/**
 * Get comment character limit for platform
 */
function getCommentLimit(p: Platform): number {
    switch (p) {
        case 'instagram':
            return 2200;
        case 'facebook':
            return 8000;
        case 'tiktok':
            return 150;
        case 'youtube':
            return 10000;
        case 'linkedin':
            return 1250;
        default:
            return 2200;
    }
}

/**
 * First Comment Editor for customization panel
 * Why: Inline editor for first comment with platform-specific character limits and auto-save
 */
export function FirstCommentEditor({ value, onChange, platform, defaultValue = '' }: FirstCommentEditorProps) {
    const [isFocused, setIsFocused] = useState(false);
    const characterLimit = getCommentLimit(platform);

    // Use value if set, otherwise use default for display purposes
    const displayValue = value || defaultValue;
    const hasOverride = value !== '' && value !== undefined;
    const isOverLimit = displayValue.length > characterLimit;

    /**
     * Handle text changes with auto-save
     * Why: Saves immediately on every keystroke without requiring a save button
     */
    const handleChange = useCallback((newValue: string) => {
        onChange(newValue);
    }, [onChange]);

    /**
     * Clear the override and revert to default
     */
    const handleClear = useCallback(() => {
        onChange('');
    }, [onChange]);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <MessageCircle className="h-3 w-3" />
                <span>Great for hashtags, CTAs, or questions</span>
            </div>
            <div className="relative">
                <textarea
                    value={value}
                    onChange={(e) => handleChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={defaultValue || 'Add your first comment...'}
                    rows={2}
                    className={cn(
                        'w-full resize-none rounded-lg border bg-[var(--bg-tertiary)] p-2 pr-10 text-sm outline-none transition-colors',
                        isOverLimit
                            ? 'border-red-500'
                            : isFocused
                                ? 'border-[var(--accent-gold)]'
                                : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                    )}
                />
                {/* Clear button - only show when there's an override */}
                {hasOverride && (
                    <button
                        onClick={handleClear}
                        type="button"
                        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                        title="Clear override and use default first comment"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            <div className="flex items-center justify-between">
                <span className={cn(
                    'text-xs',
                    isOverLimit ? 'text-red-500' : 'text-[var(--text-muted)]'
                )}>
                    {displayValue.length > 0 ? `${displayValue.length} / ${characterLimit}` : ''}
                </span>
                {hasOverride && (
                    <span className="text-xs text-[var(--accent-gold)]">
                        Custom comment active
                    </span>
                )}
            </div>
        </div>
    );
}
