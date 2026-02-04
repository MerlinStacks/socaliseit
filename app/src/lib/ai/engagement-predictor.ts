/**
 * Engagement Predictor
 * 
 * Predicts expected engagement for different posting times based on
 * historical data and learned patterns from user feedback.
 * 
 * Why: Help users understand expected reach before scheduling,
 * and prioritize recommendations by predicted performance.
 */

import { db } from '@/lib/db';
import { Platform, PostType } from '@/generated/prisma/enums';

export interface EngagementScore {
    day: number;
    hour: number;
    score: number; // 0-100
    confidence: number; // 0-1
    tier: 'excellent' | 'good' | 'average' | 'poor';
}

/**
 * Get predicted engagement score for a specific slot
 */
export async function getPredictedEngagement(
    organizationId: string,
    platform: Platform,
    postType: PostType,
    day: number,
    hour: number
): Promise<EngagementScore | null> {
    const prediction = await db.engagementPrediction.findUnique({
        where: {
            organizationId_platform_postType_day_hour: {
                organizationId,
                platform,
                postType,
                day,
                hour
            }
        }
    });

    if (!prediction) return null;

    return {
        day,
        hour,
        score: prediction.predictedScore,
        confidence: prediction.confidence,
        tier: getScoreTier(prediction.predictedScore)
    };
}

/**
 * Get top predicted slots for a platform/post type
 */
export async function getTopPredictedSlots(
    organizationId: string,
    platform: Platform,
    postType: PostType = PostType.FEED,
    limit: number = 10
): Promise<EngagementScore[]> {
    const predictions = await db.engagementPrediction.findMany({
        where: {
            organizationId,
            platform,
            postType,
            confidence: { gte: 0.2 } // Only use slots with enough data
        },
        orderBy: { predictedScore: 'desc' },
        take: limit
    });

    return predictions.map(p => ({
        day: p.day,
        hour: p.hour,
        score: p.predictedScore,
        confidence: p.confidence,
        tier: getScoreTier(p.predictedScore)
    }));
}

/**
 * Get engagement heatmap for visualization
 */
export async function getEngagementHeatmap(
    organizationId: string,
    platform: Platform,
    postType: PostType = PostType.FEED
): Promise<Map<string, EngagementScore>> {
    const predictions = await db.engagementPrediction.findMany({
        where: {
            organizationId,
            platform,
            postType
        }
    });

    const heatmap = new Map<string, EngagementScore>();

    for (const p of predictions) {
        heatmap.set(`${p.day}-${p.hour}`, {
            day: p.day,
            hour: p.hour,
            score: p.predictedScore,
            confidence: p.confidence,
            tier: getScoreTier(p.predictedScore)
        });
    }

    return heatmap;
}

/**
 * Calculate initial predictions based on historical post performance
 * Call this to bootstrap predictions for new organizations
 */
export async function bootstrapPredictions(organizationId: string): Promise<{
    slotsAnalyzed: number;
    predictionsCreated: number;
}> {
    // Get published posts with analytics
    const postPlatforms = await db.postPlatform.findMany({
        where: {
            post: {
                organizationId,
                status: 'PUBLISHED'
            },
            publishedAt: { not: null },
            analytics: { isNot: null }
        },
        include: {
            analytics: true,
            socialAccount: { select: { platform: true } }
        }
    });

    // Group by platform + postType + day + hour
    const slotMap = new Map<string, {
        platform: Platform;
        postType: PostType;
        day: number;
        hour: number;
        totalEngagement: number;
        count: number;
    }>();

    for (const pp of postPlatforms) {
        if (!pp.publishedAt || !pp.analytics) continue;

        const day = pp.publishedAt.getDay();
        const hour = pp.publishedAt.getHours();
        const key = `${pp.socialAccount.platform}-${pp.postType}-${day}-${hour}`;

        const engagement = (pp.analytics.likes || 0) +
            (pp.analytics.comments || 0) +
            (pp.analytics.shares || 0);

        const current = slotMap.get(key) || {
            platform: pp.socialAccount.platform,
            postType: pp.postType,
            day,
            hour,
            totalEngagement: 0,
            count: 0
        };

        slotMap.set(key, {
            ...current,
            totalEngagement: current.totalEngagement + engagement,
            count: current.count + 1
        });
    }

    // Normalize to 0-100 scores and create predictions
    const maxAvg = Math.max(...Array.from(slotMap.values()).map(v => v.totalEngagement / v.count), 1);
    let predictionsCreated = 0;

    for (const slot of slotMap.values()) {
        const avgEngagement = slot.totalEngagement / slot.count;
        const normalizedScore = (avgEngagement / maxAvg) * 100;
        const confidence = Math.min(0.8, 0.1 + (slot.count * 0.1));

        await db.engagementPrediction.upsert({
            where: {
                organizationId_platform_postType_day_hour: {
                    organizationId,
                    platform: slot.platform,
                    postType: slot.postType,
                    day: slot.day,
                    hour: slot.hour
                }
            },
            create: {
                organizationId,
                platform: slot.platform,
                postType: slot.postType,
                day: slot.day,
                hour: slot.hour,
                predictedScore: normalizedScore,
                confidence,
                sampleSize: slot.count
            },
            update: {
                predictedScore: normalizedScore,
                confidence,
                sampleSize: slot.count,
                lastUpdated: new Date()
            }
        });
        predictionsCreated++;
    }

    return {
        slotsAnalyzed: postPlatforms.length,
        predictionsCreated
    };
}

/**
 * Get score tier label
 */
function getScoreTier(score: number): 'excellent' | 'good' | 'average' | 'poor' {
    if (score >= 75) return 'excellent';
    if (score >= 50) return 'good';
    if (score >= 25) return 'average';
    return 'poor';
}
