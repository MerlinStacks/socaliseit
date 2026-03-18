/**
 * Smart Scheduling Engine — Orchestrator
 *
 * Why this architecture:
 * - Generic industry benchmarks = everyone posts at the same time = noise.
 * - Real engagement data from YOUR posts on YOUR audience is ground truth.
 * - Multiple signals (audience activity, competitor timing, hashtag perf,
 *   follower growth, timezone overlap) are composed into one ranked score.
 * - Redis caching avoids recomputing on every calendar load (6h TTL).
 *
 * Data flow: loadAllSignals() → buildScoredHeatmap() → recommendations
 */

import { db } from '@/lib/db';
import { startOfWeek, addDays } from 'date-fns';
import { logger } from '@/lib/logger';
import type { Recommendation } from './smart-scheduling-types';
import {
    Platform, PostType,
    MIN_POSTS_THRESHOLD, DEFAULT_WEEKS_AHEAD,
    MAX_RECS_PER_PLATFORM_WEEK, MIN_GAP_HOURS,
} from './smart-scheduling-types';
import { loadAllSignals } from './smart-scheduling-signals';
import { buildScoredHeatmap, generateNaturalMinute, buildReasonString } from './smart-scheduling-scoring';

const log = logger.child({ service: 'smart-scheduling' });

/** Redis cache TTL — matches the 6h analytics sync interval. */
const CACHE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Calculate optimal posting times for an organization.
 * Returns empty array if insufficient data (< MIN_POSTS_THRESHOLD).
 *
 * @param organizationId - The org to generate recommendations for
 * @param targetPlatform - Optional filter for a specific platform
 * @param weeksAhead - Weeks to generate ahead (default: 4)
 */
export async function getOptimalPostingTimes(
    organizationId: string,
    targetPlatform?: Platform,
    weeksAhead: number = DEFAULT_WEEKS_AHEAD
): Promise<Recommendation[]> {
    // Why: Try Redis cache first to avoid expensive DB queries on every calendar load
    const cacheKey = `scheduling:recs:${organizationId}:${targetPlatform || 'all'}`;
    const cached = await readCache(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });

    // 1. Determine which platforms to analyse
    const platformsToAnalyse = await resolvePlatforms(organizationId, targetPlatform);

    // 2. Load all signals in parallel
    const signals = await loadAllSignals(organizationId, targetPlatform);

    // 3. Build recommendations per platform
    const recommendations: Recommendation[] = [];

    for (const platform of platformsToAnalyse) {
        const platformPosts = signals.posts.filter(p => p.platform === platform);

        if (platformPosts.length < MIN_POSTS_THRESHOLD) {
            log.debug(
                { platform, postCount: platformPosts.length },
                'Insufficient data for recommendations'
            );
            continue;
        }

        // 4. Build scored heatmap with all signal bonuses
        const cells = buildScoredHeatmap(platformPosts, platform, signals);

        // 5. Generate weekly recommendations with gap enforcement
        for (let weekOffset = 0; weekOffset < weeksAhead; weekOffset++) {
            const currentWeekStart = addDays(weekStart, weekOffset * 7);
            const selectedSlots: { day: number; hour: number }[] = [];
            let recsThisWeek = 0;

            for (const cell of cells) {
                if (recsThisWeek >= MAX_RECS_PER_PLATFORM_WEEK) break;
                if (isTooClose(selectedSlots, cell)) continue;

                const daysToAdd = cell.day === 0 ? 6 : cell.day - 1;
                const slotDate = addDays(currentWeekStart, daysToAdd);

                // Why: Confidence based on sample size — more data = more confident
                const confidence = Math.min(0.95, 0.5 + (cell.sampleSize / 20) * 0.45);

                recommendations.push({
                    id: `rec-w${weekOffset}-${cell.day}-${cell.hour}-${platform}-${cell.postType}`,
                    date: slotDate,
                    hour: cell.hour,
                    minute: generateNaturalMinute(),
                    platform,
                    postType: cell.postType,
                    reason: buildReasonString(cell),
                    confidence,
                });

                selectedSlots.push({ day: cell.day, hour: cell.hour });
                recsThisWeek++;
            }
        }
    }

    const final = staggerRecommendations(recommendations);

    // Why: Cache for 6h so the next calendar load is instant
    await writeCache(cacheKey, final, CACHE_TTL_SECONDS);

    return final;
}

// Re-export types consumed by the API route and hooks
export type { Recommendation, PostType };

// ============================================================================
// Internal Helpers
// ============================================================================

/** Resolve which platforms to analyse based on connected accounts. */
async function resolvePlatforms(
    organizationId: string,
    targetPlatform?: Platform
): Promise<Platform[]> {
    if (targetPlatform) return [targetPlatform];

    const accounts = await db.socialAccount.findMany({
        where: { organizationId, isActive: true },
        select: { platform: true },
        distinct: ['platform'],
    });
    return accounts.map(a => a.platform);
}

/** Check if a candidate slot is too close to existing selections. */
function isTooClose(
    existing: { day: number; hour: number }[],
    candidate: { day: number; hour: number }
): boolean {
    return existing.some(
        e => e.day === candidate.day && Math.abs(e.hour - candidate.hour) < MIN_GAP_HOURS
    );
}

/**
 * Stagger cross-platform recommendations to avoid same-minute conflicts.
 * Why: Posting to multiple platforms at the exact same time looks robotic
 * and can cause rate-limit issues with simultaneous API calls.
 */
function staggerRecommendations(recommendations: Recommendation[]): Recommendation[] {
    const platformPriority: Record<string, number> = {
        INSTAGRAM: 0, TIKTOK: 1, FACEBOOK: 2, YOUTUBE: 3,
        LINKEDIN: 4, PINTEREST: 5, BLUESKY: 6, THREADS: 7,
        GOOGLE_BUSINESS: 8,
    };

    const timeGroups = new Map<string, Recommendation[]>();
    for (const rec of recommendations) {
        const key = `${rec.date.toISOString().split('T')[0]}-${rec.hour}`;
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
                // Why: Stagger by 5 min but keep minutes natural-looking
                const offset = index * 7; // 7-minute stagger instead of 5
                const newMinute = (rec.minute + offset) % 60;
                const hourAdjust = Math.floor((rec.minute + offset) / 60);
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

// ============================================================================
// Redis Cache Layer
// ============================================================================

/**
 * Read cached recommendations from Redis.
 * Why: Gracefully returns null on any error so the engine always falls
 * back to computing fresh data — cache is performance-only.
 */
async function readCache(key: string): Promise<Recommendation[] | null> {
    try {
        const { getRedisConnection } = await import('@/lib/bullmq/connection');
        const redis = getRedisConnection();
        const raw = await redis.get(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Recommendation[];
        // Why: Restore Date objects that were serialised to strings
        return parsed.map(r => ({ ...r, date: new Date(r.date) }));
    } catch {
        return null;
    }
}

/** Write recommendations to Redis cache with TTL. */
async function writeCache(
    key: string,
    data: Recommendation[],
    ttlSeconds: number
): Promise<void> {
    try {
        const { getRedisConnection } = await import('@/lib/bullmq/connection');
        const redis = getRedisConnection();
        await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    } catch {
        // Why: Cache write failure is non-critical — silently ignore
    }
}
