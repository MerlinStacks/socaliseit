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

const CACHE_TTL = 30 * 60; // 30 minute cache — shorter to keep trends current
const CACHE_KEY_DAILY = 'google_trends:daily';
const CACHE_KEY_REALTIME = 'google_trends:realtime';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/**
 * Extract a loggable error message from an unknown caught value.
 * Native Error objects have non-enumerable properties that Pino's
 * default JSON serializer cannot see (they render as `{}`).
 */
function serializeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return String(err); }
}

/** Simple exponential back-off retry wrapper */
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
                logger.warn({ attempt: attempt + 1, delay, reason: serializeError(err) }, 'Google Trends request failed, retrying');
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

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

        const results = await withRetry(() => googleTrends.dailyTrends({
            geo,
            hl: 'en',
        }));

        const parsed = JSON.parse(results as string);
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
        logger.error({ err: serializeError(error) }, 'Failed to fetch daily trends from Google');

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

        const results = await withRetry(() => googleTrends.realTimeTrends({
            geo,
            hl: 'en',
            category,
        }));

        const parsed = JSON.parse(results as string);
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
        logger.error({ err: serializeError(error) }, 'Failed to fetch real-time trends from Google');

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

export interface TrendsFreshness {
    /** Age in seconds for each data source; null = no cached data */
    google: number | null;
    googleRealtime: number | null;
}

/**
 * Return per-source cache age so the frontend can show freshness indicators.
 */
export async function getTrendsFreshness(): Promise<TrendsFreshness> {
    try {
        const redis = getRedisConnection();
        const [dailyTtl, realtimeTtl] = await Promise.all([
            redis.ttl(CACHE_KEY_DAILY),
            redis.ttl(`${CACHE_KEY_REALTIME}:all`),
        ]);

        return {
            google: dailyTtl > 0 ? CACHE_TTL - dailyTtl : null,
            googleRealtime: realtimeTtl > 0 ? CACHE_TTL - realtimeTtl : null,
        };
    } catch {
        return { google: null, googleRealtime: null };
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
