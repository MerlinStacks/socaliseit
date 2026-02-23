/**
 * Plan Badge Component
 *
 * Why: Small colored pill showing the current plan tier.
 * Used in the sidebar, headers, and billing settings.
 */

'use client';

import { useBilling } from '@/hooks/use-billing';

interface PlanBadgeProps {
    /** Override size — 'sm' for sidebar, 'md' for settings */
    size?: 'sm' | 'md';
    /** Optional: force a specific tier (for static rendering) */
    tier?: string;
    color?: string;
    name?: string;
}

export function PlanBadge({ size = 'sm', tier: forcedTier, color: forcedColor, name: forcedName }: PlanBadgeProps) {
    const { display, tier: hookTier } = useBilling();

    const activeTier = forcedTier || hookTier;
    const activeColor = forcedColor || display.color;
    const activeName = forcedName || display.name;

    const sizeClasses = size === 'sm'
        ? 'px-2 py-0.5 text-[10px]'
        : 'px-3 py-1 text-xs';

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wider ${sizeClasses}`}
            style={{
                backgroundColor: `${activeColor}20`,
                color: activeColor,
                border: `1px solid ${activeColor}40`,
            }}
        >
            {activeTier === 'ADMIN' && (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
            )}
            {activeName}
        </span>
    );
}
