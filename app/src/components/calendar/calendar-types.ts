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
    /** Platform-specific metrics (Reels skip rate, Story taps, Threads quotes, etc.) */
    platformMetrics?: Record<string, unknown> | null;
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
    /** Post type for icons: feed, story, reel, carousel, etc. */
    postType?: string;
    /** Social account display name for tooltip */
    accountName?: string;
    /** Whether this post was AI-generated (for special rendering) */
    isAiGenerated?: boolean;
    /** Unique key for drag tracking: postId:platform (allows multi-platform posts to drag independently) */
    dragKey: string;
    /** NEW: Links related posts created together from multi-platform scheduling */
    linkedGroupId?: string | null;
    /** Platform-assigned post ID (for deletion API) */
    platformPostId?: string | null;
    /** Social account ID this post belongs to (for API calls) */
    socialAccountId?: string;
}

export interface CalendarNote {
    id: string;
    title: string;
    description: string | null;
    date: string;       // ISO string
    color: string;
    isPrivate: boolean;
    createdById: string;
}

/** Preset color palette for calendar notes */
export const NOTE_COLORS = [
    '#D4A574', '#E8B4B8', '#A8D5BA', '#8BB8E8',
    '#C4A6E0', '#F0C987', '#E8A0BF', '#82CFCF',
] as const;

export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'pinterest', 'linkedin', 'bluesky', 'google_business', 'threads', 'manual'] as const;
export type Platform = (typeof PLATFORMS)[number];

import { PLATFORM_COLORS } from '@/lib/platforms/ui';

// Derive border colors from consolidated PLATFORM_COLORS
export const platformColors: Record<string, string> = Object.fromEntries(
    Object.entries(PLATFORM_COLORS).map(([k, v]) => [k, v.border])
);



export const platformLabels: Record<Platform, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    facebook: 'Facebook',
    pinterest: 'Pinterest',
    linkedin: 'LinkedIn',
    bluesky: 'Bluesky',
    google_business: 'Google My Business',
    threads: 'Threads',
    manual: 'Remind to Post',
};

import { format } from 'date-fns';

/**
 * Format ISO timestamp to local time (e.g., "7:30 PM")
 * Why: Uses date-fns format() instead of toLocaleTimeString() to produce
 * identical output on server (Node.js) and client (browser), preventing
 * React hydration mismatches (error #418).
 */
export function formatTimeFromISO(isoString: string): string {
    const date = new Date(isoString);
    return format(date, 'h:mm a');
}

/**
 * Get local hour from ISO timestamp
 * Why: Need to match posts to hour slots using user's local time, not UTC
 */
export function getLocalHour(isoString: string): number {
    return new Date(isoString).getHours();
}
