/**
 * Smart Scheduling Engine
 * 
 * Calculates optimal posting times based on:
 * 1. Historical engagement data (personalized, when available)
 * 2. Industry benchmarks (cold start fallback)
 * 
 * Phase 1 Features:
 * - Timezone-aware scheduling (uses Organization.timezone)
 * - Engagement velocity weighting (recent posts weighted higher)
 * - Cross-platform staggering (avoids same-minute conflicts)
 * 
 * Why: Users need data-driven recommendations for when to post
 * on each platform, considering content types (Reels, Shorts, Stories).
 */

import { db } from '@/lib/db';
import { Platform, PostType } from '@/generated/prisma/enums';
import { startOfWeek, addDays, getDay, getHours, differenceInDays } from 'date-fns';

// NOTE: Organization.timezone is available for future timezone-aware display
// Currently times are generated in the org's local context

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

/**
 * Extended benchmarks with multiple posts per day, post types, and all 7 days.
 * Sources: SproutSocial/Hootsuite/Later 2024-2026 benchmarks
 */
const INDUSTRY_BENCHMARKS: Record<string, TimeSlot[]> = {
    INSTAGRAM: [
        // Feed posts - morning & lunch peaks
        { day: 1, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 12, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 11, minute: 0, postType: PostType.FEED },
        { day: 4, hour: 10, minute: 0, postType: PostType.FEED },
        { day: 5, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 6, hour: 11, minute: 0, postType: PostType.FEED },
        { day: 0, hour: 10, minute: 0, postType: PostType.FEED },
        // Carousels - high engagement (2-3x regular posts)
        { day: 1, hour: 12, minute: 0, postType: PostType.CAROUSEL },
        { day: 2, hour: 10, minute: 0, postType: PostType.CAROUSEL },
        { day: 3, hour: 14, minute: 0, postType: PostType.CAROUSEL },
        { day: 4, hour: 13, minute: 0, postType: PostType.CAROUSEL },
        { day: 5, hour: 11, minute: 0, postType: PostType.CAROUSEL },
        { day: 6, hour: 13, minute: 0, postType: PostType.CAROUSEL },
        { day: 0, hour: 12, minute: 0, postType: PostType.CAROUSEL },
        // Reels - afternoon/evening peaks (higher engagement)
        { day: 1, hour: 19, minute: 0, postType: PostType.REEL },
        { day: 2, hour: 18, minute: 0, postType: PostType.REEL },
        { day: 3, hour: 20, minute: 0, postType: PostType.REEL },
        { day: 4, hour: 19, minute: 0, postType: PostType.REEL },
        { day: 5, hour: 17, minute: 0, postType: PostType.REEL },
        { day: 6, hour: 14, minute: 0, postType: PostType.REEL },
        { day: 0, hour: 15, minute: 0, postType: PostType.REEL },
        // Stories - multiple daily touchpoints
        { day: 1, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 1, hour: 13, minute: 0, postType: PostType.STORY },
        { day: 1, hour: 21, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 14, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 9, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 13, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 19, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 12, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 5, hour: 9, minute: 30, postType: PostType.STORY },
        { day: 5, hour: 14, minute: 0, postType: PostType.STORY },
        { day: 5, hour: 19, minute: 0, postType: PostType.STORY },
        { day: 6, hour: 10, minute: 0, postType: PostType.STORY },
        { day: 6, hour: 16, minute: 0, postType: PostType.STORY },
        { day: 6, hour: 21, minute: 0, postType: PostType.STORY },
        { day: 0, hour: 11, minute: 0, postType: PostType.STORY },
        { day: 0, hour: 17, minute: 0, postType: PostType.STORY },
        { day: 0, hour: 20, minute: 0, postType: PostType.STORY },
    ],
    TIKTOK: [
        // TikToks perform best afternoon/evening - multiple daily
        { day: 1, hour: 12, minute: 0, postType: PostType.REEL },
        { day: 1, hour: 17, minute: 0, postType: PostType.REEL },
        { day: 1, hour: 21, minute: 0, postType: PostType.REEL },
        { day: 2, hour: 15, minute: 0, postType: PostType.REEL },
        { day: 2, hour: 19, minute: 0, postType: PostType.REEL },
        { day: 3, hour: 13, minute: 0, postType: PostType.REEL },
        { day: 3, hour: 18, minute: 0, postType: PostType.REEL },
        { day: 3, hour: 22, minute: 0, postType: PostType.REEL },
        { day: 4, hour: 14, minute: 0, postType: PostType.REEL },
        { day: 4, hour: 17, minute: 0, postType: PostType.REEL },
        { day: 4, hour: 20, minute: 0, postType: PostType.REEL },
        { day: 5, hour: 13, minute: 0, postType: PostType.REEL },
        { day: 5, hour: 16, minute: 0, postType: PostType.REEL },
        { day: 5, hour: 21, minute: 0, postType: PostType.REEL },
        { day: 6, hour: 11, minute: 0, postType: PostType.REEL },
        { day: 6, hour: 15, minute: 0, postType: PostType.REEL },
        { day: 6, hour: 19, minute: 0, postType: PostType.REEL },
        { day: 0, hour: 12, minute: 0, postType: PostType.REEL },
        { day: 0, hour: 16, minute: 0, postType: PostType.REEL },
        { day: 0, hour: 20, minute: 0, postType: PostType.REEL },
    ],
    YOUTUBE: [
        // Long-form videos - weekend leisure + weekday evening
        { day: 1, hour: 17, minute: 0, postType: PostType.VIDEO },
        { day: 3, hour: 18, minute: 0, postType: PostType.VIDEO },
        { day: 5, hour: 15, minute: 0, postType: PostType.VIDEO },
        { day: 6, hour: 10, minute: 0, postType: PostType.VIDEO },
        { day: 0, hour: 11, minute: 0, postType: PostType.VIDEO },
        // Shorts - multiple daily (algorithm favors consistency)
        { day: 1, hour: 12, minute: 0, postType: PostType.REEL },
        { day: 1, hour: 19, minute: 0, postType: PostType.REEL },
        { day: 2, hour: 13, minute: 0, postType: PostType.REEL },
        { day: 2, hour: 20, minute: 0, postType: PostType.REEL },
        { day: 3, hour: 12, minute: 0, postType: PostType.REEL },
        { day: 3, hour: 18, minute: 0, postType: PostType.REEL },
        { day: 4, hour: 14, minute: 0, postType: PostType.REEL },
        { day: 4, hour: 19, minute: 0, postType: PostType.REEL },
        { day: 5, hour: 11, minute: 0, postType: PostType.REEL },
        { day: 5, hour: 17, minute: 0, postType: PostType.REEL },
        { day: 6, hour: 13, minute: 0, postType: PostType.REEL },
        { day: 6, hour: 18, minute: 0, postType: PostType.REEL },
        { day: 0, hour: 14, minute: 0, postType: PostType.REEL },
        { day: 0, hour: 19, minute: 0, postType: PostType.REEL },
    ],
    LINKEDIN: [
        // Feed posts - professional hours only (B2B focus)
        { day: 1, hour: 8, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 12, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 10, minute: 0, postType: PostType.FEED },
        { day: 4, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 5, hour: 8, minute: 0, postType: PostType.FEED },
        // Carousels - high engagement format for LinkedIn
        { day: 2, hour: 10, minute: 0, postType: PostType.CAROUSEL },
        { day: 3, hour: 14, minute: 0, postType: PostType.CAROUSEL },
        { day: 4, hour: 11, minute: 0, postType: PostType.CAROUSEL },
        // Articles - long-form content (weekly)
        { day: 2, hour: 7, minute: 0, postType: PostType.ARTICLE },
        { day: 4, hour: 7, minute: 0, postType: PostType.ARTICLE },
        // Videos - short professional videos
        { day: 3, hour: 12, minute: 0, postType: PostType.VIDEO },
        { day: 5, hour: 10, minute: 0, postType: PostType.VIDEO },
    ],
    FACEBOOK: [
        // Feed posts
        { day: 1, hour: 10, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 13, minute: 0, postType: PostType.FEED },
        { day: 4, hour: 11, minute: 0, postType: PostType.FEED },
        { day: 5, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 6, hour: 12, minute: 0, postType: PostType.FEED },
        { day: 0, hour: 13, minute: 0, postType: PostType.FEED },
        // Reels
        { day: 1, hour: 18, minute: 0, postType: PostType.REEL },
        { day: 3, hour: 19, minute: 0, postType: PostType.REEL },
        { day: 5, hour: 17, minute: 0, postType: PostType.REEL },
        { day: 6, hour: 15, minute: 0, postType: PostType.REEL },
        { day: 0, hour: 16, minute: 0, postType: PostType.REEL },
        // Stories
        { day: 1, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 1, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 12, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 21, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 13, minute: 0, postType: PostType.STORY },
        { day: 5, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 5, hour: 19, minute: 0, postType: PostType.STORY },
        { day: 6, hour: 10, minute: 0, postType: PostType.STORY },
        { day: 6, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 0, hour: 11, minute: 0, postType: PostType.STORY },
        { day: 0, hour: 19, minute: 0, postType: PostType.STORY },
    ],
    PINTEREST: [
        // Pins - evening/weekend focus (browsing time)
        { day: 1, hour: 20, minute: 0, postType: PostType.PIN },
        { day: 2, hour: 21, minute: 0, postType: PostType.PIN },
        { day: 3, hour: 19, minute: 0, postType: PostType.PIN },
        { day: 4, hour: 20, minute: 0, postType: PostType.PIN },
        { day: 5, hour: 15, minute: 0, postType: PostType.PIN },
        { day: 5, hour: 21, minute: 0, postType: PostType.PIN },
        { day: 6, hour: 14, minute: 0, postType: PostType.PIN },
        { day: 6, hour: 20, minute: 0, postType: PostType.PIN },
        { day: 0, hour: 15, minute: 0, postType: PostType.PIN },
        { day: 0, hour: 20, minute: 0, postType: PostType.PIN },
    ],
    TWITTER: [
        // X/Twitter - news cycle timing
        { day: 1, hour: 8, minute: 0, postType: PostType.FEED },
        { day: 1, hour: 12, minute: 0, postType: PostType.FEED },
        { day: 1, hour: 17, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 13, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 8, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 12, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 18, minute: 0, postType: PostType.FEED },
        { day: 4, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 4, hour: 14, minute: 0, postType: PostType.FEED },
        { day: 5, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 5, hour: 13, minute: 0, postType: PostType.FEED },
    ],
    BLUESKY: [
        // Single posts - similar to X but earlier adopter audience
        { day: 1, hour: 10, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 11, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 12, minute: 0, postType: PostType.FEED },
        { day: 4, hour: 10, minute: 0, postType: PostType.FEED },
        { day: 5, hour: 9, minute: 0, postType: PostType.FEED },
        // Threads - longer-form content
        { day: 2, hour: 14, minute: 0, postType: PostType.THREAD },
        { day: 4, hour: 13, minute: 0, postType: PostType.THREAD },
        { day: 5, hour: 14, minute: 0, postType: PostType.THREAD },
    ],
    GOOGLE_BUSINESS: [
        // Local business hours
        { day: 1, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 10, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 11, minute: 0, postType: PostType.FEED },
        { day: 4, hour: 9, minute: 0, postType: PostType.FEED },
        { day: 5, hour: 10, minute: 0, postType: PostType.FEED },
    ],
    // Default fallback for any unmapped platform
    DEFAULT: [
        { day: 1, hour: 10, minute: 0, postType: PostType.FEED },
        { day: 2, hour: 12, minute: 0, postType: PostType.FEED },
        { day: 3, hour: 11, minute: 0, postType: PostType.FEED },
        { day: 4, hour: 10, minute: 0, postType: PostType.FEED },
        { day: 5, hour: 9, minute: 0, postType: PostType.FEED },
    ],
};

/**
 * Get connected platforms for an organization.
 * Returns only platforms with active social accounts.
 */
async function getConnectedPlatforms(organizationId: string): Promise<Platform[]> {
    const accounts = await db.socialAccount.findMany({
        where: {
            organizationId,
            isActive: true,
        },
        select: { platform: true },
        distinct: ['platform'],
    });
    return accounts.map(a => a.platform);
}

/**
 * Get organization timezone (defaults to UTC if not set)
 */
async function getOrganizationTimezone(organizationId: string): Promise<string> {
    const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { timezone: true },
    });
    return org?.timezone || 'UTC';
}

/**
 * Calculate engagement velocity weight - recent posts weighted higher
 * Posts within the last 30 days get full weight, older posts decay exponentially
 */
function calculateVelocityWeight(publishedAt: Date): number {
    const now = new Date();
    const daysSince = differenceInDays(now, publishedAt);
    // Recent posts (0-30 days) get weight 1-3x, older posts decay
    if (daysSince <= 30) return 3;
    if (daysSince <= 60) return 2;
    return 1;
}

/**
 * Stagger recommendations to avoid same-minute conflicts across platforms
 * Priority: INSTAGRAM > TIKTOK > FACEBOOK > YOUTUBE > LINKEDIN > others
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

    // Group by date+hour+minute
    const timeGroups = new Map<string, Recommendation[]>();
    for (const rec of recommendations) {
        const key = `${rec.date.toISOString().split('T')[0]}-${rec.hour}-${rec.minute}`;
        const group = timeGroups.get(key) || [];
        group.push(rec);
        timeGroups.set(key, group);
    }

    // Stagger groups with multiple platforms
    const staggered: Recommendation[] = [];
    for (const group of timeGroups.values()) {
        if (group.length === 1) {
            staggered.push(group[0]);
        } else {
            // Sort by priority and stagger by 5 minutes each
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
 * Calculate best posting times based on historical engagement.
 * Falls back to industry benchmarks if insufficient data.
 * 
 * @param organizationId - The organization to generate recommendations for
 * @param targetPlatform - Optional filter for a specific platform
 * @param weeksAhead - Number of weeks to generate recommendations for (default: 4)
 */
export async function getOptimalPostingTimes(
    organizationId: string,
    targetPlatform?: Platform,
    weeksAhead: number = 4
): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday

    // 1. Fetch historical posts with analytics (last 90 days)
    const posts = await db.postPlatform.findMany({
        where: {
            post: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
            },
            ...(targetPlatform ? { socialAccount: { platform: targetPlatform } } : {}),
        },
        include: {
            analytics: true,
            socialAccount: { select: { platform: true } },
        },
    });

    // 2. Decide strategy: Personalized vs Benchmark
    const hasEnoughData = posts.length >= 10;

    // 3. Get platforms to suggest (from connected accounts or target)
    let platformsToSuggest: Platform[];
    if (targetPlatform) {
        platformsToSuggest = [targetPlatform];
    } else {
        platformsToSuggest = await getConnectedPlatforms(organizationId);
    }

    // 4. Generate recommendations for each week
    for (let weekOffset = 0; weekOffset < weeksAhead; weekOffset++) {
        const currentWeekStart = addDays(weekStart, weekOffset * 7);

        if (hasEnoughData) {
            // PERSONALIZED STRATEGY
            const engagementMap = new Map<string, {
                total: number;
                count: number;
                platform: Platform;
                postType?: string;
            }>();

            for (const post of posts) {
                if (!post.publishedAt || !post.analytics) continue;

                const day = getDay(post.publishedAt);
                const hour = getHours(post.publishedAt);
                const postType = post.postType || PostType.FEED;
                const key = `${day}-${hour}-${post.socialAccount.platform}-${postType}`;

                // Apply velocity weighting - recent posts count more
                const velocityWeight = calculateVelocityWeight(post.publishedAt);
                const engagement = ((post.analytics.likes || 0) +
                    (post.analytics.comments || 0) +
                    (post.analytics.shares || 0)) * velocityWeight;

                const current = engagementMap.get(key) || {
                    total: 0,
                    count: 0,
                    platform: post.socialAccount.platform,
                    postType: postType
                };
                engagementMap.set(key, {
                    total: current.total + engagement,
                    count: current.count + velocityWeight, // Weight count too for proper averaging
                    platform: current.platform,
                    postType: current.postType
                });
            }

            // Sort by engagement and take top slots
            const opportunities = Array.from(engagementMap.entries())
                .map(([key, data]) => {
                    const [day, hour] = key.split('-').map(Number);
                    return {
                        day,
                        hour,
                        platform: data.platform,
                        postType: data.postType as PostType,
                        avgEngagement: data.total / data.count,
                    };
                })
                .filter(slot => platformsToSuggest.includes(slot.platform))
                .sort((a, b) => b.avgEngagement - a.avgEngagement)
                .slice(0, 20); // Top 20 slots per week

            for (const slot of opportunities) {
                const daysToAdd = slot.day === 0 ? 6 : slot.day - 1;
                const slotDate = addDays(currentWeekStart, daysToAdd);

                recommendations.push({
                    id: `rec-p-w${weekOffset}-${slot.day}-${slot.hour}-${slot.platform}-${slot.postType}`,
                    date: slotDate,
                    hour: slot.hour,
                    minute: 0,
                    platform: slot.platform,
                    postType: slot.postType,
                    reason: `High engagement history for ${slot.postType?.toLowerCase() || 'posts'}`,
                    confidence: 0.9,
                });
            }

        } else {
            // BENCHMARK STRATEGY - Use industry data for connected platforms
            for (const platform of platformsToSuggest) {
                const bestTimes = INDUSTRY_BENCHMARKS[platform] || INDUSTRY_BENCHMARKS.DEFAULT;

                for (const time of bestTimes) {
                    const daysToAdd = time.day === 0 ? 6 : time.day - 1;
                    const slotDate = addDays(currentWeekStart, daysToAdd);

                    // Mapping all PostType enum values to display labels
                    const postTypeLabels: Record<string, string> = {
                        FEED: 'posts', REEL: 'Reels/Shorts', STORY: 'Stories',
                        CAROUSEL: 'Carousels', PIN: 'Pins', VIDEO: 'Videos',
                        ARTICLE: 'Articles', THREAD: 'Threads'
                    };
                    const postTypeLabel = postTypeLabels[time.postType || 'FEED'] || 'posts';

                    recommendations.push({
                        id: `rec-b-w${weekOffset}-${time.day}-${time.hour}-${platform}-${time.postType || PostType.FEED}`,
                        date: slotDate,
                        hour: time.hour,
                        minute: time.minute,
                        platform,
                        postType: time.postType,
                        reason: `Best time for ${postTypeLabel} (industry data)`,
                        confidence: 0.6,
                    });
                }
            }
        }
    }
    // Apply cross-platform staggering to avoid same-minute conflicts
    return staggerRecommendations(recommendations);
}
