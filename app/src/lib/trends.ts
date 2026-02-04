/**
 * Trend Detection Service
 * Discover trending topics in your niche
 * 
 * Strategy: Uses Instagram Graph API hashtag search for real volume data when available.
 * TikTok Research API requires special approval, so we use curated TikTok trends.
 */

import { db } from '@/lib/db';
import { searchInstagramHashtag, getHashtagTopMedia } from '@/lib/platform-api/instagram-api';
import { logger } from '@/lib/logger';

export interface Trend {
    id: string;
    topic: string;
    type: 'hashtag' | 'topic' | 'sound' | 'challenge' | 'format';
    platform: string;
    volume: number;          // Posts using this trend
    growth: number;          // % growth estimate
    velocity: 'rising' | 'stable' | 'declining';
    relevanceScore: number;  // How relevant to your niche (0-1)
    peakPrediction: string;  // When it will peak
    samplePosts: Array<{
        url: string;
        caption: string;
        engagement: number;
    }>;
    suggestedContent: string;
    discoveredAt: Date;
    isRealData: boolean;     // Whether this came from real API data
}

export interface NicheConfig {
    keywords: string[];
    hashtags: string[];
    competitors: string[];
    industries: string[];
}

/**
 * Curated trending hashtags for different platforms
 * These are periodically-updated industry trends
 */
const CURATED_TIKTOK_TRENDS: Omit<Trend, 'discoveredAt' | 'isRealData'>[] = [
    {
        id: 'trend_tiktok_grwm',
        topic: '#GRWM',
        type: 'hashtag',
        platform: 'tiktok',
        volume: 2450000,
        growth: 45,
        velocity: 'rising',
        relevanceScore: 0.85,
        peakPrediction: 'Evergreen format',
        samplePosts: [],
        suggestedContent: 'Create a "Get Ready With Me" featuring your products',
    },
    {
        id: 'trend_tiktok_pov',
        topic: 'POV Series',
        type: 'format',
        platform: 'tiktok',
        volume: 5600000,
        growth: 15,
        velocity: 'stable',
        relevanceScore: 0.68,
        peakPrediction: 'Evergreen',
        samplePosts: [],
        suggestedContent: 'Create POV: When you finally find the perfect [product]',
    },
    {
        id: 'trend_tiktok_day_in_life',
        topic: '#DayInMyLife',
        type: 'hashtag',
        platform: 'tiktok',
        volume: 8900000,
        growth: 12,
        velocity: 'stable',
        relevanceScore: 0.75,
        peakPrediction: 'Evergreen',
        samplePosts: [],
        suggestedContent: 'Behind-the-scenes of your business day',
    },
];

/**
 * Detect trending topics
 * Uses real Instagram API data when available, curated data for TikTok
 */
export async function detectTrends(
    organizationId: string,
    niche: NicheConfig,
    platforms: string[] = ['instagram', 'tiktok']
): Promise<Trend[]> {
    const trends: Trend[] = [];

    // Get Instagram account for API calls
    const instagramAccount = await db.socialAccount.findFirst({
        where: {
            organizationId,
            platform: 'INSTAGRAM',
            isActive: true,
        },
    });

    // If Instagram platform requested and account available, fetch real hashtag data
    if (platforms.includes('instagram') && instagramAccount && niche.hashtags.length > 0) {
        logger.info({ organizationId }, 'Fetching real Instagram hashtag trends');

        // Search up to 3 niche hashtags (to respect rate limits)
        const hashtagsToSearch = niche.hashtags.slice(0, 3);

        for (const hashtag of hashtagsToSearch) {
            try {
                const searchResult = await searchInstagramHashtag(
                    instagramAccount.accessToken,
                    instagramAccount.platformId,
                    hashtag.replace(/^#/, '')
                );

                if (searchResult.success && searchResult.data) {
                    const hashtagData = searchResult.data;

                    // Fetch top media for engagement samples
                    let samplePosts: Trend['samplePosts'] = [];
                    if (hashtagData.hashtagId) {
                        const topMedia = await getHashtagTopMedia(
                            instagramAccount.accessToken,
                            instagramAccount.platformId,
                            hashtagData.hashtagId,
                            3
                        );

                        if (topMedia.success && topMedia.data) {
                            samplePosts = topMedia.data.slice(0, 2).map(media => ({
                                url: media.permalink,
                                caption: media.caption || '',
                                engagement: media.likeCount + media.commentsCount,
                            }));
                        }
                    }

                    // Estimate volume from sample engagement (heuristic)
                    const avgEngagement = samplePosts.length > 0
                        ? samplePosts.reduce((sum, p) => sum + p.engagement, 0) / samplePosts.length
                        : 1000;
                    const estimatedVolume = Math.floor(avgEngagement * 100); // Rough estimate

                    trends.push({
                        id: `trend_ig_${hashtagData.hashtagId || hashtag}`,
                        topic: `#${hashtag.replace(/^#/, '')}`,
                        type: 'hashtag',
                        platform: 'instagram',
                        volume: estimatedVolume,
                        growth: estimateGrowth(estimatedVolume),
                        velocity: estimatedVolume > 100000 ? 'rising' : 'stable',
                        relevanceScore: 0.9, // High relevance since it's from their niche config
                        peakPrediction: 'Based on your niche',
                        samplePosts,
                        suggestedContent: generateHashtagSuggestion(hashtag),
                        discoveredAt: new Date(),
                        isRealData: true,
                    });
                }
            } catch (error) {
                logger.warn({ hashtag, error }, 'Failed to fetch Instagram hashtag trend');
            }
        }
    }

    // Add curated TikTok trends if requested
    if (platforms.includes('tiktok')) {
        const tiktokTrends = CURATED_TIKTOK_TRENDS.map(trend => ({
            ...trend,
            discoveredAt: new Date(),
            isRealData: false,
        }));
        trends.push(...tiktokTrends);
    }

    // Sort by relevance * growth
    return trends.sort((a, b) =>
        (b.relevanceScore * b.growth) - (a.relevanceScore * a.growth)
    );
}

/**
 * Estimate growth based on volume (heuristic)
 */
function estimateGrowth(volume: number): number {
    if (volume > 10000000) return 5;  // Very high volume = slow growth
    if (volume > 1000000) return 10;
    if (volume > 100000) return 20;
    if (volume > 10000) return 35;
    return 50; // Low volume = potentially high growth
}

/**
 * Generate content suggestion for a hashtag
 */
function generateHashtagSuggestion(hashtag: string): string {
    const tag = hashtag.toLowerCase().replace(/^#/, '');

    if (tag.includes('small') && tag.includes('business')) {
        return 'Share behind-the-scenes of your business journey';
    }
    if (tag.includes('tutorial') || tag.includes('howto')) {
        return 'Create a step-by-step tutorial showcasing your expertise';
    }
    if (tag.includes('review')) {
        return 'Feature genuine customer testimonials and unboxing content';
    }
    return `Create authentic content featuring #${tag} to join the conversation`;
}

/**
 * Get trending sounds for Reels/TikTok
 */
export async function getTrendingSounds(
    platform: 'instagram' | 'tiktok'
): Promise<Array<{
    id: string;
    name: string;
    artist: string;
    usageCount: number;
    trend: 'rising' | 'stable' | 'declining';
    previewUrl: string;
}>> {
    // Mock data
    return [
        { id: 's1', name: 'Espresso', artist: 'Sabrina Carpenter', usageCount: 1200000, trend: 'rising', previewUrl: '' },
        { id: 's2', name: 'Original Sound', artist: 'trending_creator', usageCount: 890000, trend: 'rising', previewUrl: '' },
        { id: 's3', name: 'That Funny Feeling', artist: 'Bo Burnham', usageCount: 560000, trend: 'stable', previewUrl: '' },
    ];
}

/**
 * Get hashtag performance data
 */
export async function analyzeHashtag(
    _hashtag: string,
    platform: string
): Promise<{
    volume: number;
    avgEngagement: number;
    difficulty: 'low' | 'medium' | 'high';
    relatedHashtags: string[];
    bestTimeToPost: string;
    contentTypes: Array<{ type: string; percentage: number }>;
}> {
    // Mock analysis
    return {
        volume: Math.floor(Math.random() * 1000000) + 10000,
        avgEngagement: Math.random() * 10 + 2,
        difficulty: Math.random() > 0.6 ? 'high' : Math.random() > 0.3 ? 'medium' : 'low',
        relatedHashtags: ['#fashion', '#style', '#ootd', '#inspo', '#trending'],
        bestTimeToPost: '6-8 PM',
        contentTypes: [
            { type: 'image', percentage: 45 },
            { type: 'video', percentage: 40 },
            { type: 'carousel', percentage: 15 },
        ],
    };
}

/**
 * Generate trend-based content ideas
 */
export async function generateTrendIdeas(
    trends: Trend[],
    _brandContext: {
        industry: string;
        products: string[];
        tone: string;
    }
): Promise<Array<{
    trendId: string;
    idea: string;
    platform: string;
    contentType: string;
    difficulty: 'easy' | 'medium' | 'hard';
    estimatedReach: string;
}>> {
    // In production, call AI for idea generation

    return trends.map(trend => ({
        trendId: trend.id,
        idea: trend.suggestedContent,
        platform: trend.platform,
        contentType: trend.type === 'sound' ? 'video' : 'carousel',
        difficulty: 'medium',
        estimatedReach: `${Math.floor(trend.volume / 10000)}K+`,
    }));
}

/**
 * Set up trend monitoring alerts
 */
export async function setupTrendAlerts(
    _organizationId: string,
    _config: {
        keywords: string[];
        minGrowth: number;
        minRelevance: number;
        platforms: string[];
        notifyVia: 'email' | 'push' | 'both';
    }
): Promise<{ id: string }> {
    // In production, set up background monitoring job

    return { id: `trend_alert_${Date.now()}` };
}

/**
 * Get trend forecast
 */
export async function getTrendForecast(
    niche: NicheConfig
): Promise<Array<{
    week: string;
    predictedTrends: string[];
    confidence: number;
    basis: string;
}>> {
    // Mock forecast
    return [
        {
            week: 'This Week',
            predictedTrends: ['#ValentinesDay', 'Couple content', 'Gift guides'],
            confidence: 0.85,
            basis: 'Seasonal patterns + historical data',
        },
        {
            week: 'Next Week',
            predictedTrends: ['GRWM format', 'Morning routines', 'Productivity'],
            confidence: 0.72,
            basis: 'Current velocity + creator signals',
        },
    ];
}
