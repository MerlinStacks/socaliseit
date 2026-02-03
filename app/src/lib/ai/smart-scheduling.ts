
import { db } from '@/lib/db';
import { Platform } from '@/generated/prisma/enums';
import { startOfWeek, addDays, getDay, getHours, format } from 'date-fns';

export interface TimeSlot {
    day: number; // 0-6 (Sun-Sat)
    hour: number; // 0-23
    minute: number;
}

export interface Recommendation {
    id: string;
    date: Date;
    hour: number;
    minute: number;
    platform: Platform;
    reason: string;
    confidence: number; // 0-1
}

// Fallback data: Best global times for each platform
// Source: SproutSocial/Hootsuite 2024 benchmarks
const INDUSTRY_BENCHMARKS: Record<string, TimeSlot[]> = {
    INSTAGRAM: [
        { day: 1, hour: 9, minute: 0 }, // Mon 9AM
        { day: 2, hour: 19, minute: 0 }, // Tue 7PM
        { day: 5, hour: 12, minute: 0 }, // Fri 12PM
    ],
    TIKTOK: [
        { day: 2, hour: 15, minute: 0 }, // Tue 3PM
        { day: 4, hour: 17, minute: 0 }, // Thu 5PM
        { day: 5, hour: 13, minute: 0 }, // Fri 1PM
    ],
    LINKEDIN: [
        { day: 2, hour: 9, minute: 0 }, // Tue 9AM
        { day: 3, hour: 10, minute: 0 }, // Wed 10AM
        { day: 4, hour: 11, minute: 0 }, // Thu 11AM
    ],
    FACEBOOK: [
        { day: 1, hour: 10, minute: 0 }, // Mon 10AM
        { day: 3, hour: 13, minute: 0 }, // Wed 1PM
        { day: 5, hour: 9, minute: 0 }, // Fri 9AM
    ],
    YOUTUBE: [
        { day: 5, hour: 15, minute: 0 }, // Fri 3PM
        { day: 6, hour: 10, minute: 0 }, // Sat 10AM
        { day: 0, hour: 11, minute: 0 }, // Sun 11AM
    ],
    PINTEREST: [
        { day: 5, hour: 15, minute: 0 }, // Fri 3PM
        { day: 6, hour: 20, minute: 0 }, // Sat 8PM
        { day: 0, hour: 20, minute: 0 }, // Sun 8PM
    ],
    // Default for others (Twitter/X, Bluesky, GMB)
    DEFAULT: [
        { day: 1, hour: 10, minute: 0 },
        { day: 3, hour: 12, minute: 0 },
        { day: 5, hour: 9, minute: 0 },
    ],
};

/**
 * Calculate best posting times based on historical engagement
 * Falls back to industry benchmarks if insufficient data
 */
export async function getOptimalPostingTimes(
    workspaceId: string,
    targetPlatform?: Platform
): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday

    // 1. Fetch historical posts with analytics
    const posts = await db.postPlatform.findMany({
        where: {
            post: {
                workspaceId,
                status: 'PUBLISHED',
                publishedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
            },
            ...(targetPlatform ? { socialAccount: { platform: targetPlatform } } : {}),
        },
        include: {
            analytics: true,
            socialAccount: {
                select: { platform: true }
            }
        },
    });

    // 2. Decide strategy: Personalized vs Benchmark
    const hasEnoughData = posts.length >= 10;

    if (hasEnoughData) {
        // PERSONALIZED STRATEGY
        // Group posts by day/hour and calc avg engagement
        // This is a simplified heuristic
        const engagementMap = new Map<string, { total: number; count: number; platform: Platform }>();

        for (const post of posts) {
            if (!post.publishedAt || !post.analytics) continue;

            const day = getDay(post.publishedAt);
            const hour = getHours(post.publishedAt);
            const key = `${day}-${hour}-${post.socialAccount.platform}`;

            const engagement = (post.analytics.likes || 0) + (post.analytics.comments || 0) + (post.analytics.shares || 0);

            const current = engagementMap.get(key) || { total: 0, count: 0, platform: post.socialAccount.platform };
            engagementMap.set(key, {
                total: current.total + engagement,
                count: current.count + 1,
                platform: current.platform
            });
        }

        // Convert map to array and sort
        const opportunities = Array.from(engagementMap.entries())
            .map(([key, data]) => {
                const [day, hour] = key.split('-').map(Number);
                return {
                    day,
                    hour,
                    platform: data.platform,
                    avgEngagement: data.total / data.count,
                };
            })
            .sort((a, b) => b.avgEngagement - a.avgEngagement)
            .slice(0, 10); // Top 10 slots

        // Map to actual dates for this week
        for (const slot of opportunities) {
            // Find date for this day index in current week
            // date-fns day index: 0=Sun, 1=Mon...6=Sat
            const normalizedDayIndex = slot.day === 0 ? 6 : slot.day - 1; // Convert to Mon=0...Sun=6 if needed by addDays logic from Monday? 
            // Actually startOfWeek(..., {weekStartsOn: 1}) makes Mon=0 index if iterating? 
            // No, Date.getDay() always returns 0 for Sunday.

            // We need to map 0(Sun)->6, 1(Mon)->0, etc for addDays from Monday
            // If we used startOfWeek with Monday:
            const daysToAdd = slot.day === 0 ? 6 : slot.day - 1;
            const slotDate = addDays(weekStart, daysToAdd);

            recommendations.push({
                id: `rec-p-${slot.day}-${slot.hour}-${slot.platform}`,
                date: slotDate,
                hour: slot.hour,
                minute: 0, // Simplified to top of hour
                platform: slot.platform,
                reason: 'High engagement history',
                confidence: 0.9,
            });
        }

    } else {
        // BENCHMARK STRATEGY
        // If specific platform requested, use its benchmarks
        // If no platform, iterate all active platforms in workspace? 
        // For now, let's just return benchmarks for the requested platform or all major ones if universal.

        let platformsToSuggest: Platform[] = [];
        if (targetPlatform) {
            platformsToSuggest = [targetPlatform];
        } else {
            // In a real app we might verify which platforms the workspace actually has connected
            platformsToSuggest = [
                Platform.INSTAGRAM,
                Platform.TIKTOK,
                Platform.LINKEDIN,
                Platform.FACEBOOK
            ];
        }

        for (const platform of platformsToSuggest) {
            const bestTimes = INDUSTRY_BENCHMARKS[platform] || INDUSTRY_BENCHMARKS.DEFAULT;

            for (const time of bestTimes) {
                // date-fns day index: 0=Sun, 1=Mon...6=Sat
                const daysToAdd = time.day === 0 ? 6 : time.day - 1;
                const slotDate = addDays(weekStart, daysToAdd);

                recommendations.push({
                    id: `rec-b-${time.day}-${time.hour}-${platform}`,
                    date: slotDate,
                    hour: time.hour,
                    minute: time.minute,
                    platform,
                    reason: 'Industry best practice',
                    confidence: 0.6,
                });
            }
        }
    }

    // Deduplicate: If multiple platforms recommend same hour, maybe slightly shift or just allow overlap?
    // User asked for "when we are meant to be posting and when per platform". 
    // Overlap is fine, it means "Post everywhere now".

    return recommendations;
}
