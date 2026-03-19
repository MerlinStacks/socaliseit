import { type Platform } from './types';

/**
 * Canonical display order for platforms in UI (sidebar, tabs, etc.)
 * Why: Ensures consistent platform ordering across the application
 */
export const PLATFORM_ORDER: Platform[] = [
    'google_business',
    'facebook',
    'instagram',
    'threads',
    'youtube',
    'tiktok',
    'pinterest',
    'bluesky',
    'linkedin', // LinkedIn at end as it's less commonly used
    'manual',   // Manual/Remind-to-Post at very end
];

/**
 * Sort platforms by the canonical display order
 * Why: Provides consistent ordering when iterating over platform selections
 */
export function sortPlatformsByOrder(platforms: Platform[]): Platform[] {
    return [...platforms].sort((a, b) => {
        const indexA = PLATFORM_ORDER.indexOf(a);
        const indexB = PLATFORM_ORDER.indexOf(b);
        // If platform not found in order, place at end
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
}

/**
 * Get the sort index for a platform
 * Why: Centralized helper for consistent platform ordering in sort comparisons
 * @returns Sort index (0-based), or 999 if platform not in PLATFORM_ORDER
 */
export function getPlatformSortIndex(platform: Platform): number {
    const index = PLATFORM_ORDER.indexOf(platform);
    return index === -1 ? 999 : index;
}

/**
 * Platform publishing rate limits (daily/hourly)
 * Why: Prevents users from hitting platform API rate limits
 * These are conservative estimates - actual limits vary by account type
 */
export const PLATFORM_RATE_LIMITS: Record<Platform, { daily: number; hourly?: number }> = {
    instagram: { daily: 25, hourly: 10 },
    facebook: { daily: 50 },
    tiktok: { daily: 30 },
    youtube: { daily: 50 },  // Generous for API
    pinterest: { daily: 150, hourly: 50 },
    linkedin: { daily: 100 },
    bluesky: { daily: 300 },
    threads: { daily: 250 },
    google_business: { daily: 10 },
    manual: { daily: 999 }, // No API rate limits for reminder-only
};
