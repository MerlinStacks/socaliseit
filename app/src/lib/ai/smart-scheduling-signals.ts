/**
 * Smart Scheduling — Signal Loaders
 *
 * Why: Each function loads one data signal used by the scoring engine.
 * Separated from scoring so data I/O is testable independently.
 * All functions return normalised grids or null (insufficient data).
 */

import { db } from '@/lib/db';
import { Platform, PostType } from '@/generated/prisma/enums';
import { getDay, getHours } from 'date-fns';
import { logger } from '@/lib/logger';
import type { PostData, NormalisedGrid, SignalData } from './smart-scheduling-types';

const log = logger.child({ service: 'smart-scheduling-signals' });

/** How far back to look for historical post data. */
const LOOKBACK_DAYS = 90;

/**
 * Load all signals in parallel for a given organization.
 * Why: Parallel loading cuts total latency to the slowest query
 * instead of summing them sequentially.
 */
export async function loadAllSignals(
    organizationId: string,
    targetPlatform?: Platform
): Promise<SignalData> {
    const [posts, audienceGrid, competitorDensity, hashtagCorrelation, followerGrowth, timezoneWeights] =
        await Promise.all([
            loadHistoricalPosts(organizationId, targetPlatform),
            loadAudienceActivity(organizationId, targetPlatform),
            loadCompetitorTimingDensity(organizationId, targetPlatform),
            loadHashtagTimeCorrelation(organizationId, targetPlatform),
            loadFollowerGrowthCorrelation(organizationId, targetPlatform),
            loadAudienceTimezoneWeights(organizationId, targetPlatform),
        ]);

    return { posts, audienceGrid, competitorDensity, hashtagCorrelation, followerGrowth, timezoneWeights };
}

/**
 * Load published posts with full PostAnalytics for the scoring engine.
 * Why: The old engine only fetched likes/comments/shares. We now pull
 * every metric the scoring engine needs in one query.
 */
export async function loadHistoricalPosts(
    organizationId: string,
    targetPlatform?: Platform
): Promise<PostData[]> {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            publishedAt: { gte: cutoff },
            ...(targetPlatform ? { platform: targetPlatform } : {}),
        },
        select: {
            publishedAt: true,
            platform: true,
            postType: true,
            analytics: {
                select: {
                    likes: true, comments: true, shares: true, saves: true,
                    reach: true, impressions: true, engagementRate: true,
                    videoViews: true, avgWatchPercentage: true, clicks: true,
                },
            },
        },
    });

    return posts
        .filter(p => p.publishedAt && p.platform)
        .map(p => ({
            publishedAt: p.publishedAt!,
            platform: p.platform!,
            postType: p.postType || PostType.FEED,
            likes: p.analytics?.likes || 0,
            comments: p.analytics?.comments || 0,
            shares: p.analytics?.shares || 0,
            saves: p.analytics?.saves || 0,
            reach: p.analytics?.reach || 0,
            impressions: p.analytics?.impressions || 0,
            engagementRate: p.analytics?.engagementRate || 0,
            videoViews: p.analytics?.videoViews || 0,
            avgWatchPercentage: p.analytics?.avgWatchPercentage || 0,
            clicks: p.analytics?.clicks || 0,
        }));
}

/**
 * Load Instagram audience online-hours grid.
 * Why: Only Instagram exposes this via the `online_followers` API.
 * Returns null for non-IG platforms or when no data exists.
 */
export async function loadAudienceActivity(
    organizationId: string,
    targetPlatform?: Platform
): Promise<NormalisedGrid | null> {
    if (targetPlatform && targetPlatform !== Platform.INSTAGRAM) return null;

    const activities = await db.audienceActivity.findMany({
        where: {
            platform: Platform.INSTAGRAM,
            socialAccount: { organizationId, isActive: true },
        },
        select: { activityGrid: true },
    });

    if (activities.length === 0) return null;

    // Why: Merge multiple IG accounts into one averaged grid
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

    for (const day of Object.keys(merged)) {
        const d = parseInt(day, 10);
        for (const hour of Object.keys(merged[d])) {
            const h = parseInt(hour, 10);
            merged[d][h] = Math.round(merged[d][h] / (counts[d][h] || 1));
        }
    }

    return normaliseGrid(merged);
}

/**
 * Build competitor posting density grid.
 * Why: If competitors flood a time slot, we want to slightly avoid it
 * so the user's content has less feed competition.
 */
export async function loadCompetitorTimingDensity(
    organizationId: string,
    targetPlatform?: Platform
): Promise<NormalisedGrid | null> {
    try {
        const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

        const competitorPosts = await db.competitorPost.findMany({
            where: {
                competitor: {
                    organizationId,
                    ...(targetPlatform ? { platform: targetPlatform } : {}),
                },
                postedAt: { gte: cutoff },
            },
            select: { postedAt: true },
        });

        if (competitorPosts.length < 5) return null;

        const grid: Record<number, Record<number, number>> = {};
        for (const post of competitorPosts) {
            const day = getDay(post.postedAt);
            const hour = getHours(post.postedAt);
            if (!grid[day]) grid[day] = {};
            grid[day][hour] = (grid[day][hour] || 0) + 1;
        }

        return normaliseGrid(grid);
    } catch (err) {
        log.warn({ error: String(err) }, 'Failed to load competitor timing density');
        return null;
    }
}

/**
 * Cross-reference hashtag engagement with posting hour.
 * Why: Some hashtags perform better at specific times (e.g. #MondayMotivation
 * at 7am vs 3pm). This signal captures time-sensitive content patterns.
 */
export async function loadHashtagTimeCorrelation(
    organizationId: string,
    targetPlatform?: Platform
): Promise<NormalisedGrid | null> {
    try {
        const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

        const postsWithHashtags = await db.post.findMany({
            where: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: cutoff },
                ...(targetPlatform ? { platform: targetPlatform } : {}),
                hashtags: { some: {} },
            },
            select: {
                publishedAt: true,
                analytics: { select: { engagementRate: true } },
            },
        });

        if (postsWithHashtags.length < 5) return null;

        // Why: Group engagement rate by day×hour for posts that used hashtags
        const grid: Record<number, Record<number, { total: number; count: number }>> = {};
        for (const post of postsWithHashtags) {
            if (!post.publishedAt) continue;
            const day = getDay(post.publishedAt);
            const hour = getHours(post.publishedAt);
            if (!grid[day]) grid[day] = {};
            const cell = grid[day][hour] || { total: 0, count: 0 };
            cell.total += post.analytics?.engagementRate || 0;
            cell.count++;
            grid[day][hour] = cell;
        }

        const averaged: Record<number, Record<number, number>> = {};
        for (const [day, hours] of Object.entries(grid)) {
            const d = parseInt(day, 10);
            averaged[d] = {};
            for (const [hour, data] of Object.entries(hours)) {
                averaged[d][parseInt(hour, 10)] = data.count > 0 ? data.total / data.count : 0;
            }
        }

        return normaliseGrid(averaged);
    } catch (err) {
        log.warn({ error: String(err) }, 'Failed to load hashtag-time correlation');
        return null;
    }
}

// Continued in next part — kept under 200 lines by splitting remaining
// functions into the scoring module where they're consumed.

/**
 * Correlate follower growth spikes with posting times.
 * Why: Days with large follower gains likely had impactful content —
 * the hour that content was posted becomes a weighted signal.
 */
export async function loadFollowerGrowthCorrelation(
    organizationId: string,
    targetPlatform?: Platform
): Promise<NormalisedGrid | null> {
    try {
        const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

        // Why: Find days with positive follower changes
        const growthDays = await db.platformAnalytics.findMany({
            where: {
                organizationId,
                date: { gte: cutoff },
                followersChange: { gt: 0 },
                socialAccount: targetPlatform ? { platform: targetPlatform } : undefined,
            },
            select: { date: true, followersChange: true },
        });

        if (growthDays.length < 3) return null;

        // Why: Find what hours posts were published on those high-growth days
        const growthDates = growthDays.map(g => g.date);
        const growthMap = new Map(growthDays.map(g => [g.date.toISOString().split('T')[0], g.followersChange]));

        const postsOnGrowthDays = await db.post.findMany({
            where: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: cutoff },
                ...(targetPlatform ? { platform: targetPlatform } : {}),
            },
            select: { publishedAt: true },
        });

        const grid: Record<number, Record<number, number>> = {};
        for (const post of postsOnGrowthDays) {
            if (!post.publishedAt) continue;
            const dateKey = post.publishedAt.toISOString().split('T')[0];
            const growth = growthMap.get(dateKey);
            if (!growth) continue;

            const day = getDay(post.publishedAt);
            const hour = getHours(post.publishedAt);
            if (!grid[day]) grid[day] = {};
            grid[day][hour] = (grid[day][hour] || 0) + growth;
        }

        return Object.keys(grid).length > 0 ? normaliseGrid(grid) : null;
    } catch (err) {
        log.warn({ error: String(err) }, 'Failed to load follower growth correlation');
        return null;
    }
}

/**
 * Estimate audience timezone distribution from demographics data.
 * Why: If 40% of audience is EST and 30% PST, we weight hours that
 * overlap both audiences' peak times (typically 8-10am and 6-9pm local).
 *
 * Returns a simple hour→weight map (0-1) rather than a day×hour grid,
 * since timezone weighting applies uniformly across days of the week.
 */
export async function loadAudienceTimezoneWeights(
    organizationId: string,
    targetPlatform?: Platform
): Promise<Record<number, number> | null> {
    try {
        const platformEnum = targetPlatform || undefined;

        const rows = await db.platformAnalytics.findMany({
            where: {
                organizationId,
                socialAccount: platformEnum ? { platform: platformEnum } : undefined,
            },
            orderBy: { date: 'desc' },
            distinct: ['socialAccountId'],
            select: { platformMetrics: true },
        });

        // Why: Extract top countries/cities from the platformMetrics JSON
        interface DemoJson {
            audienceDemographics?: {
                topCountries?: Array<{ country: string; percentage: number }>;
            };
        }

        const countryWeights = new Map<string, number>();
        for (const row of rows) {
            const metrics = row.platformMetrics as DemoJson | null;
            const countries = metrics?.audienceDemographics?.topCountries;
            if (!countries) continue;
            for (const c of countries) {
                countryWeights.set(c.country, (countryWeights.get(c.country) || 0) + c.percentage);
            }
        }

        if (countryWeights.size === 0) return null;

        // Why: Map countries to rough UTC offsets for peak-hour estimation.
        // This is intentionally approximate — precise per-city TZ data would
        // require a geocoding API which isn't worth the complexity.
        const hourWeights: Record<number, number> = {};
        for (let h = 0; h < 24; h++) hourWeights[h] = 0;

        for (const [country, weight] of countryWeights) {
            const offsets = estimateCountryOffsets(country);
            for (const offset of offsets) {
                // Why: Peak social media hours are 7-9am and 6-9pm local time.
                // We add the country weight to those UTC hours.
                for (const localPeak of [7, 8, 9, 12, 13, 18, 19, 20, 21]) {
                    const utcHour = ((localPeak - offset) + 24) % 24;
                    hourWeights[utcHour] += weight;
                }
            }
        }

        // Normalise to 0-1
        const max = Math.max(...Object.values(hourWeights), 1);
        for (const h of Object.keys(hourWeights)) {
            hourWeights[parseInt(h, 10)] /= max;
        }

        return hourWeights;
    } catch (err) {
        log.warn({ error: String(err) }, 'Failed to load audience timezone weights');
        return null;
    }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalise a day×hour value grid to 0-1 range.
 * Why: Different signals have different scales; normalisation makes
 * them composable in the scoring engine.
 */
export function normaliseGrid(
    grid: Record<number, Record<number, number>>
): NormalisedGrid {
    let max = 0;
    for (const hours of Object.values(grid)) {
        for (const val of Object.values(hours)) {
            if (val > max) max = val;
        }
    }
    if (max === 0) return grid;

    const result: NormalisedGrid = {};
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
 * Rough UTC offset estimates for common countries.
 * Why: Avoids a timezone database dependency. Covers the top 20
 * countries by social media usage. Returns array to handle
 * countries spanning multiple zones (e.g. US, Australia).
 */
function estimateCountryOffsets(country: string): number[] {
    const upper = country.toUpperCase();
    const map: Record<string, number[]> = {
        'US': [-5, -6, -7, -8], 'UNITED STATES': [-5, -6, -7, -8],
        'UK': [0], 'UNITED KINGDOM': [0], 'GB': [0],
        'CA': [-5, -6, -7, -8], 'CANADA': [-5, -6, -7, -8],
        'AU': [10, 11], 'AUSTRALIA': [10, 11],
        'IN': [5], 'INDIA': [5],
        'DE': [1], 'GERMANY': [1],
        'FR': [1], 'FRANCE': [1],
        'BR': [-3], 'BRAZIL': [-3],
        'MX': [-6], 'MEXICO': [-6],
        'JP': [9], 'JAPAN': [9],
        'KR': [9], 'SOUTH KOREA': [9],
        'ID': [7], 'INDONESIA': [7],
        'TR': [3], 'TURKEY': [3], 'TÜRKIYE': [3],
        'IT': [1], 'ITALY': [1],
        'ES': [1], 'SPAIN': [1],
        'NL': [1], 'NETHERLANDS': [1],
        'PH': [8], 'PHILIPPINES': [8],
        'TH': [7], 'THAILAND': [7],
        'NG': [1], 'NIGERIA': [1],
        'EG': [2], 'EGYPT': [2],
        'SA': [3], 'SAUDI ARABIA': [3],
        'AE': [4], 'UNITED ARAB EMIRATES': [4],
        'SG': [8], 'SINGAPORE': [8],
        'NZ': [12], 'NEW ZEALAND': [12],
        'ZA': [2], 'SOUTH AFRICA': [2],
        'AR': [-3], 'ARGENTINA': [-3],
        'CL': [-4], 'CHILE': [-4],
        'CO': [-5], 'COLOMBIA': [-5],
        'PL': [1], 'POLAND': [1],
        'SE': [1], 'SWEDEN': [1],
        'PT': [0], 'PORTUGAL': [0],
    };
    return map[upper] || [0]; // Default to UTC for unknown countries
}
