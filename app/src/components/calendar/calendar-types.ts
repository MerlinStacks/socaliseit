/**
 * Calendar Types - Shared types for calendar components
 * Extracted to avoid circular dependencies
 */

export interface PostAnalytics {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    videoViews: number;
    videoWatchTime: number;
    avgWatchPercentage: number | null;
    syncedAt: string | null;
}

export interface CalendarPost {
    id: string;
    time: string;
    caption: string;
    platform: string;
    status: string;
    thumbnail: string | null;
    pillarColor: string | null;
    isExternal: boolean;
    externalUrl: string | null;
    isVideo?: boolean;
    analytics?: PostAnalytics | null;
}

export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'pinterest', 'linkedin', 'bluesky'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const platformColors: Record<string, string> = {
    instagram: 'border-l-pink-500',
    tiktok: 'border-l-gray-900',
    youtube: 'border-l-red-500',
    facebook: 'border-l-blue-500',
    pinterest: 'border-l-red-400',
    linkedin: 'border-l-blue-700',
    bluesky: 'border-l-sky-500',
};

export const platformLabels: Record<Platform, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    facebook: 'Facebook',
    pinterest: 'Pinterest',
    linkedin: 'LinkedIn',
    bluesky: 'Bluesky',
};

/**
 * Format ISO timestamp to local time (e.g., "7:30 PM")
 * Why: API returns ISO strings; format them in user's local timezone
 */
export function formatTimeFromISO(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Get local hour from ISO timestamp
 * Why: Need to match posts to hour slots using user's local time, not UTC
 */
export function getLocalHour(isoString: string): number {
    return new Date(isoString).getHours();
}
