/**
 * Google Trends Service
 * Fetches real-time and daily trending topics from Google Trends
 * 
 * Uses the unofficial google-trends-api npm package (no API key required).
 * Data is cached in Redis to respect rate limits.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require('google-trends-api');
import { logger } from '@/lib/logger';
import { getRedisConnection } from '@/lib/bullmq/connection';

const CACHE_TTL = 60 * 60; // 1 hour cache
const CACHE_KEY_DAILY = 'google_trends:daily';
const CACHE_KEY_REALTIME = 'google_trends:realtime';

export interface GoogleTrendItem {
    title: string;
    formattedTraffic: string;
    relatedQueries: string[];
    articleTitles: string[];
    imageUrl?: string;
}

export interface RealTimeTrendItem {
    title: string;
    entityNames: string[];
    articles: Array<{
        title: string;
        url: string;
        source: string;
    }>;
}

/**
 * Get daily trending searches from Google Trends
 * Returns top 20 daily trending searches, updated hourly
 */
export async function getDailyTrends(geo: string = 'AU'): Promise<GoogleTrendItem[]> {
    const redis = getRedisConnection();

    try {
        // Check cache first
        const cached = await redis.get(CACHE_KEY_DAILY);
        if (cached) {
            logger.debug('Returning cached daily trends');
            return JSON.parse(cached);
        }

        const results = await googleTrends.dailyTrends({
            geo,
            hl: 'en',
        });

        const parsed = JSON.parse(results);
        const trendingDays = parsed.default?.trendingSearchesDays || [];

        const trends: GoogleTrendItem[] = [];

        for (const day of trendingDays) {
            for (const search of day.trendingSearches || []) {
                trends.push({
                    title: search.title?.query || '',
                    formattedTraffic: search.formattedTraffic || '10K+',
                    relatedQueries: (search.relatedQueries || []).map((q: { query: string }) => q.query),
                    articleTitles: (search.articles || []).map((a: { title: string }) => a.title),
                    imageUrl: search.image?.imageUrl,
                });
            }
        }

        // Cache results
        await redis.set(CACHE_KEY_DAILY, JSON.stringify(trends), 'EX', CACHE_TTL);

        logger.info({ count: trends.length }, 'Fetched daily trends from Google');
        return trends;
    } catch (error) {
        logger.error({ error }, 'Failed to fetch daily trends from Google');

        // Try to return stale cache if available
        const staleCache = await redis.get(CACHE_KEY_DAILY);
        if (staleCache) {
            logger.warn('Returning stale cached daily trends');
            return JSON.parse(staleCache);
        }

        return [];
    }
}

/**
 * Get real-time trending stories from Google Trends
 * Returns stories trending across Google surfaces in the last 24 hours
 */
export async function getRealTimeTrends(
    geo: string = 'AU',
    category: 'all' | 'e' | 'b' | 't' | 'm' | 's' | 'h' = 'all'
): Promise<RealTimeTrendItem[]> {
    const redis = getRedisConnection();

    try {
        // Check cache first
        const cacheKey = `${CACHE_KEY_REALTIME}:${category}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            logger.debug('Returning cached real-time trends');
            return JSON.parse(cached);
        }

        const results = await googleTrends.realTimeTrends({
            geo,
            hl: 'en',
            category,
        });

        const parsed = JSON.parse(results);
        const stories = parsed.storySummaries?.trendingStories || [];

        const trends: RealTimeTrendItem[] = stories.map((story: {
            title: string;
            entityNames: string[];
            articles: Array<{ articleTitle: string; url: string; source: string }>;
        }) => ({
            title: story.title || '',
            entityNames: story.entityNames || [],
            articles: (story.articles || []).slice(0, 3).map((a) => ({
                title: a.articleTitle || '',
                url: a.url || '',
                source: a.source || '',
            })),
        }));

        // Cache results
        await redis.set(cacheKey, JSON.stringify(trends), 'EX', CACHE_TTL);

        logger.info({ count: trends.length, category }, 'Fetched real-time trends from Google');
        return trends;
    } catch (error) {
        logger.error({ error }, 'Failed to fetch real-time trends from Google');

        // Try to return stale cache if available
        const cacheKey = `${CACHE_KEY_REALTIME}:${category}`;
        const staleCache = await redis.get(cacheKey);
        if (staleCache) {
            logger.warn('Returning stale cached real-time trends');
            return JSON.parse(staleCache);
        }

        return [];
    }
}

/**
 * Get the timestamp of when trends were last updated
 */
export async function getTrendsLastUpdated(): Promise<Date | null> {
    try {
        const redis = getRedisConnection();
        const ttl = await redis.ttl(CACHE_KEY_DAILY);
        if (ttl > 0) {
            // Calculate when cache was set: now - (TTL - remaining)
            const setTime = Date.now() - ((CACHE_TTL - ttl) * 1000);
            return new Date(setTime);
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Force refresh trends cache
 */
export async function refreshTrends(geo: string = 'AU'): Promise<void> {
    const redis = getRedisConnection();
    await redis.del(CACHE_KEY_DAILY);
    await redis.del(`${CACHE_KEY_REALTIME}:all`);

    // Pre-fetch fresh data
    await Promise.all([
        getDailyTrends(geo),
        getRealTimeTrends(geo, 'all'),
    ]);
}
