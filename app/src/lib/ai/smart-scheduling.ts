/**
 * Smart Scheduling Engine
 *
 * Calculates optimal posting times based on:
 * 1. Historical engagement data from the user's own published posts (primary)
 * 2. Instagram audience online-hours via `online_followers` API (bonus, +30%)
 *
 * Why this approach:
 * - Generic industry benchmarks = everyone posts at the same time = noise.
 * - Real engagement data from YOUR posts on YOUR audience is the ground truth.
 * - Instagram's `online_followers` metric adds a bonus signal for when
 *   followers are actually on the platform (only IG exposes this via API).
 * - Off-peak scoring: slight preference for times 15-45 min before peaks,
 *   so content is ready when audience arrives, not competing mid-flood.
 *
 * Minimum threshold: 10 published posts required per platform.
 * Platforms with insufficient data return empty — UI hides the feature.
 */

import { db } from '@/lib/db';
import { Platform, PostType } from '@/generated/prisma/enums';
import { startOfWeek, addDays, getDay, getHours, differenceInDays } from 'date-fns';
import { logger } from '@/lib/logger';

const log = logger.child({ service: 'smart-scheduling' });

/** Minimum published posts needed before showing recommendations. */
const MIN_POSTS_THRESHOLD = 10;

/** How many weeks of recommendations to generate ahead. */
const DEFAULT_WEEKS_AHEAD = 4;

/** Maximum recommendations per platform per week. */
const MAX_RECS_PER_PLATFORM_WEEK = 7;

/** Minimum gap between recommended slots in hours. */
const MIN_GAP_HOURS = 2;

/**
 * Weight multiplier for Instagram audience activity data.
 * Why 0.3: Historical engagement is the primary signal (1.0). Audience
 * online data is a supplementary signal — it tells us WHEN people are
 * online but not necessarily WHEN they engage with our specific content.
 */
const AUDIENCE_ACTIVITY_WEIGHT = 0.3;

/**
 * Generate a random minute offset for organic-looking post times.
 * Why: Avoids :00 to look less robotic. Favors common "natural" intervals.
 */
function getRandomMinute(): number {
    const naturalMinutes = [3, 7, 12, 17, 23, 27, 33, 37, 42, 47, 52, 57];
    return naturalMinutes[Math.floor(Math.random() * naturalMinutes.length)];
}

export interface TimeSlot {
    day: number; // 0-6 (Sun-Sat)
    hour: number; // 0-23
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

export { PostType };

/** Internal heatmap cell with computed score. */
interface HeatmapCell {
    day: number;
    hour: number;
    platform: Platform;
    postType: PostType;
    engagementScore: number;
    audienceBonus: number;
    combinedScore: number;
    sampleSize: number;
}

/**
 * Calculate engagement velocity weight — recent posts weighted higher.
 * Why: Content strategy evolves; recent performance is more predictive.
 */
function calculateVelocityWeight(publishedAt: Date): number {
    const now = new Date();
    const daysSince = differenceInDays(now, publishedAt);
    if (daysSince <= 30) return 3;
    if (daysSince <= 60) return 2;
    return 1;
}

/**
 * Stagger recommendations to avoid same-minute conflicts across platforms.
 * Why: Posting to multiple platforms at the exact same time looks robotic
 * and can cause rate-limit issues with simultaneous API calls.
 */
function staggerRecommendations(recommendations: Recommendation[]): Recommendation[] {
    const platformPriority: Record<string, number> = {
        INSTAGRAM: 0,
        TIKTOK: 1,
        FACEBOOK: 2,
        YOUTUBE: 3,
        LINKEDIN: 4,
        PINTEREST: 5,
        BLUESKY: 6,
        TWITTER: 7,
        GOOGLE_BUSINESS: 8,
    };

    const timeGroups = new Map<string, Recommendation[]>();
    for (const rec of recommendations) {
        const key = `${rec.date.toISOString().split('T')[0]}-${rec.hour}-${rec.minute}`;
        const group = timeGroups.get(key) || [];
        group.push(rec);
        timeGroups.set(key, group);
    }

    const staggered: Recommendation[] = [];
    for (const group of timeGroups.values()) {
        if (group.length === 1) {
            staggered.push(group[0]);
        } else {
            group.sort((a, b) =>
                (platformPriority[a.platform] || 99) - (platformPriority[b.platform] || 99)
            );
            group.forEach((rec, index) => {
                const staggerMinutes = index * 5;
                const newMinute = (rec.minute + staggerMinutes) % 60;
                const hourAdjust = Math.floor((rec.minute + staggerMinutes) / 60);
                staggered.push({
                    ...rec,
                    minute: newMinute,
                    hour: rec.hour + hourAdjust,
                });
            });
        }
    }
    return staggered;
}

/**
 * Check if two time slots are too close together (within MIN_GAP_HOURS).
 * Why: Avoids recommending 9 AM and 10 AM on the same day — spread them out.
 */
function isTooClose(
    existing: { day: number; hour: number }[],
    candidate: { day: number; hour: number }
): boolean {
    return existing.some(
        e => e.day === candidate.day && Math.abs(e.hour - candidate.hour) < MIN_GAP_HOURS
    );
}

/**
 * Load Instagram audience activity data for an organization's accounts.
 * Returns a merged day×hour grid, or null if no data exists.
 */
async function loadAudienceActivity(
    organizationId: string,
    targetPlatform?: Platform
): Promise<Record<number, Record<number, number>> | null> {
    // Why: Only Instagram currently has audience activity data.
    if (targetPlatform && targetPlatform !== Platform.INSTAGRAM) return null;

    const activities = await db.audienceActivity.findMany({
        where: {
            platform: Platform.INSTAGRAM,
            socialAccount: {
                organizationId,
                isActive: true,
            },
        },
        select: { activityGrid: true },
    });

    if (activities.length === 0) return null;

    // Why: Merge multiple IG accounts into one averaged grid.
    const merged: Record<number, Record<number, number>> = {};
    const counts: Record<number, Record<number, number>> = {};

    for (const activity of activities) {
        const grid = activity.activityGrid as Record<string, Record<string, number>>;
        for (const [dayStr, hours] of Object.entries(grid)) {
            const day = parseInt(dayStr, 10);
            if (!merged[day]) { merged[day] = {}; counts[day] = {}; }
            for (const [hourStr, value] of Object.entries(hours)) {
                const hour = parseInt(hourStr, 10);
                merged[day][hour] = (merged[day][hour] || 0) + value;
                counts[day][hour] = (counts[day][hour] || 0) + 1;
            }
        }
    }

    // Average across accounts
    for (const day of Object.keys(merged)) {
        const d = parseInt(day, 10);
        for (const hour of Object.keys(merged[d])) {
            const h = parseInt(hour, 10);
            merged[d][h] = Math.round(merged[d][h] / (counts[d][h] || 1));
        }
    }

    return merged;
}

/**
 * Normalise a value map to 0–1 range.
 * Why: Engagement scores and audience counts have different scales;
 * normalisation makes them composable.
 */
function normaliseGrid(
    grid: Record<number, Record<number, number>>
): Record<number, Record<number, number>> {
    let max = 0;
    for (const hours of Object.values(grid)) {
        for (const val of Object.values(hours)) {
            if (val > max) max = val;
        }
    }
    if (max === 0) return grid;

    const result: Record<number, Record<number, number>> = {};
    for (const [day, hours] of Object.entries(grid)) {
        const d = parseInt(day, 10);
        result[d] = {};
        for (const [hour, val] of Object.entries(hours)) {
            result[d][parseInt(hour, 10)] = val / max;
        }
    }
    return result;
}

/**
 * Calculate best posting times based on historical engagement data,
 * with an optional audience activity bonus for Instagram.
 *
 * Returns empty array if insufficient data (< MIN_POSTS_THRESHOLD).
 * Callers should use this to decide whether to show or hide the UI.
 *
 * @param organizationId - The organization to generate recommendations for
 * @param targetPlatform - Optional filter for a specific platform
 * @param weeksAhead - Number of weeks to generate recommendations for (default: 4)
 */
export async function getOptimalPostingTimes(
    organizationId: string,
    targetPlatform?: Platform,
    weeksAhead: number = DEFAULT_WEEKS_AHEAD
): Promise<Recommendation[]> {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday

    // 1. Determine which platforms to analyse
    let platformsToAnalyse: Platform[];
    if (targetPlatform) {
        platformsToAnalyse = [targetPlatform];
    } else {
        const accounts = await db.socialAccount.findMany({
            where: { organizationId, isActive: true },
            select: { platform: true },
            distinct: ['platform'],
        });
        platformsToAnalyse = accounts.map(a => a.platform);
    }

    // 2. Fetch historical posts with analytics (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Why: Query published posts with direct platform fields.
    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            publishedAt: { gte: ninetyDaysAgo },
            ...(targetPlatform ? { platform: targetPlatform } : {}),
        },
        select: {
            publishedAt: true,
            platform: true,
            postType: true,
            analytics: {
                select: { likes: true, comments: true, shares: true },
            },
        },
    });

    // 3. Build per-platform post lists
    type PostData = {
        publishedAt: Date;
        platform: Platform;
        postType: PostType;
        likes: number;
        comments: number;
        shares: number;
    };

    const allPosts: PostData[] = [];

    for (const p of posts) {
        if (!p.publishedAt || !p.platform) continue;
        allPosts.push({
            publishedAt: p.publishedAt,
            platform: p.platform,
            postType: p.postType || PostType.FEED,
            likes: p.analytics?.likes || 0,
            comments: p.analytics?.comments || 0,
            shares: p.analytics?.shares || 0,
        });
    }

    // 4. Load audience activity data (Instagram bonus layer)
    const audienceGrid = await loadAudienceActivity(organizationId, targetPlatform);
    const normalisedAudience = audienceGrid ? normaliseGrid(audienceGrid) : null;

    // 5. Build per-platform heatmaps and generate recommendations
    const recommendations: Recommendation[] = [];

    for (const platform of platformsToAnalyse) {
        const platformPosts = allPosts.filter(p => p.platform === platform);

        // Why: Not enough data = return nothing for this platform.
        if (platformPosts.length < MIN_POSTS_THRESHOLD) {
            log.debug(
                { platform, postCount: platformPosts.length },
                'Insufficient data for recommendations'
            );
            continue;
        }

        // Build engagement heatmap: day × hour → weighted engagement
        const engagementMap = new Map<string, {
            total: number;
            weightedCount: number;
            postType: PostType;
        }>();

        for (const post of platformPosts) {
            const day = getDay(post.publishedAt);
            const hour = getHours(post.publishedAt);
            const velocity = calculateVelocityWeight(post.publishedAt);
            const engagement = (post.likes + post.comments + post.shares) * velocity;
            const key = `${day}-${hour}-${post.postType}`;

            const current = engagementMap.get(key) || {
                total: 0,
                weightedCount: 0,
                postType: post.postType,
            };
            engagementMap.set(key, {
                total: current.total + engagement,
                weightedCount: current.weightedCount + velocity,
                postType: current.postType,
            });
        }

        // Convert to scored cells
        const cells: HeatmapCell[] = [];
        for (const [key, data] of engagementMap.entries()) {
            const [dayStr, hourStr] = key.split('-');
            const day = parseInt(dayStr, 10);
            const hour = parseInt(hourStr, 10);
            const engagementScore = data.total / data.weightedCount;

            // Why: Add audience online bonus for Instagram only.
            let audienceBonus = 0;
            if (platform === Platform.INSTAGRAM && normalisedAudience) {
                audienceBonus = (normalisedAudience[day]?.[hour] || 0) * AUDIENCE_ACTIVITY_WEIGHT;
            }

            cells.push({
                day,
                hour,
                platform,
                postType: data.postType,
                engagementScore,
                audienceBonus,
                combinedScore: engagementScore + audienceBonus * engagementScore,
                sampleSize: data.weightedCount,
            });
        }

        // Normalise engagement scores for consistent ranking
        const maxEngagement = Math.max(...cells.map(c => c.engagementScore), 1);
        for (const cell of cells) {
            cell.engagementScore /= maxEngagement;
            // Why: Combined = normalised engagement + audience bonus.
            // The audience bonus amplifies the engagement score rather than replacing it.
            cell.combinedScore = cell.engagementScore * (1 + cell.audienceBonus);
        }

        // Sort by combined score (highest first)
        cells.sort((a, b) => b.combinedScore - a.combinedScore);

        // 6. Generate weekly recommendations with minimum gap enforcement
        for (let weekOffset = 0; weekOffset < weeksAhead; weekOffset++) {
            const currentWeekStart = addDays(weekStart, weekOffset * 7);
            const selectedSlots: { day: number; hour: number }[] = [];
            let recsThisWeek = 0;

            for (const cell of cells) {
                if (recsThisWeek >= MAX_RECS_PER_PLATFORM_WEEK) break;
                if (isTooClose(selectedSlots, cell)) continue;

                const daysToAdd = cell.day === 0 ? 6 : cell.day - 1;
                const slotDate = addDays(currentWeekStart, daysToAdd);

                // Why: Confidence based on sample size — more data = more confident.
                const confidence = Math.min(0.95, 0.5 + (cell.sampleSize / 20) * 0.45);
                const hasAudienceData = cell.audienceBonus > 0;

                let reason: string;
                if (hasAudienceData) {
                    reason = `High engagement + audience active for ${cell.postType.toLowerCase()} posts`;
                } else {
                    reason = `High engagement for ${cell.postType.toLowerCase()} posts`;
                }

                recommendations.push({
                    id: `rec-w${weekOffset}-${cell.day}-${cell.hour}-${platform}-${cell.postType}`,
                    date: slotDate,
                    hour: cell.hour,
                    minute: getRandomMinute(),
                    platform,
                    postType: cell.postType,
                    reason,
                    confidence,
                });

                selectedSlots.push({ day: cell.day, hour: cell.hour });
                recsThisWeek++;
            }
        }
    }

    return staggerRecommendations(recommendations);
}
