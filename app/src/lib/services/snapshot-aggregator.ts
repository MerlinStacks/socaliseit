/**
 * Snapshot Aggregator Service
 * Computes and stores daily aggregate analytics in DailyAnalyticsSnapshot.
 *
 * Why: Platform APIs give per-post and per-account data. Aggregating at query
 * time is slow and fragile (dual postPlatform/post paths). This service
 * pre-computes daily totals after each sync so the analytics page reads fast,
 * consistent, pre-aggregated data.
 */

import { db } from '@/lib/db';
import { startOfDay, subDays } from 'date-fns';
import { Platform } from '@/generated/prisma/client';
import { logger } from '@/lib/logger';

/** Platforms that can have post or account analytics. */
const ALL_PLATFORMS: Platform[] = [
    'INSTAGRAM',
    'FACEBOOK',
    'YOUTUBE',
    'TIKTOK',
    'PINTEREST',
    'THREADS',
    'BLUESKY',
    'LINKEDIN',
    'GOOGLE_BUSINESS',
];

interface DayPlatformAgg {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    impressions: number;
    reach: number;
    videoViews: number;
    followers: number;
    followersChange: number;
    engagementRate: number;
    postsPublished: number;
}

/**
 * Compute and upsert DailyAnalyticsSnapshot rows for today.
 * Called after syncPlatformAnalytics + syncPostAnalytics complete.
 *
 * @param organizationId - Workspace to aggregate
 */
export async function computeDailySnapshots(organizationId: string): Promise<number> {
    const today = startOfDay(new Date());
    return computeSnapshotsForDate(organizationId, today);
}

/**
 * Backfill historical snapshots from existing PostAnalytics and PlatformAnalytics.
 *
 * @param organizationId - Workspace to backfill
 * @param days - Number of days to backfill (default 90)
 */
export async function backfillSnapshots(
    organizationId: string,
    days: number = 90
): Promise<{ daysProcessed: number; snapshotsCreated: number }> {
    let snapshotsCreated = 0;
    const now = startOfDay(new Date());

    for (let i = 0; i < days; i++) {
        const date = subDays(now, i);
        const count = await computeSnapshotsForDate(organizationId, date);
        snapshotsCreated += count;
    }

    logger.info(
        { organizationId, days, snapshotsCreated },
        'Snapshot backfill complete'
    );

    return { daysProcessed: days, snapshotsCreated };
}

/**
 * Compute snapshots for a specific date.
 * Why: Shared by both `computeDailySnapshots` (today) and `backfillSnapshots` (historical).
 */
async function computeSnapshotsForDate(
    organizationId: string,
    date: Date
): Promise<number> {
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    /** Why: Get all platforms that have any data for this org on this day */
    const accounts = await db.socialAccount.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, platform: true },
    });

    /** Why: Build a set of platforms that have at least one account */
    const platformAccountMap = new Map<Platform, string[]>();
    for (const account of accounts) {
        const existing = platformAccountMap.get(account.platform as Platform) || [];
        existing.push(account.id);
        platformAccountMap.set(account.platform as Platform, existing);
    }

    /** Why: Also check for posts with direct platform field (new architecture) */
    const directPlatforms = await db.post.groupBy({
        by: ['platform'],
        where: {
            organizationId,
            status: 'PUBLISHED',
            publishedAt: { gte: dayStart, lte: dayEnd },
            platform: { not: null },
        },
    });
    for (const row of directPlatforms) {
        if (row.platform && !platformAccountMap.has(row.platform)) {
            platformAccountMap.set(row.platform, []);
        }
    }

    let upserted = 0;

    for (const platform of ALL_PLATFORMS) {
        const accountIds = platformAccountMap.get(platform) || [];

        const agg = await aggregateForPlatform(
            organizationId,
            platform,
            accountIds,
            dayStart,
            dayEnd
        );

        /** Why: Skip platforms with zero data to avoid cluttering the table */
        if (isEmptyAgg(agg)) continue;

        await db.dailyAnalyticsSnapshot.upsert({
            where: {
                organizationId_platform_date: {
                    organizationId,
                    platform,
                    date: dayStart,
                },
            },
            create: {
                organizationId,
                platform,
                date: dayStart,
                ...agg,
            },
            update: {
                ...agg,
                syncedAt: new Date(),
            },
        });

        upserted++;
    }

    return upserted;
}

/**
 * Aggregate engagement + account metrics for a single platform on a single day.
 */
async function aggregateForPlatform(
    organizationId: string,
    platform: Platform,
    accountIds: string[],
    dayStart: Date,
    dayEnd: Date
): Promise<DayPlatformAgg> {
    /** Why: Run all queries in parallel for speed */
    const [postPlatformAgg, directPostAgg, accountAgg, postCount] = await Promise.all([
        /** Path 1: PostAnalytics via PostPlatform (legacy) */
        accountIds.length > 0
            ? db.postAnalytics.aggregate({
                _sum: {
                    likes: true, comments: true, shares: true, saves: true,
                    clicks: true, impressions: true, reach: true, videoViews: true,
                },
                where: {
                    postPlatform: {
                        socialAccountId: { in: accountIds },
                        post: {
                            organizationId,
                            publishedAt: { gte: dayStart, lte: dayEnd },
                        },
                    },
                },
            })
            : null,

        /** Path 2: PostAnalytics via direct Post (new architecture) */
        db.postAnalytics.aggregate({
            _sum: {
                likes: true, comments: true, shares: true, saves: true,
                clicks: true, impressions: true, reach: true, videoViews: true,
            },
            where: {
                post: {
                    organizationId,
                    platform,
                    publishedAt: { gte: dayStart, lte: dayEnd },
                },
            },
        }),

        /** Account-level metrics from PlatformAnalytics */
        accountIds.length > 0
            ? db.platformAnalytics.aggregate({
                _sum: { followers: true, followersChange: true, impressions: true, reach: true },
                where: {
                    socialAccountId: { in: accountIds },
                    date: dayStart,
                },
            })
            : null,

        /** Post count for the day */
        db.post.count({
            where: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: dayStart, lte: dayEnd },
                OR: [
                    { platform },
                    { platforms: { some: { socialAccount: { platform } } } },
                ],
            },
        }),
    ]);

    /** Why: Merge both PostAnalytics paths, avoiding double-counting.
     * A post should only have analytics via ONE path (postPlatform or direct post),
     * so summing both is safe. */
    const ppSum = postPlatformAgg?._sum;
    const dpSum = directPostAgg._sum;

    const likes = (ppSum?.likes || 0) + (dpSum.likes || 0);
    const comments = (ppSum?.comments || 0) + (dpSum.comments || 0);
    const shares = (ppSum?.shares || 0) + (dpSum.shares || 0);
    const reach = (ppSum?.reach || 0) + (dpSum.reach || 0);

    /** Why: Account-level followers/reach overlay the post-level reach when available */
    const acctSum = accountAgg?._sum;
    const acctFollowers = acctSum?.followers || 0;
    const acctFollowersChange = acctSum?.followersChange || 0;

    /** Why: Use account-level impressions/reach as a floor if post-level is lower */
    const acctImpressions = acctSum?.impressions || 0;
    const acctReach = acctSum?.reach || 0;

    const totalImpressions = Math.max(
        (ppSum?.impressions || 0) + (dpSum.impressions || 0),
        acctImpressions
    );
    const totalReach = Math.max(reach, acctReach);

    const engagementRate = totalReach > 0
        ? ((likes + comments + shares) / totalReach) * 100
        : 0;

    return {
        likes,
        comments,
        shares,
        saves: (ppSum?.saves || 0) + (dpSum.saves || 0),
        clicks: (ppSum?.clicks || 0) + (dpSum.clicks || 0),
        impressions: totalImpressions,
        reach: totalReach,
        videoViews: (ppSum?.videoViews || 0) + (dpSum.videoViews || 0),
        followers: acctFollowers,
        followersChange: acctFollowersChange,
        engagementRate: Math.round(engagementRate * 100) / 100,
        postsPublished: postCount,
    };
}

/** Why: Avoid inserting rows with all zeros */
function isEmptyAgg(agg: DayPlatformAgg): boolean {
    return (
        agg.likes === 0 &&
        agg.comments === 0 &&
        agg.shares === 0 &&
        agg.saves === 0 &&
        agg.clicks === 0 &&
        agg.impressions === 0 &&
        agg.reach === 0 &&
        agg.videoViews === 0 &&
        agg.followers === 0 &&
        agg.postsPublished === 0
    );
}
