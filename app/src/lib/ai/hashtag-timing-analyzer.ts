/**
 * Hashtag Timing Analyzer
 * 
 * Analyzes hashtag performance by time slot and learns which hashtags
 * perform better at specific times.
 * 
 * Why: Trending hashtags have different activity windows.
 * #MondayMotivation performs best Monday mornings.
 */

import { db } from '@/lib/db';
import { Platform } from '@/generated/prisma/enums';
import { getDay, getHours } from 'date-fns';

/**
 * Extract hashtags from caption text
 * Handles Unicode characters for international hashtags
 */
export function extractHashtags(caption: string): string[] {
    // Match # followed by word characters (including Unicode letters)
    const regex = /#([\p{L}\p{N}_]+)/gu;
    const matches = [...caption.matchAll(regex)];
    return matches.map(m => m[1].toLowerCase());
}

/**
 * Analyze published posts and update hashtag timing patterns
 */
export async function analyzeHashtagTimingPatterns(organizationId: string): Promise<{
    patternsUpdated: number;
    hashtagsAnalyzed: number;
}> {
    // Fetch published posts with analytics from last 90 days
    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            publishedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            platform: { not: null },
        },
        include: {
            analytics: true,
        }
    });

    // Group engagement by hashtag + day + hour
    const hashtagMap = new Map<string, {
        platform: Platform;
        hashtag: string;
        day: number;
        hour: number;
        totalEngagement: number;
        count: number;
    }>();

    let hashtagsAnalyzed = 0;

    for (const post of posts) {
        const caption = post.caption;
        if (!post.publishedAt || !post.analytics || !caption || !post.platform) continue;

        const hashtags = extractHashtags(caption);
        if (hashtags.length === 0) continue;

        const day = getDay(post.publishedAt);
        const hour = getHours(post.publishedAt);
        const engagement = (post.analytics.likes || 0) +
            (post.analytics.comments || 0) +
            (post.analytics.shares || 0);

        for (const hashtag of hashtags) {
            hashtagsAnalyzed++;
            const key = `${post.platform}-${hashtag}-${day}-${hour}`;

            const current = hashtagMap.get(key) || {
                platform: post.platform,
                hashtag,
                day,
                hour,
                totalEngagement: 0,
                count: 0
            };

            hashtagMap.set(key, {
                ...current,
                totalEngagement: current.totalEngagement + engagement,
                count: current.count + 1
            });
        }
    }

    // Find best day+hour for each hashtag
    const bestPatterns = new Map<string, {
        platform: Platform;
        hashtag: string;
        bestDay: number;
        bestHour: number;
        avgEngagement: number;
        sampleSize: number;
    }>();

    for (const data of hashtagMap.values()) {
        const sigKey = `${data.platform}-${data.hashtag}`;
        const avgEngagement = data.totalEngagement / data.count;
        const existing = bestPatterns.get(sigKey);

        if (!existing || avgEngagement > existing.avgEngagement) {
            bestPatterns.set(sigKey, {
                platform: data.platform,
                hashtag: data.hashtag,
                bestDay: data.day,
                bestHour: data.hour,
                avgEngagement,
                sampleSize: data.count
            });
        }
    }

    // Upsert patterns to database (only hashtags with 3+ samples)
    let patternsUpdated = 0;
    for (const pattern of bestPatterns.values()) {
        if (pattern.sampleSize < 3) continue;

        await db.hashtagTimingPattern.upsert({
            where: {
                organizationId_platform_hashtag: {
                    organizationId,
                    platform: pattern.platform,
                    hashtag: pattern.hashtag
                }
            },
            create: {
                organizationId,
                platform: pattern.platform,
                hashtag: pattern.hashtag,
                bestDay: pattern.bestDay,
                bestHour: pattern.bestHour,
                avgEngagement: pattern.avgEngagement,
                sampleSize: pattern.sampleSize
            },
            update: {
                bestDay: pattern.bestDay,
                bestHour: pattern.bestHour,
                avgEngagement: pattern.avgEngagement,
                sampleSize: pattern.sampleSize
            }
        });
        patternsUpdated++;
    }

    return { patternsUpdated, hashtagsAnalyzed };
}

/**
 * Get recommended posting time for content with specific hashtags
 */
export async function getHashtagBasedRecommendation(
    organizationId: string,
    platform: Platform,
    hashtags: string[]
): Promise<{ day: number; hour: number; confidence: number; topHashtag: string } | null> {
    if (hashtags.length === 0) return null;

    const normalizedTags = hashtags.map(h => h.toLowerCase().replace('#', ''));

    const patterns = await db.hashtagTimingPattern.findMany({
        where: {
            organizationId,
            platform,
            hashtag: { in: normalizedTags }
        },
        orderBy: { avgEngagement: 'desc' }
    });

    if (patterns.length === 0) return null;

    // Use the hashtag with highest average engagement
    const bestPattern = patterns[0];
    const confidence = Math.min(0.85, 0.4 + (bestPattern.sampleSize / 30));

    return {
        day: bestPattern.bestDay,
        hour: bestPattern.bestHour,
        confidence,
        topHashtag: bestPattern.hashtag
    };
}
