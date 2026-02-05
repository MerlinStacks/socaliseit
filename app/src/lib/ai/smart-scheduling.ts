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

/**
 * Generate a random minute offset for organic-looking post times.
 * Avoids :00 to look less robotic. Favors common "natural" intervals.
 */
function getRandomMinute(): number {
    // Favor natural-looking minute values: 3, 7, 12, 17, 23, 27, 33, 37, 42, 47, 52, 57
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

/**
 * Extended benchmarks with multiple posts per day, post types, and all 7 days.
 * Sources: SproutSocial/Hootsuite/Later 2024-2026 benchmarks
 */
const INDUSTRY_BENCHMARKS: Record<string, TimeSlot[]> = {
    INSTAGRAM: [
        // Feed posts - 2026 peaks: Thu 9AM (#1), Wed 12PM/6PM, morning windows
        // Sources: Buffer, SproutSocial, Hootsuite 2026 benchmarks
        { day: 4, hour: 9, minute: 0, postType: PostType.FEED },  // Thu 9AM - Primary peak
        { day: 3, hour: 12, minute: 0, postType: PostType.FEED }, // Wed 12PM - High engagement
        { day: 3, hour: 18, minute: 0, postType: PostType.FEED }, // Wed 6PM - Evening peak
        { day: 1, hour: 15, minute: 0, postType: PostType.FEED }, // Mon 3PM
        { day: 2, hour: 10, minute: 0, postType: PostType.FEED }, // Tue 10AM
        { day: 5, hour: 15, minute: 0, postType: PostType.FEED }, // Fri 3PM - Pre-weekend
        { day: 6, hour: 10, minute: 0, postType: PostType.FEED }, // Sat 10AM
        { day: 0, hour: 10, minute: 0, postType: PostType.FEED }, // Sun 10AM
        // Carousels - high engagement format (2-3x regular posts)
        { day: 4, hour: 12, minute: 0, postType: PostType.CAROUSEL }, // Thu noon
        { day: 2, hour: 11, minute: 0, postType: PostType.CAROUSEL }, // Tue 11AM
        { day: 3, hour: 14, minute: 0, postType: PostType.CAROUSEL }, // Wed 2PM
        { day: 1, hour: 12, minute: 0, postType: PostType.CAROUSEL }, // Mon noon
        { day: 5, hour: 11, minute: 0, postType: PostType.CAROUSEL }, // Fri 11AM
        { day: 6, hour: 12, minute: 0, postType: PostType.CAROUSEL }, // Sat noon
        { day: 0, hour: 12, minute: 0, postType: PostType.CAROUSEL }, // Sun noon
        // Reels - evening window 6PM-11PM (highest engagement for short video)
        { day: 1, hour: 20, minute: 0, postType: PostType.REEL }, // Mon 8PM
        { day: 2, hour: 19, minute: 0, postType: PostType.REEL }, // Tue 7PM
        { day: 3, hour: 20, minute: 0, postType: PostType.REEL }, // Wed 8PM
        { day: 4, hour: 21, minute: 0, postType: PostType.REEL }, // Thu 9PM - Late evening peak
        { day: 5, hour: 18, minute: 0, postType: PostType.REEL }, // Fri 6PM
        { day: 5, hour: 21, minute: 0, postType: PostType.REEL }, // Fri 9PM
        { day: 6, hour: 19, minute: 0, postType: PostType.REEL }, // Sat 7PM
        { day: 6, hour: 22, minute: 0, postType: PostType.REEL }, // Sat 10PM
        { day: 0, hour: 19, minute: 0, postType: PostType.REEL }, // Sun 7PM
        { day: 0, hour: 22, minute: 0, postType: PostType.REEL }, // Sun 10PM
        // Stories - morning, lunch, evening touchpoints
        { day: 1, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 1, hour: 13, minute: 0, postType: PostType.STORY },
        { day: 1, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 14, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 9, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 13, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 19, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 12, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 5, hour: 9, minute: 0, postType: PostType.STORY },
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
        // 2026 Top peaks: Sun 8PM (#1), Tue 4PM (#2), Wed 5PM (#3)
        // Sources: Gudsho, HopperHQ, TailorBrands 2026 research
        { day: 0, hour: 20, minute: 0, postType: PostType.REEL }, // Sun 8PM - #1 Peak
        { day: 2, hour: 16, minute: 0, postType: PostType.REEL }, // Tue 4PM - #2 Peak
        { day: 3, hour: 17, minute: 0, postType: PostType.REEL }, // Wed 5PM - #3 Peak
        // Mid-week morning window (10-11AM EST)
        { day: 2, hour: 10, minute: 0, postType: PostType.REEL }, // Tue 10AM
        { day: 3, hour: 10, minute: 0, postType: PostType.REEL }, // Wed 10AM
        { day: 4, hour: 9, minute: 0, postType: PostType.REEL },  // Thu 9AM
        // Evening prime time (6PM-10PM)
        { day: 1, hour: 18, minute: 0, postType: PostType.REEL }, // Mon 6PM
        { day: 1, hour: 21, minute: 0, postType: PostType.REEL }, // Mon 9PM
        { day: 2, hour: 19, minute: 0, postType: PostType.REEL }, // Tue 7PM
        { day: 3, hour: 20, minute: 0, postType: PostType.REEL }, // Wed 8PM
        { day: 4, hour: 17, minute: 0, postType: PostType.REEL }, // Thu 5PM
        { day: 4, hour: 20, minute: 0, postType: PostType.REEL }, // Thu 8PM
        { day: 5, hour: 13, minute: 0, postType: PostType.REEL }, // Fri 1PM
        { day: 5, hour: 19, minute: 0, postType: PostType.REEL }, // Fri 7PM - High weekend eve
        { day: 5, hour: 22, minute: 0, postType: PostType.REEL }, // Fri 10PM
        { day: 6, hour: 11, minute: 0, postType: PostType.REEL }, // Sat 11AM
        { day: 6, hour: 18, minute: 0, postType: PostType.REEL }, // Sat 6PM
        { day: 6, hour: 21, minute: 0, postType: PostType.REEL }, // Sat 9PM
        { day: 0, hour: 12, minute: 0, postType: PostType.REEL }, // Sun noon
        { day: 0, hour: 16, minute: 0, postType: PostType.REEL }, // Sun 4PM
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
        // 2026 peaks: 9AM-3PM weekdays, 10AM-6PM weekends
        // Sources: SproutSocial, Sprinklr, SocialPilot 2026 benchmarks
        // Feed posts - weekday business hours
        { day: 1, hour: 9, minute: 0, postType: PostType.FEED },  // Mon 9AM
        { day: 1, hour: 12, minute: 0, postType: PostType.FEED }, // Mon noon
        { day: 2, hour: 8, minute: 0, postType: PostType.FEED },  // Tue 8AM
        { day: 2, hour: 10, minute: 0, postType: PostType.FEED }, // Tue 10AM
        { day: 3, hour: 9, minute: 0, postType: PostType.FEED },  // Wed 9AM - Mid-week peak
        { day: 3, hour: 14, minute: 0, postType: PostType.FEED }, // Wed 2PM
        { day: 4, hour: 9, minute: 0, postType: PostType.FEED },  // Thu 9AM
        { day: 4, hour: 11, minute: 0, postType: PostType.FEED }, // Thu 11AM
        { day: 5, hour: 9, minute: 0, postType: PostType.FEED },  // Fri 9AM
        { day: 5, hour: 13, minute: 0, postType: PostType.FEED }, // Fri 1PM
        // Weekend 10AM-6PM window
        { day: 6, hour: 10, minute: 0, postType: PostType.FEED }, // Sat 10AM
        { day: 6, hour: 14, minute: 0, postType: PostType.FEED }, // Sat 2PM
        { day: 0, hour: 11, minute: 0, postType: PostType.FEED }, // Sun 11AM
        { day: 0, hour: 15, minute: 0, postType: PostType.FEED }, // Sun 3PM
        // Reels/Videos - algorithm prioritizes video content
        { day: 1, hour: 19, minute: 0, postType: PostType.REEL }, // Mon 7PM
        { day: 2, hour: 18, minute: 0, postType: PostType.REEL }, // Tue 6PM
        { day: 3, hour: 20, minute: 0, postType: PostType.REEL }, // Wed 8PM
        { day: 4, hour: 19, minute: 0, postType: PostType.REEL }, // Thu 7PM
        { day: 5, hour: 17, minute: 0, postType: PostType.REEL }, // Fri 5PM
        { day: 6, hour: 16, minute: 0, postType: PostType.REEL }, // Sat 4PM
        { day: 0, hour: 18, minute: 0, postType: PostType.REEL }, // Sun 6PM
        // Stories - bookend the day
        { day: 1, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 1, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 9, minute: 0, postType: PostType.STORY },
        { day: 2, hour: 19, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 3, hour: 21, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 8, minute: 0, postType: PostType.STORY },
        { day: 4, hour: 20, minute: 0, postType: PostType.STORY },
        { day: 5, hour: 9, minute: 0, postType: PostType.STORY },
        { day: 5, hour: 19, minute: 0, postType: PostType.STORY },
        { day: 6, hour: 10, minute: 0, postType: PostType.STORY },
        { day: 6, hour: 18, minute: 0, postType: PostType.STORY },
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
                    minute: getRandomMinute(),
                    platform: slot.platform,
                    postType: slot.postType,
                    reason: `High engagement history for ${slot.postType?.toLowerCase() || 'posts'}`,
                    confidence: 0.9,
                });
            }

            // HYBRID FALLBACK: Add benchmark slots for platforms/postTypes with no personalized data
            // Why: Ensures Instagram and Story postTypes appear even if no historical analytics exist
            const coveredPlatforms = new Set(opportunities.map(o => o.platform));
            const coveredPostTypes = new Set(opportunities.map(o => `${o.platform}-${o.postType}`));

            // Also include platforms from posts without analytics (e.g., synced external posts)
            // Why: External posts may not have analytics yet but the platform IS connected and active
            for (const post of posts) {
                if (post.publishedAt) {
                    coveredPlatforms.add(post.socialAccount.platform);
                }
            }

            for (const platform of platformsToSuggest) {
                const benchmarks = INDUSTRY_BENCHMARKS[platform] || INDUSTRY_BENCHMARKS.DEFAULT;

                // Add benchmark slots for platforms completely missing from personalized data
                if (!coveredPlatforms.has(platform)) {
                    for (const time of benchmarks.slice(0, 5)) { // Max 5 benchmark slots per uncovered platform
                        const daysToAdd = time.day === 0 ? 6 : time.day - 1;
                        const slotDate = addDays(currentWeekStart, daysToAdd);
                        const postTypeLabels: Record<string, string> = {
                            FEED: 'posts', REEL: 'Reels/Shorts', STORY: 'Stories',
                            CAROUSEL: 'Carousels', PIN: 'Pins', VIDEO: 'Videos',
                            ARTICLE: 'Articles', THREAD: 'Threads'
                        };
                        const postTypeLabel = postTypeLabels[time.postType || 'FEED'] || 'posts';

                        recommendations.push({
                            id: `rec-hb-w${weekOffset}-${time.day}-${time.hour}-${platform}-${time.postType || PostType.FEED}`,
                            date: slotDate,
                            hour: time.hour,
                            minute: getRandomMinute(),
                            platform,
                            postType: time.postType,
                            reason: `Best time for ${postTypeLabel} (industry data)`,
                            confidence: 0.6,
                        });
                    }
                } else {
                    // Platform has personalized data but may be missing Story/Reel postTypes
                    // Add ALL Story benchmarks if no Story recommendations exist for this platform
                    // Why: Stories are expected to have multiple touchpoints per day (morning, lunch, evening)
                    const storyKey = `${platform}-${PostType.STORY}`;
                    if (!coveredPostTypes.has(storyKey)) {
                        const storySlots = benchmarks.filter(t => t.postType === PostType.STORY);
                        for (const time of storySlots) {
                            const daysToAdd = time.day === 0 ? 6 : time.day - 1;
                            const slotDate = addDays(currentWeekStart, daysToAdd);
                            recommendations.push({
                                id: `rec-hs-w${weekOffset}-${time.day}-${time.hour}-${platform}-STORY`,
                                date: slotDate,
                                hour: time.hour,
                                minute: getRandomMinute(),
                                platform,
                                postType: PostType.STORY,
                                reason: 'Best time for Stories (industry data)',
                                confidence: 0.6,
                            });
                        }
                        coveredPostTypes.add(storyKey); // Mark AFTER all slots added
                    }

                    // Add Reel benchmarks if no Reel recommendations exist for this platform
                    const reelKey = `${platform}-${PostType.REEL}`;
                    if (!coveredPostTypes.has(reelKey)) {
                        const reelSlots = benchmarks.filter(t => t.postType === PostType.REEL);
                        for (const time of reelSlots) {
                            const daysToAdd = time.day === 0 ? 6 : time.day - 1;
                            const slotDate = addDays(currentWeekStart, daysToAdd);
                            recommendations.push({
                                id: `rec-hr-w${weekOffset}-${time.day}-${time.hour}-${platform}-REEL`,
                                date: slotDate,
                                hour: time.hour,
                                minute: getRandomMinute(),
                                platform,
                                postType: PostType.REEL,
                                reason: 'Best time for Reels/Shorts (industry data)',
                                confidence: 0.6,
                            });
                        }
                        coveredPostTypes.add(reelKey);
                    }
                }
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
                        minute: getRandomMinute(), // Randomize for organic look
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
