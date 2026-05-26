/**
 * Analytics Data — Extended Queries
 *
 * Why: Extracted from analytics-data.ts to keep each module within
 * the 200-line limit. Contains demographics, hashtag performance,
 * and period comparison queries.
 */

import { db } from '@/lib/db';
import { format } from 'date-fns';
import { Platform } from '@/generated/prisma/client';
import { logger } from '@/lib/logger';
import { calculateDateRange, calcChange } from './analytics-data';

// ============================================================================
// PLATFORM METRICS JSON TYPING
// ============================================================================

/**
 * Why: The PlatformAnalytics.platformMetrics field is a Prisma Json type.
 * This interface provides type-safe access instead of casting to `any`.
 */
export interface PlatformMetricsJson {
    audienceDemographics?: {
        ageGender?: Array<{ age: string; gender: 'male' | 'female' | 'other'; percentage: number }>;
        topCountries?: Array<{ country: string; percentage: number }>;
        topCities?: Array<{ city: string; percentage: number }>;
    };
    [key: string]: unknown;
}

// ============================================================================
// AUDIENCE DEMOGRAPHICS
// ============================================================================

export interface AgeGenderEntry {
    age: string;
    male: number;
    female: number;
    other: number;
}

export interface LocationEntry {
    name: string;
    percentage: number;
}

export interface AudienceDemographicsData {
    ageGender: AgeGenderEntry[];
    topCountries: LocationEntry[];
    topCities: LocationEntry[];
}

/**
 * Parse audience demographics from the platformMetrics JSON on PlatformAnalytics.
 * Why: Instagram/Facebook APIs return audience breakdowns that we sync into the
 * platformMetrics JSON field but never surfaced until now.
 */
export async function fetchAudienceDemographics(
    organizationId: string,
    platformFilter: string | undefined
): Promise<AudienceDemographicsData> {
    try {
        const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;

        const rows = await db.platformAnalytics.findMany({
            where: {
                organizationId,
                socialAccount: platformEnum ? { platform: platformEnum } : undefined,
            },
            orderBy: { date: 'desc' },
            distinct: ['socialAccountId'],
            select: { platformMetrics: true },
        });

        const ageMap = new Map<string, { male: number; female: number; other: number }>();
        const countryMap = new Map<string, number>();
        const cityMap = new Map<string, number>();

        for (const row of rows) {
            const metrics = row.platformMetrics as PlatformMetricsJson | null;
            if (!metrics) continue;
            const demo = metrics.audienceDemographics;
            if (!demo) continue;

            if (Array.isArray(demo.ageGender)) {
                for (const entry of demo.ageGender) {
                    const existing = ageMap.get(entry.age) || { male: 0, female: 0, other: 0 };
                    const key = entry.gender === 'male' ? 'male' : entry.gender === 'female' ? 'female' : 'other';
                    existing[key] += entry.percentage || 0;
                    ageMap.set(entry.age, existing);
                }
            }

            if (Array.isArray(demo.topCountries)) {
                for (const c of demo.topCountries) {
                    countryMap.set(c.country, (countryMap.get(c.country) || 0) + c.percentage);
                }
            }

            if (Array.isArray(demo.topCities)) {
                for (const c of demo.topCities) {
                    cityMap.set(c.city, (cityMap.get(c.city) || 0) + c.percentage);
                }
            }
        }

        return {
            ageGender: Array.from(ageMap.entries())
                .map(([age, vals]) => ({ age, ...vals }))
                .sort((a, b) => a.age.localeCompare(b.age)),
            topCountries: Array.from(countryMap.entries())
                .map(([name, percentage]) => ({ name, percentage }))
                .sort((a, b) => b.percentage - a.percentage)
                .slice(0, 10),
            topCities: Array.from(cityMap.entries())
                .map(([name, percentage]) => ({ name, percentage }))
                .sort((a, b) => b.percentage - a.percentage)
                .slice(0, 10),
        };
    } catch (err) {
        logger.error({ error: String(err) }, 'fetchAudienceDemographics failed');
        return { ageGender: [], topCountries: [], topCities: [] };
    }
}

// ============================================================================
// HASHTAG PERFORMANCE
// ============================================================================

export interface HashtagPerformanceEntry {
    tag: string;
    usageCount: number;
    avgEngagementRate: number;
    totalReach: number;
    totalLikes: number;
}

/**
 * Rank hashtags by engagement across published posts.
 * Why: First tries PostHashtag join. If empty, falls back to extracting
 * hashtags from post captions (regex) so the section is never blank.
 */
export async function fetchHashtagPerformance(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<HashtagPerformanceEntry[]> {
    try {
        const { start, end } = calculateDateRange(range);
        const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;

        const postHashtags = await db.postHashtag.findMany({
            where: {
                post: {
                    organizationId,
                    status: 'PUBLISHED',
                    publishedAt: { gte: start, lte: end },
                    platform: platformEnum || undefined,
                },
            },
            include: {
                hashtag: { select: { tag: true } },
                post: {
                    select: {
                        analytics: {
                            select: { engagementRate: true, reach: true, likes: true },
                        },
                    },
                },
            },
        });

        if (postHashtags.length > 0) {
            return aggregateHashtagData(postHashtags);
        }

        return await fallbackHashtagSearch(organizationId, platformEnum, start, end);
    } catch (err) {
        logger.error({ error: String(err) }, 'fetchHashtagPerformance failed');
        return [];
    }
}

/** Why: Extracted to reduce function length */
function aggregateHashtagData(postHashtags: Array<{
    hashtag: { tag: string };
    post: { analytics: { engagementRate: number | null; reach: number | null; likes: number | null } | null };
}>): HashtagPerformanceEntry[] {
    const map = new Map<string, { count: number; totalRate: number; totalReach: number; totalLikes: number }>();

    for (const ph of postHashtags) {
        const tag = ph.hashtag.tag;
        const analytics = ph.post.analytics;
        const entry = map.get(tag) || { count: 0, totalRate: 0, totalReach: 0, totalLikes: 0 };
        entry.count++;
        if (analytics) {
            entry.totalRate += analytics.engagementRate || 0;
            entry.totalReach += analytics.reach || 0;
            entry.totalLikes += analytics.likes || 0;
        }
        map.set(tag, entry);
    }

    return Array.from(map.entries())
        .map(([tag, data]) => ({
            tag: `#${tag}`,
            usageCount: data.count,
            avgEngagementRate: data.count > 0 ? data.totalRate / data.count : 0,
            totalReach: data.totalReach,
            totalLikes: data.totalLikes,
        }))
        .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
        .slice(0, 20);
}

/** Why: Fallback when PostHashtag table is empty — extract from captions */
async function fallbackHashtagSearch(
    organizationId: string,
    platformEnum: Platform | undefined,
    start: Date,
    end: Date
): Promise<HashtagPerformanceEntry[]> {
    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            publishedAt: { gte: start, lte: end },
            platform: platformEnum || undefined,
            NOT: { caption: '' },
        },
        include: {
            analytics: { select: { engagementRate: true, reach: true, likes: true } },
        },
    });

    const map = new Map<string, { count: number; totalRate: number; totalReach: number; totalLikes: number }>();

    for (const post of posts) {
        const tags = (post.caption || '').match(/#[\w\u00C0-\u024F]+/g);
        if (!tags) continue;

        const analytics = post.analytics;
        const uniqueTags = new Set(tags.map((t: string) => t.slice(1).toLowerCase()));
        for (const tag of uniqueTags) {
            const entry = map.get(tag) || { count: 0, totalRate: 0, totalReach: 0, totalLikes: 0 };
            entry.count++;
            if (analytics) {
                entry.totalRate += analytics.engagementRate || 0;
                entry.totalReach += analytics.reach || 0;
                entry.totalLikes += analytics.likes || 0;
            }
            map.set(tag, entry);
        }
    }

    return Array.from(map.entries())
        .map(([tag, data]) => ({
            tag: `#${tag}`,
            usageCount: data.count,
            avgEngagementRate: data.count > 0 ? data.totalRate / data.count : 0,
            totalReach: data.totalReach,
            totalLikes: data.totalLikes,
        }))
        .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
        .slice(0, 20);
}

// ============================================================================
// PERIOD COMPARISON
// ============================================================================

export interface PeriodComparisonData {
    current: PeriodMetrics;
    previous: PeriodMetrics;
}

export interface PeriodMetrics {
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    impressions: number;
    engagementRate: number;
    posts: number;
}

/**
 * Fetch absolute values for current and previous period for side-by-side comparison.
 * Why: Reads from DailyAnalyticsSnapshot — fast pre-aggregated data instead
 * of summing PostAnalytics with complex OR clauses at query time.
 */
export async function fetchPeriodComparison(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<PeriodComparisonData> {
    const EMPTY_PERIOD = { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagementRate: 0, posts: 0 };
    try {
        const { start, end, prevStart } = calculateDateRange(range);
        const prevEnd = start;
        const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;

        const snapshotWhere = (s: Date, e: Date) => ({
            organizationId,
            date: { gte: s, lte: e },
            ...(platformEnum ? { platform: platformEnum } : {}),
        });

        const [currentAgg, prevAgg] = await Promise.all([
            db.dailyAnalyticsSnapshot.aggregate({
                _sum: { likes: true, comments: true, shares: true, reach: true, impressions: true, postsPublished: true },
                _avg: { engagementRate: true },
                where: snapshotWhere(start, end),
            }),
            db.dailyAnalyticsSnapshot.aggregate({
                _sum: { likes: true, comments: true, shares: true, reach: true, impressions: true, postsPublished: true },
                _avg: { engagementRate: true },
                where: snapshotWhere(prevStart, prevEnd),
            }),
        ]);

        const hasSnapshotData =
            (currentAgg._sum.postsPublished || 0) > 0 ||
            (prevAgg._sum.postsPublished || 0) > 0 ||
            (currentAgg._sum.likes || 0) > 0 ||
            (prevAgg._sum.likes || 0) > 0 ||
            (currentAgg._sum.reach || 0) > 0 ||
            (prevAgg._sum.reach || 0) > 0;

        if (!hasSnapshotData) {
            const [current, previous] = await Promise.all([
                fetchPeriodMetricsFromPosts(organizationId, platformEnum, start, end),
                fetchPeriodMetricsFromPosts(organizationId, platformEnum, prevStart, prevEnd),
            ]);

            return { current, previous };
        }

        return {
            current: {
                likes: currentAgg._sum.likes || 0,
                comments: currentAgg._sum.comments || 0,
                shares: currentAgg._sum.shares || 0,
                reach: currentAgg._sum.reach || 0,
                impressions: currentAgg._sum.impressions || 0,
                engagementRate: currentAgg._avg.engagementRate || 0,
                posts: currentAgg._sum.postsPublished || 0,
            },
            previous: {
                likes: prevAgg._sum.likes || 0,
                comments: prevAgg._sum.comments || 0,
                shares: prevAgg._sum.shares || 0,
                reach: prevAgg._sum.reach || 0,
                impressions: prevAgg._sum.impressions || 0,
                engagementRate: prevAgg._avg.engagementRate || 0,
                posts: prevAgg._sum.postsPublished || 0,
            },
        };
    } catch (err) {
        logger.error({ error: String(err) }, 'fetchPeriodComparison failed');
        return { current: EMPTY_PERIOD, previous: EMPTY_PERIOD };
    }
}

async function fetchPeriodMetricsFromPosts(
    organizationId: string,
    platformEnum: Platform | undefined,
    start: Date,
    end: Date
): Promise<PeriodMetrics> {
    const postWhere = {
        organizationId,
        status: 'PUBLISHED' as const,
        publishedAt: { gte: start, lte: end },
        ...(platformEnum ? { platform: platformEnum } : {}),
    };

    const [agg, posts] = await Promise.all([
        db.postAnalytics.aggregate({
            _sum: { likes: true, comments: true, shares: true, reach: true, impressions: true },
            _avg: { engagementRate: true },
            where: { post: postWhere },
        }),
        db.post.count({ where: postWhere }),
    ]);

    return {
        likes: agg._sum.likes || 0,
        comments: agg._sum.comments || 0,
        shares: agg._sum.shares || 0,
        reach: agg._sum.reach || 0,
        impressions: agg._sum.impressions || 0,
        engagementRate: agg._avg.engagementRate || 0,
        posts,
    };
}
