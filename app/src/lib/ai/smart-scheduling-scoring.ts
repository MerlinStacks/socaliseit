/**
 * Smart Scheduling — Scoring Engine
 *
 * Why: Separated from data loading so scoring logic can be tested
 * with mock data. Contains format-specific scoring, signal bonus
 * application, velocity weighting, and natural minute generation.
 */

import { PostType, Platform } from '@/generated/prisma/enums';
import { differenceInDays } from 'date-fns';
import type { PostData, NormalisedGrid, HeatmapCell, SignalData } from './smart-scheduling-types';
import { SIGNAL_WEIGHTS } from './smart-scheduling-types';

// ============================================================================
// Natural Minute Generation
// ============================================================================

/**
 * Pool of minutes that look like a human picked the time.
 * Why: Excludes all multiples of 5 (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55)
 * so recommended times read as 1:23, 8:43, 9:17, 5:48 — never :00 or :30.
 */
const NATURAL_MINUTES = [
    1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19,
    21, 22, 23, 24, 26, 27, 28, 29, 31, 32, 33, 34, 36, 37, 38, 39,
    41, 42, 43, 44, 46, 47, 48, 49, 51, 52, 53, 54, 56, 57, 58, 59,
];

/** Generate a minute value that looks organically chosen. */
export function generateNaturalMinute(): number {
    return NATURAL_MINUTES[Math.floor(Math.random() * NATURAL_MINUTES.length)];
}

// ============================================================================
// Velocity Weighting
// ============================================================================

/**
 * Recent posts weighted higher — content strategy evolves.
 * Why: A post from last week is more predictive than one from 3 months ago.
 */
export function calculateVelocityWeight(publishedAt: Date): number {
    const daysSince = differenceInDays(new Date(), publishedAt);
    if (daysSince <= 14) return 4;
    if (daysSince <= 30) return 3;
    if (daysSince <= 60) return 2;
    return 1;
}

// ============================================================================
// Format-Specific Scoring
// ============================================================================

/**
 * Calculate a composite engagement score based on post type.
 * Why: A Reel's success is measured by watch % and video views,
 * while a Carousel's success is measured by saves and shares.
 * Using the same raw score for all formats is misleading.
 */
export function getFormatSpecificScore(post: PostData): number {
    switch (post.postType) {
        case PostType.REEL:
        case 'SHORT' as PostType: // YouTube Shorts mapped to this enum
            return (
                0.50 * (post.avgWatchPercentage / 100) +
                0.30 * clamp01(post.videoViews / 10000) +
                0.20 * clamp01(post.engagementRate / 10)
            );

        case PostType.STORY:
            return (
                0.50 * clamp01(post.impressions / 5000) +
                0.35 * clamp01(post.reach / 3000) +
                0.15 * clamp01(post.engagementRate / 10)
            );

        case PostType.CAROUSEL:
            return (
                0.40 * clamp01(post.saves / 100) +
                0.30 * clamp01(post.shares / 50) +
                0.30 * clamp01(post.engagementRate / 10)
            );

        case PostType.FEED:
        default:
            return (
                0.60 * clamp01(post.engagementRate / 10) +
                0.30 * clamp01(post.reach / 5000) +
                0.10 * clamp01(post.impressions / 10000)
            );
    }
}

// ============================================================================
// Heatmap Building
// ============================================================================

/**
 * Build scored heatmap cells from posts + all signal data.
 * Why: This is the core of the engine — it converts raw post data
 * into day×hour cells with composite scores.
 */
export function buildScoredHeatmap(
    platformPosts: PostData[],
    platform: Platform,
    signals: SignalData
): HeatmapCell[] {
    // Why: Accumulate per-cell scores in a map, then convert to cells
    const cellMap = new Map<string, {
        totalScore: number;
        weightedCount: number;
        postType: PostType;
    }>();

    for (const post of platformPosts) {
        const day = new Date(post.publishedAt).getDay();
        const hour = new Date(post.publishedAt).getHours();
        const velocity = calculateVelocityWeight(post.publishedAt);
        const score = getFormatSpecificScore(post) * velocity;
        const key = `${day}-${hour}-${post.postType}`;

        const cur = cellMap.get(key) || { totalScore: 0, weightedCount: 0, postType: post.postType };
        cellMap.set(key, {
            totalScore: cur.totalScore + score,
            weightedCount: cur.weightedCount + velocity,
            postType: cur.postType,
        });
    }

    // Why: Normalise engagement scores before applying signal bonuses
    const cells: HeatmapCell[] = [];
    let maxScore = 0;

    for (const [key, data] of cellMap.entries()) {
        const avg = data.totalScore / data.weightedCount;
        if (avg > maxScore) maxScore = avg;
    }
    if (maxScore === 0) maxScore = 1;

    for (const [key, data] of cellMap.entries()) {
        const [dayStr, hourStr] = key.split('-');
        const day = parseInt(dayStr, 10);
        const hour = parseInt(hourStr, 10);
        const normEngagement = data.totalScore / data.weightedCount / maxScore;

        const activeSignals: string[] = ['engagement'];
        let audienceBonus = 0;
        let competitorPenalty = 0;
        let hashtagBonus = 0;
        let followerGrowthBonus = 0;
        let timezoneBonus = 0;

        // Why: Apply each signal as a bonus/penalty multiplier
        if (platform === Platform.INSTAGRAM && signals.audienceGrid) {
            const val = signals.audienceGrid[day]?.[hour] || 0;
            if (val > 0.1) {
                audienceBonus = val * SIGNAL_WEIGHTS.AUDIENCE_ACTIVITY;
                activeSignals.push('audience active');
            }
        }

        if (signals.competitorDensity) {
            const val = signals.competitorDensity[day]?.[hour] || 0;
            if (val > 0.3) {
                competitorPenalty = val * SIGNAL_WEIGHTS.COMPETITOR_AVOIDANCE;
                activeSignals.push('low competition');
            }
        }

        if (signals.hashtagCorrelation) {
            const val = signals.hashtagCorrelation[day]?.[hour] || 0;
            if (val > 0.2) {
                hashtagBonus = val * SIGNAL_WEIGHTS.HASHTAG_CORRELATION;
                activeSignals.push('hashtag-optimized');
            }
        }

        if (signals.followerGrowth) {
            const val = signals.followerGrowth[day]?.[hour] || 0;
            if (val > 0.2) {
                followerGrowthBonus = val * SIGNAL_WEIGHTS.FOLLOWER_GROWTH;
                activeSignals.push('growth-correlated');
            }
        }

        if (signals.timezoneWeights) {
            const val = signals.timezoneWeights[hour] || 0;
            if (val > 0.3) {
                timezoneBonus = val * SIGNAL_WEIGHTS.TIMEZONE_OVERLAP;
                activeSignals.push('audience timezone');
            }
        }

        // Why: Combined score = base engagement boosted by bonuses, reduced by competitor penalty
        const combined = normEngagement
            * (1 + audienceBonus + hashtagBonus + followerGrowthBonus + timezoneBonus)
            * (1 - competitorPenalty);

        cells.push({
            day, hour, platform,
            postType: data.postType,
            engagementScore: normEngagement,
            audienceBonus, competitorPenalty, hashtagBonus,
            followerGrowthBonus, timezoneBonus,
            combinedScore: combined,
            sampleSize: data.weightedCount,
            activeSignals,
        });
    }

    return cells.sort((a, b) => b.combinedScore - a.combinedScore);
}

// ============================================================================
// Reason String Builder
// ============================================================================

/**
 * Generate a human-readable reason from active signals.
 * Why: "High engagement for feed posts" is vague.
 * "Peak engagement rate + audience active + low competition for feed posts" is actionable.
 */
export function buildReasonString(cell: HeatmapCell): string {
    const parts: string[] = [];

    if (cell.activeSignals.includes('engagement')) {
        parts.push('Peak engagement rate');
    }
    if (cell.activeSignals.includes('audience active')) {
        parts.push('audience most active');
    }
    if (cell.activeSignals.includes('low competition')) {
        parts.push('low competitor posting');
    }
    if (cell.activeSignals.includes('hashtag-optimized')) {
        parts.push('strong hashtag performance');
    }
    if (cell.activeSignals.includes('growth-correlated')) {
        parts.push('follower growth signal');
    }
    if (cell.activeSignals.includes('audience timezone')) {
        parts.push('audience timezone overlap');
    }

    const typeLabel = cell.postType.toLowerCase();
    return parts.length > 0
        ? `${parts.join(' + ')} for ${typeLabel} posts`
        : `High engagement for ${typeLabel} posts`;
}

// ============================================================================
// Helpers
// ============================================================================

/** Clamp a value to 0-1 range. */
function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}
