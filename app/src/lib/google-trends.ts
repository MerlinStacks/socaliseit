/**
 * Google Trends Service
 * Fetches daily trending topics from Google Trends via the public RSS feed.
 *
 * Why RSS instead of google-trends-api npm package:
 * The npm package scrapes Google's web pages and is consistently blocked
 * from server/Docker IPs (returns HTML captcha pages instead of JSON).
 * The RSS feed is an official Google endpoint that works reliably without
 * API keys or authentication.
 *
 * Feed URL: https://trends.google.com/trending/rss?geo={geo}
 * Data is cached in Redis to avoid hammering the endpoint.
 */

import { logger } from '@/lib/logger';
import { getRedisConnection } from '@/lib/bullmq/connection';
import { safeJsonParse } from '@/lib/utils';

const CACHE_TTL = 30 * 60; // 30 minute cache
const CACHE_KEY_DAILY = 'google_trends:daily';
const CACHE_KEY_REALTIME = 'google_trends:realtime';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const RSS_FETCH_TIMEOUT_MS = 10_000;

/**
 * Extract a loggable error message from an unknown caught value.
 * Why: Native Error objects have non-enumerable properties that Pino's
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
                logger.warn({ attempt: attempt + 1, delay, reason: serializeError(err) }, 'Google Trends RSS fetch failed, retrying');
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

// ── RSS Feed Fetching & Parsing ─────────────────────────────────────────

/**
 * Fetch the Google Trends RSS feed for a given country.
 * Why native fetch: No npm dependency needed — RSS is just an HTTP GET.
 */
async function fetchTrendingRSS(geo: string): Promise<string> {
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                // Why: Google sometimes returns different content based on Accept header
                'Accept': 'application/rss+xml, application/xml, text/xml',
                'User-Agent': 'Mozilla/5.0 (compatible; TrendFetcher/1.0)',
            },
        });

        if (!res.ok) {
            throw new Error(`RSS feed returned HTTP ${res.status}`);
        }

        const text = await res.text();

        // Sanity check: make sure we actually got XML, not an HTML error page
        if (!text.includes('<rss') && !text.includes('<channel>')) {
            throw new Error('Response is not valid RSS XML');
        }

        return text;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Decode XML/HTML entities in text content.
 * Why: RSS feeds encode characters like &amp; &lt; &apos; etc.
 */
function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Extract the text content of an XML tag from a block of XML.
 * Returns undefined if the tag is not found or is self-closing empty.
 */
function extractTag(xml: string, tagName: string): string | undefined {
    // Match both <tag>content</tag> and <ns:tag>content</ns:tag>
    const pattern = new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, 'i');
    const match = xml.match(pattern);
    if (!match) return undefined;
    const content = match[1].trim();
    return content.length > 0 ? decodeEntities(content) : undefined;
}

/**
 * Extract all occurrences of an XML tag's text content from a block.
 */
function extractAllTags(xml: string, tagName: string): string[] {
    const pattern = new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, 'gi');
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
        const content = match[1].trim();
        if (content.length > 0) {
            results.push(decodeEntities(content));
        }
    }
    return results;
}

/**
 * Parse Google Trends RSS XML into GoogleTrendItem[].
 *
 * RSS structure per <item>:
 *   <title>topic name</title>
 *   <ht:approx_traffic>200+</ht:approx_traffic>
 *   <ht:picture>https://...</ht:picture>
 *   <ht:news_item>
 *     <ht:news_item_title>Article headline</ht:news_item_title>
 *     <ht:news_item_url>https://...</ht:news_item_url>
 *     <ht:news_item_source>Publisher</ht:news_item_source>
 *   </ht:news_item>
 */
function parseRSSItems(xml: string): GoogleTrendItem[] {
    const items: GoogleTrendItem[] = [];

    // Split on <item> boundaries
    const itemBlocks = xml.split(/<item>/i).slice(1); // skip preamble before first <item>

    for (const block of itemBlocks) {
        const itemXml = block.split(/<\/item>/i)[0];
        if (!itemXml) continue;

        const title = extractTag(itemXml, 'title');
        if (!title) continue;

        const approxTraffic = extractTag(itemXml, 'approx_traffic') ?? '10K+';
        const imageUrl = extractTag(itemXml, 'picture');

        // Extract news article titles from <ht:news_item> blocks
        const articleTitles = extractAllTags(itemXml, 'news_item_title');

        items.push({
            title,
            formattedTraffic: approxTraffic,
            relatedQueries: [], // RSS feed doesn't include related queries
            articleTitles,
            imageUrl,
        });
    }

    return items;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get daily trending searches from Google Trends RSS feed.
 * Returns top trending searches, updated frequently by Google.
 */
export async function getDailyTrends(geo: string = 'AU'): Promise<GoogleTrendItem[]> {
    const redis = getRedisConnection();

    try {
        // Check cache first
        const cached = await redis.get(CACHE_KEY_DAILY);
        if (cached) {
            logger.debug('Returning cached daily trends');
            return safeJsonParse<GoogleTrendItem[]>(cached, []);
        }

        const xml = await withRetry(() => fetchTrendingRSS(geo));
        const trends = parseRSSItems(xml);

        // Cache results
        if (trends.length > 0) {
            await redis.set(CACHE_KEY_DAILY, JSON.stringify(trends), 'EX', CACHE_TTL);
        }

        logger.info({ count: trends.length }, 'Fetched daily trends from Google');
        return trends;
    } catch (error) {
        logger.error({ err: serializeError(error) }, 'Failed to fetch daily trends from Google');

        // Try to return stale cache if available
        const staleCache = await redis.get(CACHE_KEY_DAILY);
        if (staleCache) {
            logger.warn('Returning stale cached daily trends');
            return safeJsonParse<GoogleTrendItem[]>(staleCache, []);
        }

        return [];
    }
}

/**
 * Get real-time trending stories from Google Trends.
 *
 * Why empty: Google does not offer a free public endpoint for real-time
 * trending stories without authentication. The old google-trends-api
 * scraper for this was always blocked. Returns empty array so callers
 * degrade gracefully (they already handle []).
 */
export async function getRealTimeTrends(
    _geo: string = 'AU',
    _category: 'all' | 'e' | 'b' | 't' | 'm' | 's' | 'h' = 'all'
): Promise<RealTimeTrendItem[]> {
    logger.debug('Real-time trends unavailable (no free endpoint) — returning empty');
    return [];
}

// ── Cache Utilities ─────────────────────────────────────────────────────

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
        const dailyTtl = await redis.ttl(CACHE_KEY_DAILY);

        return {
            google: dailyTtl > 0 ? CACHE_TTL - dailyTtl : null,
            // Why null: no real-time endpoint available
            googleRealtime: null,
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
    await getDailyTrends(geo);
}
