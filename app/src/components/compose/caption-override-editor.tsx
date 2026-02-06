/**
 * Caption Override Editor
 * Allows per-platform caption customization with auto-save
 */

'use client';

import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';

interface CaptionOverrideEditorProps {
    platform: Platform;
    defaultCaption: string;
    override?: string;
    onChange: (value?: string) => void;
}

/**
 * Caption override editor with auto-save
 * Why: Users can type platform-specific captions and changes are saved automatically
 */
export function CaptionOverrideEditor({
    platform,
    defaultCaption,
    override,
    onChange,
}: CaptionOverrideEditorProps) {
    const [isFocused, setIsFocused] = useState(false);
    const spec = PLATFORM_SPECS[platform];

    // Compute display values for character count and UI state
    const displayValue = override ?? defaultCaption;
    const charCount = displayValue.length;
    const limit = spec.characterLimits.caption.max;

    const hasOverride = override !== undefined && override !== '';

    /**
     * Handle text changes with auto-save
     * Why: Saves immediately on every keystroke without requiring a save button
     */
    const handleChange = useCallback((value: string) => {
        // If the value matches the default caption, clear the override
        // Otherwise, set the override
        if (value === defaultCaption || value === '') {
            onChange(undefined);
        } else {
            onChange(value);
        }
    }, [defaultCaption, onChange]);

    /**
     * Clear the override and revert to default
     */
    const handleClear = useCallback(() => {
        onChange(undefined);
    }, [onChange]);

    return (
        <div className="space-y-2">
            <div className="relative">
                <textarea
                    value={hasOverride ? override : ''}
                    onChange={(e) => handleChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={defaultCaption || 'Enter a different caption for this platform...'}
                    className={cn(
                        'min-h-[100px] w-full resize-none rounded-lg border bg-[var(--bg-tertiary)] p-3 pr-10 text-sm outline-none transition-colors',
                        isFocused
                            ? 'border-[var(--accent-gold)]'
                            : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                    )}
                />
                {/* Clear button - only show when there's an override */}
                {hasOverride && (
                    <button
                        onClick={handleClear}
                        type="button"
                        className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                        title="Clear override and use default caption"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            <div className="flex items-center justify-between">
                <span
                    className={cn(
                        'text-xs',
                        charCount > limit ? 'text-red-500' : 'text-[var(--text-muted)]'
                    )}
                >
                    {charCount} / {limit.toLocaleString()}
                </span>
                {hasOverride && (
                    <span className="text-xs text-[var(--accent-gold)]">
                        Custom caption active
                    </span>
                )}
            </div>
        </div>
    );
}
