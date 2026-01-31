/**
 * Inline Validation Components
 * Real-time validation feedback with contextual help
 */

'use client';

import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Hash, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    getCharacterStatus,
    getHashtagStatus,
    getMediaAspectStatus,
    PLATFORM_LIMITS,
    type CharacterStatus,
} from '@/lib/validation';

// ============================================================================
// Character Counter Component
// ============================================================================

interface CharacterCounterProps {
    text: string;
    platform: keyof typeof PLATFORM_LIMITS;
    showRecommended?: boolean;
    compact?: boolean;
    className?: string;
}

/**
 * Real-time character counter with progress bar
 * Why: Provides immediate visual feedback as users approach platform limits
 */
export function CharacterCounter({
    text,
    platform,
    showRecommended = false,
    compact = false,
    className,
}: CharacterCounterProps) {
    const result = useMemo(() => getCharacterStatus(text, platform), [text, platform]);

    if (result.limit === Infinity) return null;

    const statusColors: Record<CharacterStatus, string> = {
        ok: 'text-[var(--success)] bg-[var(--success)]',
        warning: 'text-[var(--warning)] bg-[var(--warning)]',
        error: 'text-[var(--error)] bg-[var(--error)]',
    };

    const bgColors: Record<CharacterStatus, string> = {
        ok: 'bg-[var(--success-light)]',
        warning: 'bg-[var(--warning-light)]',
        error: 'bg-[var(--error-light)]',
    };

    if (compact) {
        return (
            <span
                className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    bgColors[result.status],
                    statusColors[result.status].split(' ')[0],
                    className
                )}
            >
                {result.count}/{result.limit}
            </span>
        );
    }

    return (
        <div className={cn('space-y-1.5', className)}>
            {/* Progress Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                <div
                    className={cn(
                        'h-full transition-all duration-200',
                        statusColors[result.status].split(' ')[1]
                    )}
                    style={{ width: `${Math.min(result.percentage, 100)}%` }}
                />
            </div>

            {/* Count Display */}
            <div className="flex items-center justify-between text-xs">
                <span className={cn('font-medium', statusColors[result.status].split(' ')[0])}>
                    {result.count.toLocaleString()} / {result.limit.toLocaleString()}
                </span>
                {result.status === 'error' && (
                    <span className="flex items-center gap-1 text-[var(--error)]">
                        <AlertCircle className="h-3 w-3" />
                        {Math.abs(result.remaining).toLocaleString()} over
                    </span>
                )}
                {result.status === 'ok' && result.remaining < 100 && (
                    <span className="text-[var(--text-muted)]">
                        {result.remaining.toLocaleString()} remaining
                    </span>
                )}
                {showRecommended && result.recommended && result.status === 'warning' && (
                    <span className="flex items-center gap-1 text-[var(--warning)]">
                        <Info className="h-3 w-3" />
                        {result.recommended} recommended
                    </span>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Hashtag Counter Component
// ============================================================================

interface HashtagCounterProps {
    hashtags: string[];
    platform: keyof typeof PLATFORM_LIMITS;
    className?: string;
}

/**
 * Hashtag count indicator with platform-specific warnings
 * Why: Different platforms have different hashtag limits and engagement patterns
 */
export function HashtagCounter({ hashtags, platform, className }: HashtagCounterProps) {
    const result = useMemo(() => getHashtagStatus(hashtags, platform), [hashtags, platform]);

    if (result.limit === Infinity || result.limit === 0) return null;

    const statusIcons: Record<CharacterStatus, typeof CheckCircle> = {
        ok: CheckCircle,
        warning: AlertTriangle,
        error: AlertCircle,
    };

    const statusColors: Record<CharacterStatus, string> = {
        ok: 'text-[var(--success)] bg-[var(--success-light)]',
        warning: 'text-[var(--warning)] bg-[var(--warning-light)]',
        error: 'text-[var(--error)] bg-[var(--error-light)]',
    };

    const Icon = statusIcons[result.status];

    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium',
                statusColors[result.status],
                className
            )}
        >
            <Hash className="h-3.5 w-3.5" />
            <span>
                {result.count}/{result.limit}
            </span>
            {result.message && (
                <>
                    <span className="text-[var(--text-muted)]">•</span>
                    <span className="opacity-80">{result.message}</span>
                </>
            )}
            <Icon className="h-3.5 w-3.5" />
        </div>
    );
}

// ============================================================================
// Media Aspect Ratio Indicator
// ============================================================================

interface MediaAspectIndicatorProps {
    width: number;
    height: number;
    platform: keyof typeof PLATFORM_LIMITS;
    mediaType?: 'image' | 'video';
    className?: string;
}

/**
 * Aspect ratio validation indicator shown during upload
 * Why: Catches dimension issues early before upload completes
 */
export function MediaAspectIndicator({
    width,
    height,
    platform,
    mediaType = 'image',
    className,
}: MediaAspectIndicatorProps) {
    const result = useMemo(
        () => getMediaAspectStatus(width, height, platform, mediaType),
        [width, height, platform, mediaType]
    );

    const statusIcons: Record<CharacterStatus, typeof CheckCircle> = {
        ok: CheckCircle,
        warning: AlertTriangle,
        error: AlertCircle,
    };

    const statusColors: Record<CharacterStatus, string> = {
        ok: 'border-[var(--success)] bg-[var(--success-light)] text-[var(--success)]',
        warning: 'border-[var(--warning)] bg-[var(--warning-light)] text-[var(--warning)]',
        error: 'border-[var(--error)] bg-[var(--error-light)] text-[var(--error)]',
    };

    const Icon = statusIcons[result.status];

    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                statusColors[result.status],
                className
            )}
        >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="font-medium">{result.ratioString}</p>
                <p className="truncate opacity-80">{result.message}</p>
            </div>
        </div>
    );
}

// ============================================================================
// Combined Validation Status
// ============================================================================

interface InlineValidationProps {
    caption: string;
    hashtags: string[];
    platforms: (keyof typeof PLATFORM_LIMITS)[];
    className?: string;
}

/**
 * Combined inline validation display for multiple platforms
 * Why: Shows validation status for all selected platforms at once
 */
export function InlineValidation({
    caption,
    hashtags,
    platforms,
    className,
}: InlineValidationProps) {
    return (
        <div className={cn('space-y-3', className)}>
            {platforms.map((platform) => (
                <div key={platform} className="space-y-2">
                    <span className="text-xs font-medium capitalize text-[var(--text-muted)]">
                        {platform}
                    </span>
                    <div className="flex flex-wrap gap-2">
                        <CharacterCounter text={caption} platform={platform} compact />
                        <HashtagCounter hashtags={hashtags} platform={platform} />
                    </div>
                </div>
            ))}
        </div>
    );
}
