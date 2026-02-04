/**
 * Content Timing Analyzer
 * 
 * Analyzes historical post performance to learn optimal posting times
 * based on content attributes (caption length, media type, post type).
 * 
 * Why: Different content types perform better at different times.
 * Short posts may do better in morning commutes, video content in evenings.
 */

import { db } from '@/lib/db';
import { Platform, PostType } from '@/generated/prisma/enums';
import { getDay, getHours } from 'date-fns';

/**
 * Generate a content signature string from post attributes
 */
export function generateContentSignature(
    captionLength: number,
    hasVideo: boolean,
    mediaCount: number,
    postType: PostType
): string {
    const lengthLabel = captionLength < 100 ? 'short' : captionLength < 500 ? 'medium' : 'long';
    const mediaLabel = hasVideo ? 'video' : mediaCount > 1 ? 'carousel' : mediaCount === 1 ? 'image' : 'text';
    return `${lengthLabel}_${mediaLabel}_${postType}`;
}

/**
 * Analyze published posts and update content timing patterns
 * Call this periodically (e.g., daily via cron) to learn from new data
 */
export async function analyzeContentTimingPatterns(organizationId: string): Promise<{
    patternsUpdated: number;
    postsAnalyzed: number;
}> {
    // Fetch published PostPlatforms with analytics from last 90 days
    const postPlatforms = await db.postPlatform.findMany({
        where: {
            post: {
                organizationId,
                status: 'PUBLISHED',
            },
            publishedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
        },
        include: {
            post: {
                include: {
                    media: {
                        include: {
                            media: true
                        }
                    }
                }
            },
            analytics: true,
            socialAccount: { select: { platform: true } }
        }
    });

    // Group engagement by content signature + day + hour
    const patternMap = new Map<string, {
        platform: Platform;
        contentSignature: string;
        day: number;
        hour: number;
        totalEngagement: number;
        count: number;
    }>();

    for (const pp of postPlatforms) {
        if (!pp.publishedAt || !pp.analytics) continue;

        // Caption from PostPlatform or fall back to Post.caption
        const captionLength = (pp.caption || pp.post.caption || '').length;
        // Check if any media is video by mimeType
        const hasVideo = pp.post.media.some(m => m.media.mimeType.startsWith('video/'));
        const mediaCount = pp.post.media.length;
        const signature = generateContentSignature(captionLength, hasVideo, mediaCount, pp.postType || PostType.FEED);

        const day = getDay(pp.publishedAt);
        const hour = getHours(pp.publishedAt);
        const key = `${pp.socialAccount.platform}-${signature}-${day}-${hour}`;

        const engagement = (pp.analytics.likes || 0) +
            (pp.analytics.comments || 0) +
            (pp.analytics.shares || 0);

        const current = patternMap.get(key) || {
            platform: pp.socialAccount.platform,
            contentSignature: signature,
            day,
            hour,
            totalEngagement: 0,
            count: 0
        };

        patternMap.set(key, {
            ...current,
            totalEngagement: current.totalEngagement + engagement,
            count: current.count + 1
        });
    }

    // Find best day+hour for each content signature
    const bestPatterns = new Map<string, {
        platform: Platform;
        contentSignature: string;
        bestDay: number;
        bestHour: number;
        avgEngagement: number;
        sampleSize: number;
    }>();

    for (const data of patternMap.values()) {
        const sigKey = `${data.platform}-${data.contentSignature}`;
        const avgEngagement = data.totalEngagement / data.count;
        const existing = bestPatterns.get(sigKey);

        if (!existing || avgEngagement > existing.avgEngagement) {
            bestPatterns.set(sigKey, {
                platform: data.platform,
                contentSignature: data.contentSignature,
                bestDay: data.day,
                bestHour: data.hour,
                avgEngagement,
                sampleSize: data.count
            });
        }
    }

    // Upsert patterns to database
    let patternsUpdated = 0;
    for (const pattern of bestPatterns.values()) {
        // Only store patterns with at least 3 samples for statistical significance
        if (pattern.sampleSize < 3) continue;

        await db.contentTimingPattern.upsert({
            where: {
                organizationId_platform_contentSignature: {
                    organizationId,
                    platform: pattern.platform,
                    contentSignature: pattern.contentSignature
                }
            },
            create: {
                organizationId,
                platform: pattern.platform,
                contentSignature: pattern.contentSignature,
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

    return { patternsUpdated, postsAnalyzed: postPlatforms.length };
}

/**
 * Get recommended posting time for specific content attributes
 */
export async function getContentBasedRecommendation(
    organizationId: string,
    platform: Platform,
    captionLength: number,
    hasVideo: boolean,
    mediaCount: number,
    postType: PostType
): Promise<{ day: number; hour: number; confidence: number } | null> {
    const signature = generateContentSignature(captionLength, hasVideo, mediaCount, postType);

    const pattern = await db.contentTimingPattern.findUnique({
        where: {
            organizationId_platform_contentSignature: {
                organizationId,
                platform,
                contentSignature: signature
            }
        }
    });

    if (!pattern || pattern.sampleSize < 3) {
        return null; // Not enough data
    }

    // Confidence scales with sample size (max at 20+ samples)
    const confidence = Math.min(0.9, 0.5 + (pattern.sampleSize / 40));

    return {
        day: pattern.bestDay,
        hour: pattern.bestHour,
        confidence
    };
}
