/**
 * Smart Scheduling — Shared Types
 *
 * Why: Extracted from smart-scheduling.ts to keep each module under
 * 200 lines and enable clean imports across the modular architecture.
 */

import { Platform, PostType } from '@/generated/prisma/enums';

// ============================================================================
// Public API Types
// ============================================================================

export interface TimeSlot {
    day: number;   // 0-6 (Sun-Sat)
    hour: number;  // 0-23
    minute: number;
    postType?: PostType;
}

export interface Recommendation {
    id: string;
    date: Date;
    hour: number;
    minute: number;
    platform: Platform;
    postType?: PostType;
    reason: string;
    confidence: number; // 0-1
}

// ============================================================================
// Internal Engine Types
// ============================================================================

/** Historical post data with full analytics for scoring. */
export interface PostData {
    publishedAt: Date;
    platform: Platform;
    postType: PostType;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    reach: number;
    impressions: number;
    engagementRate: number;
    videoViews: number;
    avgWatchPercentage: number;
    clicks: number;
}

/** Internal heatmap cell with computed multi-signal score. */
export interface HeatmapCell {
    day: number;
    hour: number;
    platform: Platform;
    postType: PostType;
    /** Primary format-specific engagement score (normalised 0-1). */
    engagementScore: number;
    /** Instagram audience activity bonus (0-1 × weight). */
    audienceBonus: number;
    /** Competitor posting density penalty (0-1 × weight). */
    competitorPenalty: number;
    /** Hashtag-time correlation bonus (0-1 × weight). */
    hashtagBonus: number;
    /** Follower growth correlation bonus (0-1 × weight). */
    followerGrowthBonus: number;
    /** Audience timezone overlap bonus (0-1 × weight). */
    timezoneBonus: number;
    /** Final combined score after all signals. */
    combinedScore: number;
    /** Number of data points that contributed to this cell. */
    sampleSize: number;
    /** Which signals were active (for richer reason strings). */
    activeSignals: string[];
}

/** Day×Hour grid normalised to 0-1 range. */
export type NormalisedGrid = Record<number, Record<number, number>>;

/**
 * All signal data loaded in parallel, passed to the scoring engine.
 * Why: Loading data and scoring are separate concerns — this interface
 * bridges them cleanly.
 */
export interface SignalData {
    posts: PostData[];
    audienceGrid: NormalisedGrid | null;
    competitorDensity: NormalisedGrid | null;
    hashtagCorrelation: NormalisedGrid | null;
    followerGrowth: NormalisedGrid | null;
    timezoneWeights: Record<number, number> | null; // hour → weight (0-1)
}

// ============================================================================
// Signal Weight Configuration
// ============================================================================

/**
 * Why: Centralised weight constants so tuning is easy and the scoring
 * function signature stays clean.
 */
export const SIGNAL_WEIGHTS = {
    /** Instagram audience activity bonus multiplier. */
    AUDIENCE_ACTIVITY: 0.30,
    /** Competitor density penalty multiplier (negative effect). */
    COMPETITOR_AVOIDANCE: 0.20,
    /** Hashtag-time correlation bonus multiplier. */
    HASHTAG_CORRELATION: 0.15,
    /** Follower growth correlation bonus multiplier. */
    FOLLOWER_GROWTH: 0.10,
    /** Audience timezone overlap bonus multiplier. */
    TIMEZONE_OVERLAP: 0.25,
} as const;

// ============================================================================
// Engine Configuration Constants
// ============================================================================

/** Minimum published posts needed before showing recommendations. */
export const MIN_POSTS_THRESHOLD = 10;

/** How many weeks of recommendations to generate ahead. */
export const DEFAULT_WEEKS_AHEAD = 4;

/** Maximum recommendations per platform per week. */
export const MAX_RECS_PER_PLATFORM_WEEK = 7;

/** Minimum gap between recommended slots in hours. */
export const MIN_GAP_HOURS = 2;

export { PostType, Platform };
