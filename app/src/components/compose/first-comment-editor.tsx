/**
 * First Comment Editor
 * For platforms that support auto-posting a first comment
 */

'use client';

import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Platform } from '@/lib/platform-config';

interface FirstCommentEditorProps {
    value: string;
    onChange: (value: string) => void;
    platform: Platform;
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
 * Why: Inline editor for first comment with platform-specific character limits
 */
export function FirstCommentEditor({ value, onChange, platform }: FirstCommentEditorProps) {
    const characterLimit = getCommentLimit(platform);
    const isOverLimit = value.length > characterLimit;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <MessageCircle className="h-3 w-3" />
                <span>Great for hashtags, CTAs, or questions</span>
            </div>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Add your first comment..."
                rows={2}
                className={cn(
                    'w-full resize-none rounded-lg border bg-[var(--bg-tertiary)] p-2 text-sm outline-none transition-colors',
                    isOverLimit
                        ? 'border-red-500'
                        : 'border-[var(--border)] focus:border-[var(--accent-gold)]'
                )}
            />
            <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">
                    {value.length > 0 ? `${value.length} / ${characterLimit}` : ''}
                </span>
            </div>
        </div>
    );
}
