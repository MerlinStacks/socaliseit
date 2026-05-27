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
    postType?: string;
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
    totalPosts: number;
    bestHour?: number;
    bestDay?: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PLATFORM_DEFAULTS: Record<string, {
    captionMin: number;
    captionMax: number;
    hashtagMin: number;
    hashtagMax: number;
    preferredMedia: Array<'video' | 'carousel' | 'image'>;
}> = {
    instagram: { captionMin: 80, captionMax: 220, hashtagMin: 5, hashtagMax: 12, preferredMedia: ['carousel', 'video', 'image'] },
    facebook: { captionMin: 40, captionMax: 180, hashtagMin: 1, hashtagMax: 4, preferredMedia: ['video', 'image', 'carousel'] },
    linkedin: { captionMin: 180, captionMax: 700, hashtagMin: 3, hashtagMax: 5, preferredMedia: ['image', 'carousel', 'video'] },
    twitter: { captionMin: 40, captionMax: 220, hashtagMin: 0, hashtagMax: 2, preferredMedia: ['image', 'video', 'carousel'] },
    x: { captionMin: 40, captionMax: 220, hashtagMin: 0, hashtagMax: 2, preferredMedia: ['image', 'video', 'carousel'] },
    tiktok: { captionMin: 20, captionMax: 120, hashtagMin: 2, hashtagMax: 5, preferredMedia: ['video', 'image', 'carousel'] },
    youtube: { captionMin: 40, captionMax: 180, hashtagMin: 2, hashtagMax: 5, preferredMedia: ['video', 'image', 'carousel'] },
    pinterest: { captionMin: 60, captionMax: 250, hashtagMin: 2, hashtagMax: 6, preferredMedia: ['image', 'video', 'carousel'] },
};

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
            analytics: true,
            socialAccount: true,
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

        const engagement = post.analytics?.engagementRate ?? 0;
        const platform = post.socialAccount?.platform ?? 'UNKNOWN';

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
        const avgEngagement = post.analytics?.engagementRate ?? 0;
        mediaTypePerf[mediaType].total += avgEngagement;
        mediaTypePerf[mediaType].count += 1;

        totalCaptionLength += post.caption.length;
    });

    // Calculate averages
    const avgEngagementByHour: Record<number, number> = {};
    Object.entries(hourEngagement).forEach(([hour, data]) => {
        avgEngagementByHour[parseInt(hour, 10)] = data.count > 0 ? data.total / data.count : 0;
    });

    const avgEngagementByDay: Record<number, number> = {};
    Object.entries(dayEngagement).forEach(([day, data]) => {
        avgEngagementByDay[parseInt(day, 10)] = data.count > 0 ? data.total / data.count : 0;
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

    const sortedHours = Object.entries(avgEngagementByHour).sort((a, b) => b[1] - a[1]);
    const sortedDays = Object.entries(avgEngagementByDay).sort((a, b) => b[1] - a[1]);

    return {
        avgEngagementByHour,
        avgEngagementByDay,
        avgEngagementByPlatform,
        topPerformingHashtags: sortedHashtags,
        avgCaptionLength: posts.length > 0 ? totalCaptionLength / posts.length : 150,
        mediaTypePerformance,
        totalPosts: posts.length,
        bestHour: sortedHours[0] ? parseInt(sortedHours[0][0], 10) : undefined,
        bestDay: sortedDays[0] ? parseInt(sortedDays[0][0], 10) : undefined,
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
        const captionScore = analyzeCaptions(input.caption, patterns.avgCaptionLength, input.postType, input.platforms);
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
        const hashtagScore = analyzeHashtags(input.hashtags, patterns.topPerformingHashtags, input.postType, input.platforms);
        factors.push(hashtagScore.factor);
        if (hashtagScore.recommendation) {
            recommendations.push(hashtagScore.recommendation);
        }

        // 4. Media Analysis
        const mediaScore = analyzeMedia(
            input.hasMedia,
            input.mediaType,
            patterns.mediaTypePerformance,
            input.platforms
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

        // Calculate overall score with content/media carrying more weight than optional metadata.
        const totalWeight = factors.reduce((sum, f) => sum + getFactorWeight(f.name), 0);
        const weightedScore = factors.reduce((sum, f) => sum + f.score * getFactorWeight(f.name), 0) /
            Math.max(totalWeight, 1);
        const overallScore = Math.round(clamp(weightedScore, 0, 100));

        // Confidence reflects data volume instead of factor count, so sparse accounts are labelled honestly.
        const confidence = clamp(0.35 + Math.min(patterns.totalPosts, 60) / 60 * 0.55, 0.35, 0.9);

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

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizePlatform(platform: string): string {
    return platform.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
}

function getPlatformDefaults(platforms: string[]) {
    const matched = platforms
        .map((platform) => PLATFORM_DEFAULTS[normalizePlatform(platform)])
        .filter(Boolean);

    if (matched.length === 0) {
        return {
            captionMin: 60,
            captionMax: 240,
            hashtagMin: 2,
            hashtagMax: 6,
            preferredMedia: ['video', 'carousel', 'image'] as Array<'video' | 'carousel' | 'image'>,
        };
    }

    return {
        captionMin: Math.round(matched.reduce((sum, p) => sum + p.captionMin, 0) / matched.length),
        captionMax: Math.round(matched.reduce((sum, p) => sum + p.captionMax, 0) / matched.length),
        hashtagMin: Math.min(...matched.map((p) => p.hashtagMin)),
        hashtagMax: Math.round(matched.reduce((sum, p) => sum + p.hashtagMax, 0) / matched.length),
        preferredMedia: matched[0].preferredMedia,
    };
}

function getFactorWeight(name: string): number {
    switch (name) {
        case 'Caption Quality':
            return 0.32;
        case 'Media Fit':
            return 0.28;
        case 'Posting Time':
            return 0.22;
        case 'Hashtag Strategy':
            return 0.18;
        default:
            return 0.2;
    }
}

function analyzeCaptions(
    caption: string,
    avgLength: number,
    postType?: string,
    platforms: string[] = []
): { factor: PredictionFactor; recommendation?: string } {
    const length = caption.length;
    const wordCount = caption.trim() ? caption.trim().split(/\s+/).length : 0;
    const hasEmoji = /\p{Emoji}/u.test(caption);
    const hasCTA =
        /\b(click|tap|link|bio|shop|buy|learn|discover|check out|comment|share|save|follow|reply|tell us|book|dm|message)\b/i.test(caption);
    const hasQuestion = /\?/.test(caption);
    const hasHook = /^[^.!?\n]{8,90}[.!?]?/.test(caption.trim());
    const defaults = getPlatformDefaults(platforms);

    let score = 55;
    let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
    const bonuses: string[] = [];

    // Format-aware logic
    const isStory = postType?.toLowerCase() === 'story';
    const isTikTokOrShorts = platforms.some(p => p.toLowerCase() === 'tiktok' || p.toLowerCase() === 'youtube');
    const isLinkedIn = platforms.some(p => p.toLowerCase() === 'linkedin');

    if (isStory) {
        // Stories don't need long captions, CTAs in text, or questions
        score = 80;
        impact = 'positive';
        return {
            factor: {
                name: 'Caption Quality',
                score: 80,
                impact,
                description: 'Short and sweet for a Story',
            }
        };
    }

    if (length === 0) {
        return {
            factor: {
                name: 'Caption Quality',
                score: isTikTokOrShorts ? 55 : 35,
                impact: isTikTokOrShorts ? 'neutral' : 'negative',
                description: isTikTokOrShorts ? 'Video-led post with no caption' : 'No caption added',
            },
            recommendation: isTikTokOrShorts ? 'Add a short hook and 2-5 relevant hashtags' : 'Add a caption with a clear hook and next step',
        };
    }

    // Length scoring combines account history with platform norms so sparse history does not punish users.
    const targetMin = Math.round((defaults.captionMin + Math.max(20, avgLength * 0.6)) / 2);
    const targetMax = Math.round((defaults.captionMax + Math.max(defaults.captionMin, avgLength * 1.4)) / 2);
    if (length >= targetMin && length <= targetMax) {
        score += 14;
        bonuses.push('strong length');
    } else if (length < targetMin) {
        score -= wordCount < 8 ? 14 : 6;
    } else if (length > targetMax) {
        score -= isLinkedIn ? 4 : 12;
    }

    // Engagement elements
    if (hasHook) {
        score += 8;
        bonuses.push('opening hook');
    }
    if (hasEmoji) {
        score += isLinkedIn ? 2 : 5; // Less impact on LinkedIn
        bonuses.push('emojis');
    }
    if (hasCTA) {
        score += 15;
        bonuses.push('call-to-action');
    }
    if (hasQuestion && !isTikTokOrShorts) {
        score += 10;
        bonuses.push('question');
    }

    // Determine impact
    if (score >= 70) impact = 'positive';
    else if (score < 40) impact = 'negative';

    const recommendation =
        !hasCTA && !hasQuestion && !isStory
            ? 'Add one clear next step, such as asking people to comment, save, reply, or book'
            : length < targetMin
                ? `Expand the caption toward ${targetMin}-${targetMax} characters for this platform mix`
                : length > targetMax
                    ? `Tighten the caption toward ${targetMin}-${targetMax} characters so the hook is easier to read`
                    : undefined;

    return {
        factor: {
            name: 'Caption Quality',
            score: Math.round(clamp(score, 0, 100)),
            impact,
            description:
                bonuses.length > 0 ? `Includes ${bonuses.join(', ')}` : `${wordCount} words, no clear engagement trigger`,
        },
        recommendation,
    };
}

function analyzeTiming(
    hour: number,
    dayOfWeek: number,
    patterns: HistoricalPatterns
): { factor: PredictionFactor; recommendation?: string } {
    const hourValues = Object.values(patterns.avgEngagementByHour);
    const dayValues = Object.values(patterns.avgEngagementByDay);
    const hasHistory = patterns.totalPosts >= 8 && hourValues.length > 0 && dayValues.length > 0;
    const bestHour = patterns.bestHour ?? 10;
    const bestDay = patterns.bestDay ?? 2;
    let normalizedScore: number;
    let description: string;

    if (hasHistory) {
        const hourBaseline = hourValues.reduce((a, b) => a + b, 0) / hourValues.length;
        const dayBaseline = dayValues.reduce((a, b) => a + b, 0) / dayValues.length;
        const hourAvg = patterns.avgEngagementByHour[hour] ?? hourBaseline * 0.9;
        const dayAvg = patterns.avgEngagementByDay[dayOfWeek] ?? dayBaseline * 0.9;
        const hourRatio = hourAvg / Math.max(hourBaseline, 0.01);
        const dayRatio = dayAvg / Math.max(dayBaseline, 0.01);

        normalizedScore = clamp(52 + ((hourRatio * 0.65 + dayRatio * 0.35) - 1) * 45, 20, 96);
        description = normalizedScore >= 68
            ? 'Strong match with your historical audience activity'
            : normalizedScore < 45
                ? 'Below your usual posting-time performance'
                : 'Close to your average posting-time performance';
    } else {
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isPeakHour = isWeekday
            ? (hour >= 9 && hour <= 11) || (hour >= 12 && hour <= 14) || (hour >= 17 && hour <= 20)
            : (hour >= 10 && hour <= 13) || (hour >= 18 && hour <= 20);
        normalizedScore = isPeakHour ? 62 : 46;
        description = isPeakHour
            ? 'Uses a general high-activity window while history builds'
            : 'Outside common high-activity windows; history is limited';
    }

    const impact: 'positive' | 'negative' | 'neutral' =
        normalizedScore >= 65 ? 'positive' : normalizedScore < 45 ? 'negative' : 'neutral';

    const recommendation =
        normalizedScore < 55
            ? `Try ${DAY_NAMES[bestDay]} around ${bestHour}:00, then compare against this slot after publishing`
            : undefined;

    return {
        factor: {
            name: 'Posting Time',
            score: Math.round(normalizedScore),
            impact,
            description,
        },
        recommendation,
    };
}

function analyzeHashtags(
    hashtags: string[],
    topPerforming: string[],
    postType?: string,
    platforms: string[] = []
): { factor: PredictionFactor; recommendation?: string } {
    const isStory = postType?.toLowerCase() === 'story';
    const isLinkedIn = platforms.some(p => p.toLowerCase() === 'linkedin');
    const defaults = getPlatformDefaults(platforms);

    if (isStory) {
        // Hashtags matter much less on stories, often 0 or 1 is perfectly fine
        return {
            factor: {
                name: 'Hashtag Strategy',
                score: 75,
                impact: 'positive',
                description: 'Valid for Story format',
            }
        };
    }

    if (hashtags.length === 0) {
        const score = defaults.hashtagMin === 0 ? 58 : 32;
        return {
            factor: {
                name: 'Hashtag Strategy',
                score,
                impact: score >= 50 ? 'neutral' : 'negative',
                description: defaults.hashtagMin === 0 ? 'Optional for this platform mix' : 'No discovery tags used',
            },
            recommendation: defaults.hashtagMin === 0 ? undefined : `Add ${defaults.hashtagMin}-${defaults.hashtagMax} specific hashtags for discoverability`,
        };
    }

    const topMatches = hashtags.filter((h) =>
        topPerforming.some((t) => t.toLowerCase() === h.toLowerCase())
    );

    const inRecommendedRange = hashtags.length >= defaults.hashtagMin && hashtags.length <= defaults.hashtagMax;
    const matchRatio = topPerforming.length > 0 ? topMatches.length / Math.min(hashtags.length, 10) : 0;
    let score = 52;

    if (inRecommendedRange) score += 22;
    else if (hashtags.length < defaults.hashtagMin) score -= 12;
    else score -= isLinkedIn ? 22 : 10;

    score += matchRatio * 26;

    // Penalize too many hashtags on LinkedIn
    if (isLinkedIn && hashtags.length > 5) {
        score -= 20;
    }

    const impact: 'positive' | 'negative' | 'neutral' =
        score >= 68 ? 'positive' : score < 45 ? 'negative' : 'neutral';

    let recommendation: string | undefined;
    if (!inRecommendedRange) {
        recommendation = hashtags.length < defaults.hashtagMin
            ? `Add ${defaults.hashtagMin - hashtags.length} more specific hashtag${defaults.hashtagMin - hashtags.length === 1 ? '' : 's'} for this platform mix`
            : `Reduce hashtags toward ${defaults.hashtagMin}-${defaults.hashtagMax} focused tags`;
    } else if (topMatches.length === 0 && topPerforming.length > 0) {
        recommendation = `Try a proven hashtag from your history, such as #${topPerforming[0]}`;
    }

    if (isLinkedIn && hashtags.length > 5) {
        recommendation = 'Consider reducing hashtags to 3-5 for LinkedIn';
    }

    return {
        factor: {
            name: 'Hashtag Strategy',
            score: Math.round(clamp(score, 0, 100)),
            impact,
            description:
                topMatches.length > 0
                    ? `${topMatches.length} proven tag${topMatches.length === 1 ? '' : 's'}, ${hashtags.length} total`
                    : `${hashtags.length} tags, target range ${defaults.hashtagMin}-${defaults.hashtagMax}`,
        },
        recommendation,
    };
}

function analyzeMedia(
    hasMedia: boolean,
    mediaType: string | undefined,
    typePerformance: Record<string, number>,
    platforms: string[] = []
): { factor: PredictionFactor; recommendation?: string } {
    const isTikTokOrShorts = platforms.some(p => p.toLowerCase() === 'tiktok' || p.toLowerCase() === 'youtube');
    const isLinkedInOrTwitter = platforms.some(p => p.toLowerCase() === 'linkedin' || p.toLowerCase() === 'twitter');
    const defaults = getPlatformDefaults(platforms);

    if (!hasMedia) {
        if (isLinkedInOrTwitter) {
            // Text only can be fine
            return {
                factor: {
                    name: 'Media Fit',
                    score: 60,
                    impact: 'neutral',
                    description: 'Text-only post',
                }
            };
        } else if (isTikTokOrShorts) {
            // Unacceptable without video
            return {
                factor: {
                    name: 'Media Fit',
                    score: 0,
                    impact: 'negative',
                    description: 'Missing required video',
                },
                recommendation: 'This platform requires video content',
            };
        }
        return {
            factor: {
                name: 'Media Fit',
                score: 20,
                impact: 'negative',
                description: 'No media attached',
            },
            recommendation: 'Add images or video for significantly higher engagement',
        };
    }

    if (isTikTokOrShorts && mediaType !== 'video') {
        return {
            factor: {
                name: 'Media Fit',
                score: 10,
                impact: 'negative',
                description: `Invalid format (${mediaType})`,
            },
            recommendation: 'This platform requires video content',
        };
    }

    const selectedType = mediaType ?? 'image';
    const hasMediaHistory = Object.keys(typePerformance).length >= 2;
    let normalizedScore: number;
    let bestType = defaults.preferredMedia[0];

    if (hasMediaHistory) {
        const typeScore = typePerformance[selectedType] ?? 0;
        const avgScore = Object.values(typePerformance).reduce((a, b) => a + b, 0) /
            Math.max(Object.values(typePerformance).length, 1);
        const sortedTypes = Object.entries(typePerformance).sort((a, b) => b[1] - a[1]);
        bestType = (sortedTypes[0]?.[0] as 'video' | 'carousel' | 'image') ?? bestType;
        normalizedScore = clamp(55 + ((typeScore || avgScore * 0.9) / Math.max(avgScore, 0.01) - 1) * 45, 28, 96);
    } else {
        const preferenceIndex = defaults.preferredMedia.indexOf(selectedType as 'video' | 'carousel' | 'image');
        normalizedScore = preferenceIndex === 0 ? 72 : preferenceIndex === 1 ? 64 : 56;
    }

    const impact: 'positive' | 'negative' | 'neutral' =
        normalizedScore >= 68 ? 'positive' : normalizedScore < 45 ? 'negative' : 'neutral';

    const recommendation =
        bestType && bestType !== selectedType
            ? `${bestType.charAt(0).toUpperCase() + bestType.slice(1)} content is likely to perform better for this account or platform mix`
            : undefined;

    return {
        factor: {
            name: 'Media Fit',
            score: Math.round(normalizedScore),
            impact,
            description: hasMediaHistory
                ? `${selectedType} content compared with your history`
                : `${selectedType} content compared with platform norms`,
        },
        recommendation,
    };
}
