/**
 * Content Performance Prediction Service
 * AI-powered scoring system to predict engagement before posting.
 *
 * Why: Helps users optimize content before publishing by predicting
 * performance based on historical patterns and content analysis.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface PredictionInput {
    organizationId: string;
    caption: string;
    platforms: string[];
    hashtags: string[];
    hasMedia: boolean;
    mediaType?: 'image' | 'video' | 'carousel';
    scheduledHour?: number;
    scheduledDayOfWeek?: number;
}

export interface PredictionResult {
    overallScore: number; // 0-100
    platformScores: Record<string, number>;
    factors: PredictionFactor[];
    recommendations: string[];
    confidence: number; // 0-1
}

export interface PredictionFactor {
    name: string;
    score: number;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
}

// ============================================================================
// HISTORICAL PATTERN ANALYSIS
// ============================================================================

interface HistoricalPatterns {
    avgEngagementByHour: Record<number, number>;
    avgEngagementByDay: Record<number, number>;
    avgEngagementByPlatform: Record<string, number>;
    topPerformingHashtags: string[];
    avgCaptionLength: number;
    mediaTypePerformance: Record<string, number>;
}

/**
 * Analyze historical post performance to build pattern model.
 */
async function analyzeHistoricalPatterns(
    organizationId: string
): Promise<HistoricalPatterns> {
    // Fetch last 90 days of posts with analytics
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            publishedAt: { gte: ninetyDaysAgo },
        },
        include: {
            platforms: {
                include: {
                    analytics: true,
                    socialAccount: true,
                },
            },
            hashtags: {
                include: { hashtag: true },
            },
            media: {
                include: { media: true },
            },
        },
    });

    // Initialize pattern collectors
    const hourEngagement: Record<number, { total: number; count: number }> = {};
    const dayEngagement: Record<number, { total: number; count: number }> = {};
    const platformEngagement: Record<string, { total: number; count: number }> = {};
    const hashtagPerformance: Record<string, { total: number; count: number }> = {};
    const mediaTypePerf: Record<string, { total: number; count: number }> = {};
    let totalCaptionLength = 0;

    // Process each post
    posts.forEach((post) => {
        const publishedAt = post.publishedAt;
        if (!publishedAt) return;

        const hour = publishedAt.getHours();
        const day = publishedAt.getDay();

        post.platforms.forEach((pp) => {
            const engagement = pp.analytics?.engagementRate ?? 0;
            const platform = pp.socialAccount.platform;

            // Hour patterns
            if (!hourEngagement[hour]) {
                hourEngagement[hour] = { total: 0, count: 0 };
            }
            hourEngagement[hour].total += engagement;
            hourEngagement[hour].count += 1;

            // Day patterns
            if (!dayEngagement[day]) {
                dayEngagement[day] = { total: 0, count: 0 };
            }
            dayEngagement[day].total += engagement;
            dayEngagement[day].count += 1;

            // Platform patterns
            if (!platformEngagement[platform]) {
                platformEngagement[platform] = { total: 0, count: 0 };
            }
            platformEngagement[platform].total += engagement;
            platformEngagement[platform].count += 1;

            // Hashtag patterns
            post.hashtags.forEach((ph) => {
                const tag = ph.hashtag.tag;
                if (!hashtagPerformance[tag]) {
                    hashtagPerformance[tag] = { total: 0, count: 0 };
                }
                hashtagPerformance[tag].total += engagement;
                hashtagPerformance[tag].count += 1;
            });
        });

        // Media type patterns - derive from mimeType
        let mediaType: string = 'none';
        if (post.media.length > 1) {
            mediaType = 'carousel';
        } else if (post.media[0]?.media?.mimeType) {
            const mime = post.media[0].media.mimeType;
            if (mime.startsWith('video/')) mediaType = 'video';
            else if (mime.startsWith('image/')) mediaType = 'image';
            else mediaType = 'other';
        }
        if (!mediaTypePerf[mediaType]) {
            mediaTypePerf[mediaType] = { total: 0, count: 0 };
        }
        const avgEngagement =
            post.platforms.reduce((sum, p) => sum + (p.analytics?.engagementRate ?? 0), 0) /
            Math.max(post.platforms.length, 1);
        mediaTypePerf[mediaType].total += avgEngagement;
        mediaTypePerf[mediaType].count += 1;

        totalCaptionLength += post.caption.length;
    });

    // Calculate averages
    const avgEngagementByHour: Record<number, number> = {};
    Object.entries(hourEngagement).forEach(([hour, data]) => {
        avgEngagementByHour[parseInt(hour)] = data.count > 0 ? data.total / data.count : 0;
    });

    const avgEngagementByDay: Record<number, number> = {};
    Object.entries(dayEngagement).forEach(([day, data]) => {
        avgEngagementByDay[parseInt(day)] = data.count > 0 ? data.total / data.count : 0;
    });

    const avgEngagementByPlatform: Record<string, number> = {};
    Object.entries(platformEngagement).forEach(([platform, data]) => {
        avgEngagementByPlatform[platform] = data.count > 0 ? data.total / data.count : 0;
    });

    // Top performing hashtags
    const sortedHashtags = Object.entries(hashtagPerformance)
        .map(([tag, data]) => ({
            tag,
            avgEngagement: data.count > 3 ? data.total / data.count : 0,
        }))
        .filter((h) => h.avgEngagement > 0)
        .sort((a, b) => b.avgEngagement - a.avgEngagement)
        .slice(0, 20)
        .map((h) => h.tag);

    const mediaTypePerformance: Record<string, number> = {};
    Object.entries(mediaTypePerf).forEach(([type, data]) => {
        mediaTypePerformance[type] = data.count > 0 ? data.total / data.count : 0;
    });

    return {
        avgEngagementByHour,
        avgEngagementByDay,
        avgEngagementByPlatform,
        topPerformingHashtags: sortedHashtags,
        avgCaptionLength: posts.length > 0 ? totalCaptionLength / posts.length : 150,
        mediaTypePerformance,
    };
}

// ============================================================================
// PREDICTION ENGINE
// ============================================================================

/**
 * Generate a predicted engagement score for a post.
 */
export async function predictContentScore(
    input: PredictionInput
): Promise<PredictionResult> {
    try {
        const patterns = await analyzeHistoricalPatterns(input.organizationId);
        const factors: PredictionFactor[] = [];
        const recommendations: string[] = [];

        // 1. Caption Analysis
        const captionScore = analyzeCaptions(input.caption, patterns.avgCaptionLength);
        factors.push(captionScore.factor);
        if (captionScore.recommendation) {
            recommendations.push(captionScore.recommendation);
        }

        // 2. Timing Analysis
        if (input.scheduledHour !== undefined) {
            const timingScore = analyzeTiming(
                input.scheduledHour,
                input.scheduledDayOfWeek ?? new Date().getDay(),
                patterns
            );
            factors.push(timingScore.factor);
            if (timingScore.recommendation) {
                recommendations.push(timingScore.recommendation);
            }
        }

        // 3. Hashtag Analysis
        const hashtagScore = analyzeHashtags(input.hashtags, patterns.topPerformingHashtags);
        factors.push(hashtagScore.factor);
        if (hashtagScore.recommendation) {
            recommendations.push(hashtagScore.recommendation);
        }

        // 4. Media Analysis
        const mediaScore = analyzeMedia(
            input.hasMedia,
            input.mediaType,
            patterns.mediaTypePerformance
        );
        factors.push(mediaScore.factor);
        if (mediaScore.recommendation) {
            recommendations.push(mediaScore.recommendation);
        }

        // 5. Platform-specific scores
        const platformScores: Record<string, number> = {};
        input.platforms.forEach((platform) => {
            const platformAvg = patterns.avgEngagementByPlatform[platform] ?? 2;
            const baseScore = Math.min(100, platformAvg * 20); // Normalize to 0-100
            platformScores[platform] = Math.round(baseScore);
        });

        // Calculate overall score
        const factorAverage =
            factors.reduce((sum, f) => sum + f.score, 0) / Math.max(factors.length, 1);
        const overallScore = Math.round(Math.min(100, Math.max(0, factorAverage)));

        // Confidence based on historical data volume
        const confidence = Math.min(1, factors.length / 4);

        return {
            overallScore,
            platformScores,
            factors,
            recommendations: recommendations.slice(0, 3), // Limit to top 3
            confidence,
        };
    } catch (error) {
        logger.error({ error, organizationId: input.organizationId }, 'Error predicting content score');

        // Return neutral prediction on error
        return {
            overallScore: 50,
            platformScores: {},
            factors: [],
            recommendations: ['Unable to generate predictions. Try publishing more content first.'],
            confidence: 0,
        };
    }
}

// ============================================================================
// FACTOR ANALYZERS
// ============================================================================

function analyzeCaptions(
    caption: string,
    avgLength: number
): { factor: PredictionFactor; recommendation?: string } {
    const length = caption.length;
    const hasEmoji = /\p{Emoji}/u.test(caption);
    const hasCTA =
        /\b(click|tap|link|bio|shop|buy|learn|discover|check out|comment|share|save)\b/i.test(caption);
    const hasQuestion = /\?/.test(caption);

    let score = 50;
    let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
    const bonuses: string[] = [];

    // Length scoring
    const lengthDiff = Math.abs(length - avgLength);
    if (lengthDiff < 50) {
        score += 10;
    } else if (lengthDiff > 200) {
        score -= 10;
    }

    // Engagement elements
    if (hasEmoji) {
        score += 5;
        bonuses.push('emojis');
    }
    if (hasCTA) {
        score += 15;
        bonuses.push('call-to-action');
    }
    if (hasQuestion) {
        score += 10;
        bonuses.push('question');
    }

    // Determine impact
    if (score >= 70) impact = 'positive';
    else if (score < 40) impact = 'negative';

    const recommendation =
        !hasCTA && !hasQuestion
            ? 'Add a call-to-action or question to encourage engagement'
            : undefined;

    return {
        factor: {
            name: 'Caption Quality',
            score: Math.min(100, score),
            impact,
            description:
                bonuses.length > 0 ? `Includes ${bonuses.join(', ')}` : 'Standard caption structure',
        },
        recommendation,
    };
}

function analyzeTiming(
    hour: number,
    dayOfWeek: number,
    patterns: HistoricalPatterns
): { factor: PredictionFactor; recommendation?: string } {
    const hourAvg = patterns.avgEngagementByHour[hour] ?? 0;
    const dayAvg = patterns.avgEngagementByDay[dayOfWeek] ?? 0;

    // Find best times (with safe defaults for empty patterns)
    const sortedHours = Object.entries(patterns.avgEngagementByHour).sort(
        (a, b) => b[1] - a[1]
    );
    const sortedDays = Object.entries(patterns.avgEngagementByDay).sort((a, b) => b[1] - a[1]);
    const bestHour = sortedHours[0] ?? ['12', 0]; // Default: noon
    const bestDay = sortedDays[0] ?? ['3', 0]; // Default: Wednesday

    const avgEngagement =
        Object.values(patterns.avgEngagementByHour).reduce((a, b) => a + b, 0) /
        Math.max(Object.keys(patterns.avgEngagementByHour).length, 1);

    const timingScore = ((hourAvg + dayAvg) / 2 / Math.max(avgEngagement, 0.01)) * 50;
    const normalizedScore = Math.min(100, Math.max(0, timingScore));

    const impact: 'positive' | 'negative' | 'neutral' =
        normalizedScore >= 60 ? 'positive' : normalizedScore < 40 ? 'negative' : 'neutral';

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const recommendation =
        normalizedScore < 50
            ? `Consider posting on ${dayNames[parseInt(bestDay[0])]} at ${bestHour[0]}:00 for better engagement`
            : undefined;

    return {
        factor: {
            name: 'Posting Time',
            score: normalizedScore,
            impact,
            description:
                impact === 'positive'
                    ? 'Optimal posting time based on your audience'
                    : 'Your audience may be less active at this time',
        },
        recommendation,
    };
}

function analyzeHashtags(
    hashtags: string[],
    topPerforming: string[]
): { factor: PredictionFactor; recommendation?: string } {
    if (hashtags.length === 0) {
        return {
            factor: {
                name: 'Hashtags',
                score: 30,
                impact: 'negative',
                description: 'No hashtags used',
            },
            recommendation: 'Add relevant hashtags to improve discoverability',
        };
    }

    const topMatches = hashtags.filter((h) =>
        topPerforming.some((t) => t.toLowerCase() === h.toLowerCase())
    );

    const matchRatio = topMatches.length / Math.min(hashtags.length, 10);
    const score = 40 + matchRatio * 60;

    const impact: 'positive' | 'negative' | 'neutral' =
        score >= 60 ? 'positive' : score < 40 ? 'negative' : 'neutral';

    const recommendation =
        topMatches.length === 0 && topPerforming.length > 0
            ? `Try using high-performing hashtags like #${topPerforming[0]}`
            : undefined;

    return {
        factor: {
            name: 'Hashtags',
            score: Math.round(score),
            impact,
            description:
                topMatches.length > 0
                    ? `${topMatches.length} high-performing hashtags used`
                    : `${hashtags.length} hashtags used`,
        },
        recommendation,
    };
}

function analyzeMedia(
    hasMedia: boolean,
    mediaType: string | undefined,
    typePerformance: Record<string, number>
): { factor: PredictionFactor; recommendation?: string } {
    if (!hasMedia) {
        return {
            factor: {
                name: 'Media',
                score: 20,
                impact: 'negative',
                description: 'No media attached',
            },
            recommendation: 'Add images or video for significantly higher engagement',
        };
    }

    const typeScore = typePerformance[mediaType ?? 'image'] ?? 2;
    const avgScore =
        Object.values(typePerformance).reduce((a, b) => a + b, 0) /
        Math.max(Object.values(typePerformance).length, 1);

    const normalizedScore = Math.min(100, (typeScore / Math.max(avgScore, 0.01)) * 50);

    const sortedTypes = Object.entries(typePerformance).sort((a, b) => b[1] - a[1]);
    const bestType = sortedTypes[0] ?? ['image', 0]; // Default fallback

    const impact: 'positive' | 'negative' | 'neutral' =
        normalizedScore >= 60 ? 'positive' : normalizedScore < 40 ? 'negative' : 'neutral';

    const recommendation =
        bestType && bestType[0] !== mediaType
            ? `${bestType[0].charAt(0).toUpperCase() + bestType[0].slice(1)} content typically performs better for your account`
            : undefined;

    return {
        factor: {
            name: 'Media Type',
            score: Math.round(normalizedScore),
            impact,
            description: `${mediaType ?? 'image'} content`,
        },
        recommendation,
    };
}
