/**
 * First Comment Input Component
 * Collapsible input for scheduling first comment (Instagram engagement hack)
 */

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, Info } from 'lucide-react';
import { CharacterCounter } from './inline-validation';
import { PLATFORM_LIMITS } from '@/lib/validation';
import { type Platform } from '@/lib/platform-config';

interface FirstCommentInputProps {
    /**
     * The first comment text value
     */
    value: string;
    /**
     * Called when the first comment changes
     */
    onChange: (value: string) => void;
    /**
     * Primary platform for character limit display
     */
    platform: Platform;
    /**
     * Optional className for styling
     */
    className?: string;
}

/**
 * First Comment Input - allows scheduling a first comment to be posted after the main post
 * Why: Instagram algorithm favors posts with early engagement, and hashtags in first comment
 * keeps the caption clean while still being discoverable
 */
export function FirstCommentInput({
    value,
    onChange,
    platform,
    className = '',
}: FirstCommentInputProps) {
    const [isExpanded, setIsExpanded] = useState(value.length > 0);

    // Get comment character limit for platform
    const getCommentLimit = (p: Platform): number => {
        switch (p) {
            case 'instagram':
                return 2200; // Same as caption
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
    };

    const characterLimit = getCommentLimit(platform);
    const isOverLimit = value.length > characterLimit;

    // Platforms that support first comment
    const supportedPlatforms: Platform[] = [
        'instagram',
        'facebook',
        'tiktok',
        'youtube',
        'linkedin',
    ];

    const isSupported = supportedPlatforms.includes(platform);

    if (!isSupported) {
        return null;
    }

    return (
        <div className={`rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] ${className}`}>
            {/* Header - Collapsible Toggle */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
            >
                <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-[var(--accent-gold)]" />
                    <span className="text-sm font-medium">First Comment</span>
                    {value.length > 0 && (
                        <span className="rounded bg-[var(--accent-gold)]/20 px-2 py-0.5 text-xs text-[var(--accent-gold)]">
                            {value.length} chars
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t border-[var(--border)] p-3">
                    {/* Info tip */}
                    <div className="mb-3 flex items-start gap-2 rounded-lg bg-[var(--bg-tertiary)] p-2">
                        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--accent-gold)]" />
                        <p className="text-xs text-[var(--text-muted)]">
                            First comments boost engagement. Great for hashtags on Instagram
                            (keeps caption clean) or pinned comments on YouTube/TikTok.
                        </p>
                    </div>

                    {/* Textarea */}
                    <div className="relative">
                        <textarea
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="Add your first comment (e.g., hashtags, CTA, question)..."
                            rows={3}
                            className={`w-full resize-none rounded-lg border bg-[var(--bg-tertiary)] p-3 text-sm outline-none transition-colors ${isOverLimit
                                ? 'border-red-500'
                                : 'border-[var(--border)] focus:border-[var(--accent-gold)]'
                                }`}
                        />
                    </div>

                    {/* Character Counter */}
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-[var(--text-muted)]">
                            Posted immediately after your main content
                        </span>
                        <CharacterCounter
                            text={value}
                            platform={platform}
                            compact
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
