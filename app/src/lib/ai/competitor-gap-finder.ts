/**
 * Competitor Gap Finder
 * 
 * Analyzes competitor posting patterns to identify optimal windows
 * when competitors are quiet but audience engagement is typically high.
 * 
 * Why: Posting during competitor "quiet hours" can increase visibility
 * and reduce competition for audience attention in the feed.
 */

import { db } from '@/lib/db';
import { Platform } from '@/generated/prisma/enums';
import { getDay, getHours, subDays } from 'date-fns';

export interface CompetitorGap {
    day: number; // 0-6 (Sun-Sat)
    hour: number; // 0-23
    platform: Platform;
    competitorActivity: number; // Number of competitor posts in this slot
    gapScore: number; // 0-100, higher = better opportunity
    reason: string;
}

/**
 * Analyze competitor posting patterns for the last N days
 */
async function getCompetitorActivityHeatmap(
    organizationId: string,
    platform: Platform,
    daysBack: number = 30
): Promise<Map<string, number>> {
    const cutoffDate = subDays(new Date(), daysBack);

    const competitorPosts = await db.competitorPost.findMany({
        where: {
            competitor: {
                organizationId,
                platform,
            },
            postedAt: { gte: cutoffDate }
        },
        select: { postedAt: true }
    });

    // Build heatmap: key = "day-hour", value = post count
    const heatmap = new Map<string, number>();

    for (const post of competitorPosts) {
        const day = getDay(post.postedAt);
        const hour = getHours(post.postedAt);
        const key = `${day}-${hour}`;
        heatmap.set(key, (heatmap.get(key) || 0) + 1);
    }

    return heatmap;
}

/**
 * Find optimal posting gaps when competitors are least active
 */
export async function findCompetitorGaps(
    organizationId: string,
    platform?: Platform,
    topN: number = 10
): Promise<CompetitorGap[]> {
    // Get platforms to analyze
    let platforms: Platform[];
    if (platform) {
        platforms = [platform];
    } else {
        const competitors = await db.competitor.findMany({
            where: { organizationId },
            select: { platform: true },
            distinct: ['platform']
        });
        platforms = competitors.map(c => c.platform);
    }

    const gaps: CompetitorGap[] = [];

    for (const plat of platforms) {
        const heatmap = await getCompetitorActivityHeatmap(organizationId, plat);

        // Check each day/hour combination
        for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
                // Skip sleeping hours (midnight to 6am)
                if (hour < 6) continue;

                const key = `${day}-${hour}`;
                const activity = heatmap.get(key) || 0;

                // Calculate gap score: inverse of activity (normalized 0-100)
                // Low competitor activity = high gap score
                const maxActivity = Math.max(...Array.from(heatmap.values()), 1);
                const gapScore = Math.round((1 - activity / maxActivity) * 100);

                // Only include slots with gap score > 70 (low competition)
                if (gapScore >= 70) {
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const hourLabel = hour === 0 ? '12AM' : hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`;

                    gaps.push({
                        day,
                        hour,
                        platform: plat,
                        competitorActivity: activity,
                        gapScore,
                        reason: activity === 0
                            ? `No competitor posts on ${dayNames[day]} ${hourLabel}`
                            : `Low competition on ${dayNames[day]} ${hourLabel} (${activity} posts)`
                    });
                }
            }
        }
    }

    // Sort by gap score (highest first) and return top N
    return gaps
        .sort((a, b) => b.gapScore - a.gapScore)
        .slice(0, topN);
}

/**
 * Get competitor posting frequency by day of week
 */
export async function getCompetitorDayDistribution(
    organizationId: string,
    platform: Platform,
    daysBack: number = 30
): Promise<Record<number, number>> {
    const cutoffDate = subDays(new Date(), daysBack);

    const posts = await db.competitorPost.findMany({
        where: {
            competitor: {
                organizationId,
                platform
            },
            postedAt: { gte: cutoffDate }
        },
        select: { postedAt: true }
    });

    const distribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    for (const post of posts) {
        const day = getDay(post.postedAt);
        distribution[day] = (distribution[day] || 0) + 1;
    }

    return distribution;
}

/**
 * Get quiet hours (hours with minimal competitor activity)
 */
export async function getQuietHours(
    organizationId: string,
    platform: Platform,
    threshold: number = 2 // Max posts to qualify as "quiet"
): Promise<number[]> {
    const heatmap = await getCompetitorActivityHeatmap(organizationId, platform);

    const quietHours: number[] = [];

    for (let hour = 6; hour < 24; hour++) {
        // Sum activity across all days for this hour
        let totalActivity = 0;
        for (let day = 0; day < 7; day++) {
            totalActivity += heatmap.get(`${day}-${hour}`) || 0;
        }

        if (totalActivity <= threshold) {
            quietHours.push(hour);
        }
    }

    return quietHours;
}

/**
 * Find the single best gap for each platform
 */
export async function getBestGapPerPlatform(
    organizationId: string
): Promise<Map<Platform, CompetitorGap>> {
    const competitors = await db.competitor.findMany({
        where: { organizationId },
        select: { platform: true },
        distinct: ['platform']
    });

    const result = new Map<Platform, CompetitorGap>();

    for (const c of competitors) {
        const gaps = await findCompetitorGaps(organizationId, c.platform, 1);
        if (gaps.length > 0) {
            result.set(c.platform, gaps[0]);
        }
    }

    return result;
}
