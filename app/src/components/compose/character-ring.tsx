'use client';

/**
 * Circular Character Ring Component
 * Visual progress ring for character count limits
 * Why: More engaging than plain numbers; shows limit approach at a glance
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getCharacterStatus, PLATFORM_LIMITS, type CharacterStatus } from '@/lib/validation';
import { PlatformIcon } from '@/components/compose/profile-selector';
import type { Platform } from '@/lib/platform-config';

interface CircularCharacterRingProps {
    text: string;
    platform: keyof typeof PLATFORM_LIMITS;
    size?: number;
    showPlatformIcon?: boolean;
    className?: string;
}

/**
 * SVG-based circular progress ring for character limits
 */
export function CircularCharacterRing({
    text,
    platform,
    size = 40,
    showPlatformIcon = true,
    className,
}: CircularCharacterRingProps) {
    const result = useMemo(() => getCharacterStatus(text, platform), [text, platform]);

    if (result.limit === Infinity) return null;

    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const percentage = Math.min(result.percentage, 100);
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    const statusColors: Record<CharacterStatus, { stroke: string; bg: string; text: string }> = {
        ok: {
            stroke: 'stroke-green-500',
            bg: 'bg-green-500/10',
            text: 'text-green-500',
        },
        warning: {
            stroke: 'stroke-amber-500',
            bg: 'bg-amber-500/10',
            text: 'text-amber-500',
        },
        error: {
            stroke: 'stroke-red-500',
            bg: 'bg-red-500/10',
            text: 'text-red-500',
        },
    };

    const colors = statusColors[result.status];

    return (
        <div
            className={cn('relative inline-flex items-center justify-center', className)}
            style={{ width: size, height: size }}
            title={`${result.count.toLocaleString()} / ${result.limit.toLocaleString()} characters`}
        >
            {/* Background circle */}
            <svg
                className="absolute inset-0 -rotate-90"
                width={size}
                height={size}
            >
                {/* Track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-[var(--border)] opacity-30"
                />
                {/* Progress */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className={cn(colors.stroke, 'transition-all duration-300')}
                />
            </svg>

            {/* Center content */}
            {showPlatformIcon ? (
                <PlatformIcon platform={platform as Platform} size={size * 0.4} />
            ) : (
                <span className={cn('text-[10px] font-bold', colors.text)}>
                    {result.percentage > 100 ? `+${Math.round(result.percentage - 100)}` : Math.round(result.percentage)}
                </span>
            )}
        </div>
    );
}

/**
 * Multi-platform character ring row
 */
interface CharacterRingRowProps {
    text: string;
    platforms: (keyof typeof PLATFORM_LIMITS)[];
    size?: number;
    className?: string;
}

export function CharacterRingRow({ text, platforms, size = 36, className }: CharacterRingRowProps) {
    return (
        <div className={cn('flex items-center gap-2', className)}>
            {platforms.map((platform) => (
                <CircularCharacterRing
                    key={platform}
                    text={text}
                    platform={platform}
                    size={size}
                    showPlatformIcon
                />
            ))}
        </div>
    );
}
