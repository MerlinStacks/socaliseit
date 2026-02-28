/**
 * Trend Detection Service
 * Discover trending topics in your niche
 * 
 * Strategy: Google Trends (primary) + Instagram Graph API + TikTok Discovery API.
 * TikTok Discovery requires TIKTOK_DISCOVERY_ACCESS_TOKEN env var; falls back
 * to curated data when unavailable.
 */

import { db } from '@/lib/db';
import { searchInstagramHashtag, getHashtagTopMedia } from '@/lib/platform-api/instagram-api';
import { getTikTokTrendingHashtags, getTikTokTrendingSounds } from '@/lib/platform-api/tiktok-trends';
import { logger } from '@/lib/logger';
import { getDailyTrends, getRealTimeTrends, getTrendsLastUpdated, type GoogleTrendItem } from '@/lib/google-trends';

// Re-export for page consumption
export { getTrendsLastUpdated } from '@/lib/google-trends';

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
 * Uses Google Trends as primary source, with Instagram API and curated data as supplements
 */
export async function detectTrends(
    organizationId: string,
    niche: NicheConfig,
    platforms: string[] = ['instagram', 'tiktok'],
    country: string = 'AU'
): Promise<Trend[]> {
    const trends: Trend[] = [];

    // Fetch real Google Trends data as primary source
    try {
        logger.info({ organizationId, country }, 'Fetching Google Trends data');

        const [dailyTrends, realTimeTrends] = await Promise.all([
            getDailyTrends(country),
            getRealTimeTrends(country, 'all'),
        ]);

        // Convert daily trends to our format
        for (const gTrend of dailyTrends.slice(0, 10)) {
            const volume = parseTrafficVolume(gTrend.formattedTraffic);
            trends.push({
                id: `trend_google_${gTrend.title.replace(/\s+/g, '_').toLowerCase()}`,
                topic: gTrend.title,
                type: 'topic',
                platform: 'google',
                volume,
                growth: estimateGrowth(volume),
                velocity: volume > 100000 ? 'rising' : 'stable',
                relevanceScore: 0.7,
                peakPrediction: 'Trending now',
                samplePosts: [],
                suggestedContent: generateTopicSuggestion(gTrend.title, gTrend.relatedQueries),
                discoveredAt: new Date(),
                isRealData: true,
            });
        }

        // Convert real-time trends to our format  
        for (const story of realTimeTrends.slice(0, 5)) {
            trends.push({
                id: `trend_realtime_${story.title.replace(/\s+/g, '_').toLowerCase().slice(0, 30)}`,
                topic: story.title,
                type: 'topic',
                platform: 'google',
                volume: 50000, // Real-time trends don't have volume
                growth: 100, // High growth since they're real-time
                velocity: 'rising',
                relevanceScore: 0.65,
                peakPrediction: 'Next 24 hours',
                samplePosts: story.articles.slice(0, 2).map(a => ({
                    url: a.url,
                    caption: a.title,
                    engagement: 0,
                })),
                suggestedContent: `Create content related to: ${story.entityNames.slice(0, 3).join(', ')}`,
                discoveredAt: new Date(),
                isRealData: true,
            });
        }

        logger.info({ count: trends.length }, 'Added Google Trends data');
    } catch (error) {
        logger.warn({ error }, 'Failed to fetch Google Trends, using fallback data');

        // Fallback to curated data if Google Trends fails
        const fallbackTrends = CURATED_TIKTOK_TRENDS.map(trend => ({
            ...trend,
            discoveredAt: new Date(),
            isRealData: false,
        }));
        trends.push(...fallbackTrends);
    }

    // Get Instagram account for supplementary API calls
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

    // Fetch TikTok Discovery API data (real trending hashtags)
    if (platforms.includes('tiktok')) {
        try {
            const tiktokHashtags = await getTikTokTrendingHashtags(country);

            if (tiktokHashtags.length > 0) {
                logger.info({ count: tiktokHashtags.length }, 'Adding real TikTok Discovery trends');

                for (const tag of tiktokHashtags.slice(0, 10)) {
                    trends.push({
                        id: `trend_tiktok_${tag.name.replace(/\s+/g, '_').toLowerCase()}`,
                        topic: `#${tag.name}`,
                        type: 'hashtag',
                        platform: 'tiktok',
                        volume: tag.videoCount,
                        growth: tag.isRising ? 40 : 10,
                        velocity: tag.isRising ? 'rising' : 'stable',
                        relevanceScore: 0.8,
                        peakPrediction: tag.isRising ? 'Trending now' : 'Stable',
                        samplePosts: [],
                        suggestedContent: generateHashtagSuggestion(tag.name),
                        discoveredAt: new Date(),
                        isRealData: true,
                    });
                }
            } else {
                // Fall back to curated data when Discovery API is not configured
                const fallbackTrends = CURATED_TIKTOK_TRENDS.map(trend => ({
                    ...trend,
                    discoveredAt: new Date(),
                    isRealData: false,
                }));
                trends.push(...fallbackTrends);
            }
        } catch (error) {
            logger.warn({ error }, 'Failed to fetch TikTok Discovery data, using curated fallback');
            const fallbackTrends = CURATED_TIKTOK_TRENDS.map(trend => ({
                ...trend,
                discoveredAt: new Date(),
                isRealData: false,
            }));
            trends.push(...fallbackTrends);
        }
    }

    // Sort by relevance * growth
    return trends.sort((a, b) =>
        (b.relevanceScore * b.growth) - (a.relevanceScore * a.growth)
    );
}

/**
 * Parse Google Trends traffic volume string to number
 */
function parseTrafficVolume(formatted: string): number {
    const match = formatted.match(/(\d+(?:,\d+)*)\s*([KMB])?/i);
    if (!match) return 10000;

    const baseNum = parseInt(match[1].replace(/,/g, ''), 10);
    const suffix = (match[2] || '').toUpperCase();

    switch (suffix) {
        case 'K': return baseNum * 1000;
        case 'M': return baseNum * 1000000;
        case 'B': return baseNum * 1000000000;
        default: return baseNum;
    }
}

/**
 * Generate content suggestion for a topic
 */
function generateTopicSuggestion(topic: string, relatedQueries: string[]): string {
    if (relatedQueries.length > 0) {
        return `Create content about "${topic}" - related topics: ${relatedQueries.slice(0, 3).join(', ')}`;
    }
    return `Create timely content about "${topic}" while it's trending`;
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
 * Get trending sounds for Reels/TikTok.
 * Uses TikTok Discovery API when configured, falls back to curated data.
 */
export async function getTrendingSounds(
    platform: 'instagram' | 'tiktok',
    country: string = 'AU'
): Promise<Array<{
    id: string;
    name: string;
    artist: string;
    usageCount: number;
    trend: 'rising' | 'stable' | 'declining';
    previewUrl: string;
}>> {
    // Try TikTok Discovery API first
    try {
        const realSounds = await getTikTokTrendingSounds(country);
        if (realSounds.length > 0) {
            return realSounds.map((s, i) => ({
                id: `tiktok_sound_${i}`,
                name: s.title,
                artist: s.artist,
                usageCount: s.videoCount,
                trend: s.isRising ? 'rising' as const : 'stable' as const,
                previewUrl: '',
            }));
        }
    } catch {
        // Fall through to curated data
    }

    // Curated fallback when API is unavailable
    return [
        { id: 's1', name: 'Espresso', artist: 'Sabrina Carpenter', usageCount: 1200000, trend: 'rising', previewUrl: '' },
        { id: 's2', name: 'Original Sound', artist: 'trending_creator', usageCount: 890000, trend: 'rising', previewUrl: '' },
        { id: 's3', name: 'That Funny Feeling', artist: 'Bo Burnham', usageCount: 560000, trend: 'stable', previewUrl: '' },
    ];
}

/**
 * Get hashtag performance data using real Instagram API
 */
export async function analyzeHashtag(
    hashtag: string,
    platform: string
): Promise<{
    volume: number;
    avgEngagement: number;
    difficulty: 'low' | 'medium' | 'high';
    relatedHashtags: string[];
    bestTimeToPost: string;
    contentTypes: Array<{ type: string; percentage: number }>;
}> {
    const cleanHashtag = hashtag.replace('#', '').toLowerCase();

    // Only Instagram has real API support for hashtags
    if (platform !== 'instagram') {
        // Return curated estimate for other platforms
        return {
            volume: 50000,
            avgEngagement: 3.5,
            difficulty: 'medium',
            relatedHashtags: [],
            bestTimeToPost: '6-8 PM',
            contentTypes: [
                { type: 'video', percentage: 60 },
                { type: 'image', percentage: 40 },
            ],
        };
    }

    try {
        // Get connected Instagram account for API access
        const account = await db.socialAccount.findFirst({
            where: { platform: 'INSTAGRAM' },
            select: { accessToken: true, platformId: true }
        });

        if (!account?.accessToken || !account?.platformId) {
            logger.debug(`[HashtagAnalysis] No Instagram account for hashtag analysis`);
            return getFallbackHashtagAnalysis(cleanHashtag);
        }

        // Search for the hashtag
        const hashtagResult = await searchInstagramHashtag(account.accessToken, account.platformId, cleanHashtag);

        if (!hashtagResult?.success || !hashtagResult?.data?.hashtagId) {
            logger.debug(`[HashtagAnalysis] Hashtag #${cleanHashtag} not found`);
            return getFallbackHashtagAnalysis(cleanHashtag);
        }

        // Get top media for engagement analysis
        const topMediaResult = await getHashtagTopMedia(account.accessToken, account.platformId, hashtagResult.data.hashtagId, 25);

        if (!topMediaResult?.success || !topMediaResult?.data || topMediaResult.data.length === 0) {
            return getFallbackHashtagAnalysis(cleanHashtag);
        }

        const topMedia = topMediaResult.data;

        // Calculate real metrics from API data
        let totalLikes = 0;
        let totalComments = 0;
        const contentTypeCounts: Record<string, number> = {};

        for (const post of topMedia) {
            totalLikes += post.likeCount || 0;
            totalComments += post.commentsCount || 0;

            const mediaType = post.mediaType?.toLowerCase() || 'image';
            const normalizedType = mediaType === 'carousel_album' ? 'carousel' : mediaType;
            contentTypeCounts[normalizedType] = (contentTypeCounts[normalizedType] || 0) + 1;
        }

        const avgEngagement = topMedia.length > 0
            ? (totalLikes + totalComments) / topMedia.length
            : 0;

        // Estimate volume based on engagement (approximation since API doesn't expose post count)
        const estimatedVolume = Math.round(avgEngagement * 100);

        // Determine difficulty based on average engagement of top posts
        let difficulty: 'low' | 'medium' | 'high';
        if (avgEngagement > 10000) {
            difficulty = 'high';
        } else if (avgEngagement > 2000) {
            difficulty = 'medium';
        } else {
            difficulty = 'low';
        }

        // Calculate content type percentages
        const totalPosts = topMedia.length;
        const contentTypes = Object.entries(contentTypeCounts).map(([type, count]) => ({
            type,
            percentage: Math.round((count / totalPosts) * 100),
        })).sort((a, b) => b.percentage - a.percentage);

        logger.info(`[HashtagAnalysis] Analyzed #${cleanHashtag}: ${topMedia.length} posts, avg engagement ${Math.round(avgEngagement)}`);

        return {
            volume: estimatedVolume,
            avgEngagement: Math.round(avgEngagement),
            difficulty,
            relatedHashtags: [], // Instagram API doesn't provide related hashtags
            bestTimeToPost: '6-8 PM', // Would need more analysis to determine
            contentTypes: contentTypes.length > 0 ? contentTypes : [
                { type: 'image', percentage: 50 },
                { type: 'video', percentage: 35 },
                { type: 'carousel', percentage: 15 },
            ],
        };
    } catch (error) {
        logger.error(`[HashtagAnalysis] Error analyzing #${cleanHashtag}: ${error instanceof Error ? error.message : String(error)}`);
        return getFallbackHashtagAnalysis(cleanHashtag);
    }
}

/**
 * Fallback hashtag analysis when API is unavailable
 */
function getFallbackHashtagAnalysis(hashtag: string): {
    volume: number;
    avgEngagement: number;
    difficulty: 'low' | 'medium' | 'high';
    relatedHashtags: string[];
    bestTimeToPost: string;
    contentTypes: Array<{ type: string; percentage: number }>;
} {
    // Common hashtags get higher volume estimates
    const commonHashtags = ['fashion', 'style', 'ootd', 'love', 'instagood', 'photooftheday'];
    const isCommon = commonHashtags.some(h => hashtag.includes(h));

    return {
        volume: isCommon ? 500000 : 25000,
        avgEngagement: isCommon ? 1500 : 500,
        difficulty: isCommon ? 'high' : 'medium',
        relatedHashtags: [],
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
 * Get trend forecast based on Google Trends and seasonal patterns
 */
export async function getTrendForecast(
    niche: NicheConfig
): Promise<Array<{
    week: string;
    predictedTrends: string[];
    confidence: number;
    basis: string;
}>> {
    try {
        // Fetch current Google Trends
        const dailyTrends = await getDailyTrends('AU');
        const realTimeTrends = await getRealTimeTrends('AU', 'all');

        // Get current date for seasonal predictions
        const now = new Date();
        const month = now.getMonth();
        const dayOfMonth = now.getDate();

        // Season-based content predictions
        const seasonalTrends = getSeasonalTrends(month, dayOfMonth);

        // This week: Current hot topics + niche-relevant trends
        const thisWeekTrends: string[] = [];

        // Add relevant Google Trends
        for (const trend of dailyTrends.slice(0, 5)) {
            if (trend.title) {
                const isRelevant = niche.keywords.some(kw =>
                    trend.title.toLowerCase().includes(kw.toLowerCase())
                );
                if (isRelevant || thisWeekTrends.length < 3) {
                    thisWeekTrends.push(trend.title);
                }
            }
        }

        // Add seasonal if applicable
        if (seasonalTrends.length > 0) {
            thisWeekTrends.push(...seasonalTrends.slice(0, 2));
        }

        // Next week: Predicted based on velocity and upcoming events
        const nextWeekTrends: string[] = [];

        // Add upcoming seasonal events
        const upcomingEvents = getUpcomingEvents(now);
        if (upcomingEvents.length > 0) {
            nextWeekTrends.push(...upcomingEvents.slice(0, 2));
        }

        // Add evergreen content types based on niche
        const evergreenContent = ['GRWM format', 'Behind-the-scenes', 'Tips & tutorials'];
        nextWeekTrends.push(evergreenContent[now.getDay() % evergreenContent.length]);

        // Add niche-specific hashtags if available
        if (niche.hashtags.length > 0) {
            nextWeekTrends.push(niche.hashtags[0]);
        }

        logger.debug(`[TrendForecast] Generated forecasts from ${dailyTrends.length} Google Trends`);

        return [
            {
                week: 'This Week',
                predictedTrends: [...new Set(thisWeekTrends)].slice(0, 4),
                confidence: dailyTrends.length > 0 ? 0.85 : 0.65,
                basis: dailyTrends.length > 0
                    ? 'Google Trends + seasonal calendar'
                    : 'Seasonal patterns only',
            },
            {
                week: 'Next Week',
                predictedTrends: [...new Set(nextWeekTrends)].slice(0, 4),
                confidence: 0.70,
                basis: 'Upcoming events + content velocity patterns',
            },
        ];
    } catch (error) {
        logger.error(`[TrendForecast] Error generating forecast: ${error instanceof Error ? error.message : String(error)}`);

        // Fallback to basic seasonal predictions
        return [
            {
                week: 'This Week',
                predictedTrends: getSeasonalTrends(new Date().getMonth(), new Date().getDate()),
                confidence: 0.60,
                basis: 'Seasonal calendar patterns',
            },
            {
                week: 'Next Week',
                predictedTrends: ['GRWM format', 'Productivity content', 'Morning routines'],
                confidence: 0.55,
                basis: 'Evergreen content patterns',
            },
        ];
    }
}

/**
 * Get seasonal trend suggestions based on current date
 */
function getSeasonalTrends(month: number, day: number): string[] {
    // Major holidays and seasons
    const trends: string[] = [];

    // February
    if (month === 1) {
        if (day < 14) trends.push('#ValentinesDay', 'Gift guides', 'Couple content');
        else if (day >= 14) trends.push('Self-love content', 'Galentines');
    }
    // March
    else if (month === 2) {
        if (day < 17) trends.push('#StPatricksDay', 'Green aesthetic');
        trends.push('Spring cleaning', 'New beginnings');
    }
    // April
    else if (month === 3) {
        if (day < 22) trends.push('#EarthDay', 'Sustainability');
        trends.push('Spring fashion', 'Easter content');
    }
    // May
    else if (month === 4) {
        if (day < 12) trends.push('#MothersDay', 'Gift ideas');
        trends.push('Summer prep', 'Outdoor content');
    }
    // December
    else if (month === 11) {
        trends.push('Holiday content', 'Gift guides', 'Year in review');
        if (day > 20) trends.push('#Christmas', 'Festive looks');
    }
    // Default: Evergreen
    else {
        trends.push('Behind-the-scenes', 'Day in my life', 'Tips & tutorials');
    }

    return trends.slice(0, 3);
}

/**
 * Get upcoming events for next week predictions
 */
function getUpcomingEvents(currentDate: Date): string[] {
    const nextWeek = new Date(currentDate);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const month = nextWeek.getMonth();
    const day = nextWeek.getDate();

    const events: string[] = [];

    if (month === 1 && day >= 10 && day <= 14) events.push('Valentine\'s Day prep');
    if (month === 2 && day >= 14 && day <= 17) events.push('St. Patrick\'s Day');
    if (month === 4 && day >= 8 && day <= 12) events.push('Mother\'s Day prep');
    if (month === 9 && day >= 28 || month === 10 && day <= 3) events.push('Halloween prep');
    if (month === 10 && day >= 22 || month === 11 && day <= 1) events.push('Black Friday prep');

    return events;
}

