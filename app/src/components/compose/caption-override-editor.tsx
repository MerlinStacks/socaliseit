/**
 * Caption Override Editor
 * Allows per-platform caption customization
 */

'use client';

import { useState, useEffect } from 'react';
import { Edit3, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';

interface CaptionOverrideEditorProps {
    platform: Platform;
    defaultCaption: string;
    override?: string;
    onChange: (value?: string) => void;
}

/**
 * Caption override editor with inline editing mode
 * Why: Allows users to customize captions per-platform without affecting others
 */
export function CaptionOverrideEditor({
    platform,
    defaultCaption,
    override,
    onChange,
}: CaptionOverrideEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(override || '');
    const spec = PLATFORM_SPECS[platform];
    const displayCaption = override || defaultCaption;
    const charCount = displayCaption.length;
    const limit = spec.characterLimits.caption.max;

    /**
     * Sync local state when override or platform changes
     * Why: Prevents edits in one platform's caption from affecting others
     * when switching between platforms
     */
    useEffect(() => {
        setLocalValue(override || '');
        setIsEditing(false);
    }, [override, platform]);

    if (isEditing) {
        return (
            <div className="space-y-2">
                <textarea
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    placeholder={defaultCaption || 'Enter caption...'}
                    className="min-h-[100px] w-full resize-none rounded-lg border border-[var(--accent-gold)] bg-[var(--bg-tertiary)] p-3 text-sm outline-none"
                />
                <div className="flex items-center justify-between">
                    <span
                        className={cn(
                            'text-xs',
                            charCount > limit ? 'text-red-500' : 'text-[var(--text-muted)]'
                        )}
                    >
                        {localValue.length} / {limit.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setLocalValue('');
                                setIsEditing(false);
                            }}
                            className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                onChange(localValue || undefined);
                                setIsEditing(false);
                            }}
                            className="flex items-center gap-1 rounded bg-[var(--accent-gold)] px-2 py-1 text-xs text-white"
                        >
                            <Check className="h-3 w-3" />
                            Save
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={() => {
                setLocalValue(override || defaultCaption);
                setIsEditing(true);
            }}
            className="group flex w-full items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-left hover:border-[var(--accent-gold)]"
        >
            <Edit3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent-gold)]" />
            <div className="flex-1 min-w-0">
                <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">
                    {displayCaption || 'No caption'}
                </p>
                <p
                    className={cn(
                        'mt-1 text-xs',
                        charCount > limit ? 'text-red-500' : 'text-[var(--text-muted)]'
                    )}
                >
                    {charCount} / {limit.toLocaleString()}
                </p>
            </div>
        </button>
    );
}
