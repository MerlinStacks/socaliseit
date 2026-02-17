/**
 * Analytics Data Fetching and Processing
 * Extracted from page.tsx to maintain 200-line standard
 */

import { db } from '@/lib/db';
import { subDays, startOfDay, format } from 'date-fns';
import { Platform } from '@/generated/prisma/client';

import { logger } from '@/lib/logger';

// Types
export interface AnalyticsParams {
    organizationId: string;
    platformFilter?: string;
    range: string;
}

export interface DateRange {
    start: Date;
    end: Date;
    prevStart: Date;
}

export interface EngagementData {
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
    totalReach: number;
    totalImpressions: number;
    totalClicks: number;
    totalVideoViews: number;
    avgEngagementRate: number;
    likesChange: number;
    commentsChange: number;
    sharesChange: number;
    reachChange: number;
    impressionsChange: number;
    savesChange: number;
    clicksChange: number;
}

export interface TopPost {
    id: string;
    caption: string;
    thumbnail: string | null;
    platforms: string[];
    publishedAt: Date | null;
    metrics: { likes: number; comments: number; shares: number };
}

export interface TimelinePoint {
    day: string;
    count: number;
}

export interface EngagementTimelinePoint {
    day: string;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
}

export interface ContentTypeStats {
    postType: string;
    count: number;
    avgEngagement: number;
    totalLikes: number;
    totalComments: number;
}

export interface AccountTimeline {
    id: string;
    name: string;
    platform: string;
    currentFollowers: number;
    followerChange: number;
    timeline: Array<{ date: string; followers: number }>;
}

export interface AccountGrowthData {
    accounts: AccountTimeline[];
    totalFollowers: number;
    totalFollowerChange: number;
    totalProfileViews: number;
    totalWebsiteClicks: number;
}

/**
 * Calculate date range based on range string
 */
export function calculateDateRange(range: string): DateRange {
    const end = new Date();
    let start = subDays(end, 7);
    let prevStart = subDays(start, 7);

    if (range === '30d') {
        start = subDays(end, 30);
        prevStart = subDays(start, 30);
    } else if (range === '90d') {
        start = subDays(end, 90);
        prevStart = subDays(start, 90);
    } else if (range === 'year') {
        start = subDays(end, 365);
        prevStart = subDays(start, 365);
    }

    return { start, end, prevStart };
}

/**
 * Calculate percentage change between current and previous period
 */
export function calcChange(curr: number, prev: number): number {
    return prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
}

/**
 * Fetch all analytics data in parallel
 */
export async function fetchAnalyticsData(params: AnalyticsParams) {
    const { organizationId, platformFilter, range } = params;
    const { start, end, prevStart } = calculateDateRange(range);

    // Platform filter
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;
    const platformWhere = platformEnum
        ? { platforms: { some: { socialAccount: { platform: platformEnum } } } }
        : {};

    // Common WHERE clause for Posts
    const whereBase = {
        organizationId,
        ...platformWhere,
    };

    const [
        socialAccounts,
        totalPosts,
        publishedPosts,
        scheduledPosts,
        recentPublished,
        postsInPeriod,
        previousPeriodPosts,
        competitors,
        myEngagementStats,
        engagementMetrics,
        previousEngagement,
    ] = await Promise.all([
        // Connected social accounts
        db.socialAccount.findMany({
            where: { organizationId, isActive: true },
            select: { id: true, platform: true, name: true, username: true },
        }),

        // Total posts count
        db.post.count({ where: whereBase }),

        // Published posts count
        db.post.count({ where: { ...whereBase, status: 'PUBLISHED' } }),

        // Scheduled posts count
        db.post.count({ where: { ...whereBase, status: 'SCHEDULED' } }),

        // Recent published posts (for top posts section)
        db.post.findMany({
            where: { ...whereBase, status: 'PUBLISHED' },
            include: {
                platforms: {
                    include: {
                        socialAccount: true,
                        analytics: true
                    },
                },
                media: {
                    include: { media: true },
                    take: 1,
                },
            },
            orderBy: { publishedAt: 'desc' },
            take: 5,
        }),

        // Posts in current period
        db.post.count({
            where: { ...whereBase, createdAt: { gte: start, lte: end } },
        }),

        // Posts in previous period
        db.post.count({
            where: { ...whereBase, createdAt: { gte: prevStart, lt: start } },
        }),

        // Competitors
        db.competitor.findMany({
            where: {
                organizationId,
                ...(platformEnum ? { platform: platformEnum } : {})
            },
            orderBy: { followers: 'desc' },
            take: 5
        }),

        // My Engagement Stats (Avg Engagement Rate)
        db.postAnalytics.aggregate({
            _avg: { engagementRate: true },
            where: {
                postPlatform: {
                    socialAccount: {
                        organizationId,
                        ...(platformEnum ? { platform: platformEnum } : {})
                    }
                }
            }
        }),

        // Aggregated engagement metrics for the period
        db.postAnalytics.aggregate({
            _sum: { likes: true, comments: true, shares: true, saves: true, impressions: true, reach: true, clicks: true, videoViews: true },
            _avg: { engagementRate: true },
            where: {
                OR: [
                    {
                        postPlatform: {
                            post: { organizationId, publishedAt: { gte: start, lte: end } },
                            socialAccount: platformEnum ? { platform: platformEnum } : undefined
                        }
                    },
                    {
                        post: {
                            organizationId,
                            publishedAt: { gte: start, lte: end },
                            platform: platformEnum || undefined
                        }
                    },
                ],
            }
        }),

        // Previous period engagement for comparison
        db.postAnalytics.aggregate({
            _sum: { likes: true, comments: true, shares: true, saves: true, impressions: true, reach: true, clicks: true, videoViews: true },
            where: {
                OR: [
                    {
                        postPlatform: {
                            post: { organizationId, publishedAt: { gte: prevStart, lt: start } },
                            socialAccount: platformEnum ? { platform: platformEnum } : undefined
                        }
                    },
                    {
                        post: {
                            organizationId,
                            publishedAt: { gte: prevStart, lt: start },
                            platform: platformEnum || undefined
                        }
                    },
                ],
            }
        }),
    ]);

    // Determine if there's any meaningful data to display
    const hasData = totalPosts > 0 || publishedPosts > 0 || socialAccounts.length > 0;

    return {
        socialAccounts,
        totalPosts,
        publishedPosts,
        scheduledPosts,
        recentPublished,
        postsInPeriod,
        previousPeriodPosts,
        competitors,
        myEngagementStats,
        engagementMetrics,
        previousEngagement,
        dateRange: { start, end, prevStart },
        platformEnum,
        // For empty state handling
        hasData,
        isEmpty: totalPosts === 0 && publishedPosts === 0,
    };
}

/**
 * Build timeline data for chart
 * Uses a single groupBy query instead of N individual count queries
 */
export async function buildTimelineData(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<TimelinePoint[]> {
    const { end } = calculateDateRange(range);
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;
    const platformWhere = platformEnum
        ? { platforms: { some: { socialAccount: { platform: platformEnum } } } }
        : {};
    const whereBase = { organizationId, ...platformWhere };

    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 12 : 12;
    const numDays = Math.min(days, 14);
    const rangeStart = startOfDay(subDays(end, numDays - 1));

    // Single query: fetch all posts in the date range, grouped by scheduledAt date
    const posts = await db.post.findMany({
        where: {
            ...whereBase,
            OR: [
                { publishedAt: { gte: rangeStart, lt: new Date(end.getTime() + 86400000) } },
                { scheduledAt: { gte: rangeStart, lt: new Date(end.getTime() + 86400000) } },
            ],
        },
        select: {
            publishedAt: true,
            scheduledAt: true,
        },
    });

    // Count posts per day in memory
    const countMap = new Map<string, number>();
    for (const post of posts) {
        const date = post.publishedAt ?? post.scheduledAt;
        if (!date) continue;
        const key = format(date, 'yyyy-MM-dd');
        countMap.set(key, (countMap.get(key) || 0) + 1);
    }

    // Build timeline with zero-filled days
    return Array.from({ length: numDays }, (_, i) => {
        const dayStart = startOfDay(subDays(end, numDays - 1 - i));
        const key = format(dayStart, 'yyyy-MM-dd');
        return {
            day: format(dayStart, range === 'year' ? 'MMM' : 'EEE'),
            count: countMap.get(key) || 0,
        };
    });
}

/**
 * Process engagement data from database results
 */
export function processEngagementData(
    engagementMetrics: { _sum: { likes?: number | null; comments?: number | null; shares?: number | null; saves?: number | null; reach?: number | null; impressions?: number | null; clicks?: number | null; videoViews?: number | null }; _avg: { engagementRate?: number | null } },
    previousEngagement: { _sum: { likes?: number | null; comments?: number | null; shares?: number | null; reach?: number | null; impressions?: number | null; saves?: number | null; clicks?: number | null; videoViews?: number | null } }
): EngagementData {
    const totalLikes = engagementMetrics._sum.likes || 0;
    const totalComments = engagementMetrics._sum.comments || 0;
    const totalShares = engagementMetrics._sum.shares || 0;
    const totalSaves = engagementMetrics._sum.saves || 0;
    const totalReach = engagementMetrics._sum.reach || 0;
    const totalImpressions = engagementMetrics._sum.impressions || 0;
    const totalClicks = engagementMetrics._sum.clicks || 0;
    const totalVideoViews = engagementMetrics._sum.videoViews || 0;
    const avgEngagementRate = engagementMetrics._avg.engagementRate || 0;

    const prevLikes = previousEngagement._sum.likes || 0;
    const prevComments = previousEngagement._sum.comments || 0;
    const prevShares = previousEngagement._sum.shares || 0;
    const prevReach = previousEngagement._sum.reach || 0;
    const prevImpressions = previousEngagement._sum.impressions || 0;
    const prevSaves = previousEngagement._sum.saves || 0;
    const prevClicks = previousEngagement._sum.clicks || 0;

    return {
        totalLikes,
        totalComments,
        totalShares,
        totalSaves,
        totalReach,
        totalImpressions,
        totalClicks,
        totalVideoViews,
        avgEngagementRate,
        likesChange: calcChange(totalLikes, prevLikes),
        commentsChange: calcChange(totalComments, prevComments),
        sharesChange: calcChange(totalShares, prevShares),
        reachChange: calcChange(totalReach, prevReach),
        impressionsChange: calcChange(totalImpressions, prevImpressions),
        savesChange: calcChange(totalSaves, prevSaves),
        clicksChange: calcChange(totalClicks, prevClicks),
    };
}

/**
 * Transform posts for mobile display
 */
export function transformTopPosts(posts: Array<{
    id: string;
    caption: string;
    publishedAt: Date | null;
    media: Array<{ media: { thumbnailUrl?: string | null; url: string } | null }>;
    platforms: Array<{
        socialAccount: { platform: Platform } | null;
        analytics: { likes?: number | null; comments?: number | null; shares?: number | null } | null;
    }>;
}>): TopPost[] {
    return posts.map(post => ({
        id: post.id,
        caption: post.caption,
        thumbnail: post.media[0]?.media?.thumbnailUrl || post.media[0]?.media?.url || null,
        platforms: post.platforms.map(p => p.socialAccount?.platform?.toLowerCase() || 'unknown'),
        publishedAt: post.publishedAt,
        metrics: post.platforms.reduce((acc, pp) => ({
            likes: acc.likes + (pp.analytics?.likes || 0),
            comments: acc.comments + (pp.analytics?.comments || 0),
            shares: acc.shares + (pp.analytics?.shares || 0)
        }), { likes: 0, comments: 0, shares: 0 })
    }));
}

/**
 * Build engagement timeline for multi-series trend chart.
 * Why: Reads from DailyAnalyticsSnapshot — pre-aggregated daily totals
 * that were computed after each sync cycle.
 */
export async function buildEngagementTimeline(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<EngagementTimelinePoint[]> {
    const { start, end } = calculateDateRange(range);
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;

    const snapshots = await db.dailyAnalyticsSnapshot.findMany({
        where: {
            organizationId,
            date: { gte: start, lte: end },
            ...(platformEnum ? { platform: platformEnum } : {}),
        },
        orderBy: { date: 'asc' },
    });

    /** Why: Group by date in case there are multiple platforms per day */
    const dayMap = new Map<string, { likes: number; comments: number; shares: number; rateSum: number; count: number }>();

    for (const snap of snapshots) {
        const key = format(snap.date, 'yyyy-MM-dd');
        const cur = dayMap.get(key) || { likes: 0, comments: 0, shares: 0, rateSum: 0, count: 0 };
        dayMap.set(key, {
            likes: cur.likes + snap.likes,
            comments: cur.comments + snap.comments,
            shares: cur.shares + snap.shares,
            rateSum: cur.rateSum + snap.engagementRate,
            count: cur.count + 1,
        });
    }

    const days = range === '7d' ? 7 : range === '30d' ? 14 : 12;
    const numDays = Math.min(days, 14);

    return Array.from({ length: numDays }, (_, i) => {
        const dayStart = startOfDay(subDays(end, numDays - 1 - i));
        const key = format(dayStart, 'yyyy-MM-dd');
        const d = dayMap.get(key);
        return {
            day: format(dayStart, range === 'year' ? 'MMM' : 'EEE'),
            likes: d?.likes || 0,
            comments: d?.comments || 0,
            shares: d?.shares || 0,
            engagementRate: d && d.count > 0 ? d.rateSum / d.count : 0,
        };
    });
}

/**
 * Fetch performance breakdown by post type (Feed, Reel, Story, Carousel, etc.).
 * Why: Queries Post directly (new architecture) since most posts use Post.postType
 * rather than the legacy PostPlatform pivot table.
 */
export async function fetchContentTypeBreakdown(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<ContentTypeStats[]> {
    try {
        const { start, end } = calculateDateRange(range);
        const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;

        const groupedData = await db.post.groupBy({
            by: ['postType'],
            _count: { _all: true },
            where: {
                organizationId,
                publishedAt: { gte: start, lte: end },
                status: 'PUBLISHED',
                platform: platformEnum || undefined,
            },
        });

        /** For each post type, fetch the avg engagement stats */
        const results: ContentTypeStats[] = [];

        for (const group of groupedData) {
            const agg = await db.postAnalytics.aggregate({
                _avg: { engagementRate: true },
                _sum: { likes: true, comments: true },
                where: {
                    OR: [
                        {
                            postPlatform: {
                                post: {
                                    organizationId,
                                    postType: group.postType,
                                    publishedAt: { gte: start, lte: end },
                                    status: 'PUBLISHED',
                                },
                                socialAccount: platformEnum ? { platform: platformEnum } : undefined,
                            },
                        },
                        {
                            post: {
                                organizationId,
                                postType: group.postType,
                                publishedAt: { gte: start, lte: end },
                                status: 'PUBLISHED',
                                platform: platformEnum || undefined,
                            },
                        },
                    ],
                },
            });

            const label = group.postType.charAt(0) + group.postType.slice(1).toLowerCase();
            results.push({
                postType: label,
                count: group._count._all,
                avgEngagement: agg._avg.engagementRate || 0,
                totalLikes: agg._sum.likes || 0,
                totalComments: agg._sum.comments || 0,
            });
        }

        return results.sort((a, b) => b.avgEngagement - a.avgEngagement);
    } catch (err) {
        logger.error({ error: String(err) }, 'fetchContentTypeBreakdown failed');
        return [];
    }
}

/**
 * Fetch account-level growth data from PlatformAnalytics.
 * Why: PlatformAnalytics stores daily follower counts, profile views, and website clicks
 * per connected account — but the analytics page never queried this table until now.
 */
export async function fetchAccountGrowth(
    organizationId: string,
    platformFilter: string | undefined,
    range: string
): Promise<AccountGrowthData> {
    const { start, end } = calculateDateRange(range);
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;

    /* Fetch all PlatformAnalytics rows in the date range */
    const rows = await db.platformAnalytics.findMany({
        where: {
            organizationId,
            date: { gte: start, lte: end },
            socialAccount: platformEnum ? { platform: platformEnum } : undefined,
        },
        include: {
            socialAccount: { select: { id: true, name: true, username: true, platform: true } },
        },
        orderBy: { date: 'asc' },
    });

    /* Aggregate profile views + website clicks for the period */
    const agg = await db.platformAnalytics.aggregate({
        _sum: { profileViews: true, websiteClicks: true },
        where: {
            organizationId,
            date: { gte: start, lte: end },
            socialAccount: platformEnum ? { platform: platformEnum } : undefined,
        },
    });

    /* Group rows by account */
    const accountMap = new Map<string, {
        name: string; platform: string;
        timeline: Array<{ date: string; followers: number }>;
        firstFollowers: number; lastFollowers: number;
    }>();

    for (const row of rows) {
        const acct = row.socialAccount;
        if (!acct) continue;

        let entry = accountMap.get(acct.id);
        if (!entry) {
            entry = {
                name: acct.name || acct.username || 'Unknown',
                platform: acct.platform.toLowerCase(),
                timeline: [],
                firstFollowers: row.followers || 0,
                lastFollowers: row.followers || 0,
            };
            accountMap.set(acct.id, entry);
        }

        entry.timeline.push({
            date: format(row.date, 'MMM d'),
            followers: row.followers || 0,
        });
        entry.lastFollowers = row.followers || 0;
    }

    const accounts: AccountTimeline[] = [];
    let totalFollowers = 0;
    let totalFollowerChange = 0;

    for (const [id, data] of accountMap) {
        const change = data.lastFollowers - data.firstFollowers;
        accounts.push({
            id,
            name: data.name,
            platform: data.platform,
            currentFollowers: data.lastFollowers,
            followerChange: change,
            timeline: data.timeline,
        });
        totalFollowers += data.lastFollowers;
        totalFollowerChange += change;
    }

    return {
        accounts: accounts.sort((a, b) => b.currentFollowers - a.currentFollowers),
        totalFollowers,
        totalFollowerChange,
        totalProfileViews: agg._sum.profileViews || 0,
        totalWebsiteClicks: agg._sum.websiteClicks || 0,
    };
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

        /* Grab the latest PlatformAnalytics row per account */
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
            const metrics = row.platformMetrics as any;
            if (!metrics) continue;
            const demo = metrics?.audienceDemographics;
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
                        platforms: {
                            select: {
                                analytics: {
                                    select: { engagementRate: true, reach: true, likes: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        /* If PostHashtag has data, use it directly */
        if (postHashtags.length > 0) {
            const map = new Map<string, {
                count: number; totalRate: number; totalReach: number; totalLikes: number;
            }>();

            for (const ph of postHashtags) {
                const tag = ph.hashtag.tag;
                /** Why: Check direct Post→PostAnalytics first, then fallback to
                 * PostPlatform→PostAnalytics (legacy). Use the first non-null source. */
                const directAnalytics = ph.post.analytics;
                const ppAnalytics = ph.post.platforms
                    ?.map(p => p.analytics)
                    .find(a => a != null);
                const analytics = directAnalytics || ppAnalytics;
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

        /* Fallback: extract hashtags from post captions */
        const posts = await db.post.findMany({
            where: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: start, lte: end },
                platform: platformEnum || undefined,
                NOT: { caption: '' },
            },
            include: {
                analytics: {
                    select: { engagementRate: true, reach: true, likes: true },
                },
                platforms: {
                    select: {
                        analytics: {
                            select: { engagementRate: true, reach: true, likes: true },
                        },
                    },
                },
            },
        });

        const map = new Map<string, {
            count: number; totalRate: number; totalReach: number; totalLikes: number;
        }>();

        for (const post of posts) {
            const tags = (post.caption || '').match(/#[\w\u00C0-\u024F]+/g);
            if (!tags) continue;

            /** Why: same fallback as above — check direct then legacy analytics */
            const directAnalytics = post.analytics;
            const ppAnalytics = post.platforms
                ?.map(p => p.analytics)
                .find(a => a != null);
            const analytics = directAnalytics || ppAnalytics;

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
    } catch (err) {
        logger.error({ error: String(err) }, 'fetchHashtagPerformance failed');
        return [];
    }
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
