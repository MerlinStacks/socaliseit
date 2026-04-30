/**
 * TikTok Discovery API Integration
 * Why: Fetches real trending hashtags and sounds from TikTok's Creative Center
 * Discovery API. Requires a TikTok for Business app with Discovery scope.
 *
 * Auth: Uses app-level access token from TIKTOK_DISCOVERY_ACCESS_TOKEN env var.
 * The Discovery API is separate from user OAuth — it provides platform-wide
 * trending data, not user-specific content.
 *
 * Rate limiting: Cached in Redis for 6 hours to minimize API calls.
 * Circuit breaker: After 3 consecutive failures, disables for 24 hours.
 */

import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { getRedisConnection } from '@/lib/bullmq/connection';
import { platformFetch } from '@/lib/fetch-with-timeout';

const TIKTOK_DISCOVERY_BASE = 'https://open.tiktokapis.com/v2';
const CACHE_TTL = 6 * 60 * 60; // 6 hours
const CIRCUIT_BREAKER_TTL = 24 * 60 * 60; // 24 hours
const MAX_FAILURES = 3;

const CACHE_KEYS = {
    hashtags: 'tiktok_discovery:trending_hashtags',
    sounds: 'tiktok_discovery:trending_sounds',
    failures: 'tiktok_discovery:failure_count',
    circuitOpen: 'tiktok_discovery:circuit_open',
    token: 'tiktok_discovery:token_cache',
};

/* ── Types ────────────────────────────────────────────────────────────── */

export interface TikTokTrendingHashtag {
    /** Hashtag name (without #) */
    name: string;
    /** Video count using this hashtag */
    videoCount: number;
    /** View count for videos with this hashtag */
    viewCount: number;
    /** Whether it's currently rising */
    isRising: boolean;
}

export interface TikTokTrendingSound {
    /** Sound/music title */
    title: string;
    /** Artist name */
    artist: string;
    /** Number of videos using this sound */
    videoCount: number;
    /** Whether it's currently rising */
    isRising: boolean;
}

/* ── Internal helpers ─────────────────────────────────────────────────── */

/**
 * Get the Discovery API access token.
 * Priority: 1) DB (super admin UI) → 2) env var.
 * DB value is cached in Redis for 5 min to avoid repeated DB lookups.
 */
async function getDiscoveryToken(): Promise<string | null> {
    // Check Redis token cache first (avoids DB hit per request)
    try {
        const redis = getRedisConnection();
        const cached = await redis.get(CACHE_KEYS.token);
        if (cached === '__none__') return null; // Cached "not configured" result
        if (cached) return cached;
    } catch {
        // Redis down, fall through to DB/env
    }

    // Check DB (super admin configured)
    try {
        const settings = await db.platformSettings.findUnique({
            where: { id: 'platform_settings' },
            select: { tiktokDiscoveryToken: true },
        });

        if (settings?.tiktokDiscoveryToken) {
            const decrypted = decrypt(settings.tiktokDiscoveryToken);
            // Cache decrypted token in Redis for 5 min
            try {
                const redis = getRedisConnection();
                await redis.set(CACHE_KEYS.token, decrypted, 'EX', 300);
            } catch { /* non-critical */ }
            return decrypted;
        }
    } catch (error) {
        logger.debug({ error }, '[TikTok Discovery] Failed to read token from DB');
    }

    // Fall back to env var
    const envToken = process.env.TIKTOK_DISCOVERY_ACCESS_TOKEN;
    if (envToken) {
        try {
            const redis = getRedisConnection();
            await redis.set(CACHE_KEYS.token, envToken, 'EX', 300);
        } catch { /* non-critical */ }
        return envToken;
    }

    // Cache the "not configured" result to avoid repeated checks
    try {
        const redis = getRedisConnection();
        await redis.set(CACHE_KEYS.token, '__none__', 'EX', 60);
    } catch { /* non-critical */ }

    logger.debug('[TikTok Discovery] No access token configured (DB or env)');
    return null;
}

/** Check if circuit breaker is open (too many failures) */
async function isCircuitOpen(): Promise<boolean> {
    try {
        const redis = getRedisConnection();
        const open = await redis.get(CACHE_KEYS.circuitOpen);
        return open === '1';
    } catch {
        return false;
    }
}

/** Record a failure and potentially open the circuit breaker */
async function recordFailure(): Promise<void> {
    try {
        const redis = getRedisConnection();
        const count = await redis.incr(CACHE_KEYS.failures);
        await redis.expire(CACHE_KEYS.failures, CACHE_TTL);

        if (count >= MAX_FAILURES) {
            logger.warn({ count }, '[TikTok Discovery] Circuit breaker opened — disabling for 24h');
            await redis.set(CACHE_KEYS.circuitOpen, '1', 'EX', CIRCUIT_BREAKER_TTL);
            await redis.del(CACHE_KEYS.failures);
        }
    } catch {
        // Redis errors in failure tracking shouldn't break the flow
    }
}

/** Reset failure count on success */
async function resetFailures(): Promise<void> {
    try {
        const redis = getRedisConnection();
        await redis.del(CACHE_KEYS.failures);
    } catch {
        // Non-critical
    }
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Fetch trending hashtags from TikTok Discovery API.
 * Returns cached data if available, fetches fresh if cache miss.
 * Returns empty array if API is not configured or circuit is open.
 */
export async function getTikTokTrendingHashtags(
    country: string = 'AU'
): Promise<TikTokTrendingHashtag[]> {
    const token = await getDiscoveryToken();
    if (!token) return [];

    if (await isCircuitOpen()) {
        logger.debug('[TikTok Discovery] Circuit open, skipping hashtag fetch');
        return [];
    }

    const redis = getRedisConnection();

    try {
        // Check cache
        const cacheKey = `${CACHE_KEYS.hashtags}:${country}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            logger.debug('[TikTok Discovery] Returning cached trending hashtags');
            return JSON.parse(cached);
        }

        // Fetch from API
        const url = `${TIKTOK_DISCOVERY_BASE}/discovery/trending_list/`;
        const response = await platformFetch('tiktok', 'discoveryTrendingList', url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                country_code: country,
                period: 7, // Last 7 days
                limit: 20,
            }),
        });

        // Guard: TikTok may return HTML error pages instead of JSON
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
            const body = await response.text();
            logger.warn({ status: response.status, contentType, body: body.slice(0, 200) }, '[TikTok Discovery] Non-JSON response for trending hashtags');
            await recordFailure();
            return [];
        }

        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            logger.warn({ error: data.error }, '[TikTok Discovery] API error for trending hashtags');
            await recordFailure();
            return [];
        }

        const hashtags: TikTokTrendingHashtag[] = (data.data?.trending_list || []).map(
            (item: Record<string, unknown>) => ({
                name: String(item.hashtag_name || item.name || ''),
                videoCount: Number(item.video_count) || 0,
                viewCount: Number(item.view_count) || 0,
                isRising: item.trend === 'UP' || item.is_promoted === false,
            })
        );

        // Cache results
        await redis.set(cacheKey, JSON.stringify(hashtags), 'EX', CACHE_TTL);
        await resetFailures();

        logger.info({ count: hashtags.length, country }, '[TikTok Discovery] Fetched trending hashtags');
        return hashtags;
    } catch (error) {
        logger.error({ error }, '[TikTok Discovery] Failed to fetch trending hashtags');
        await recordFailure();

        // Try stale cache
        const staleKey = `${CACHE_KEYS.hashtags}:${country}`;
        const stale = await redis.get(staleKey);
        if (stale) {
            logger.warn('[TikTok Discovery] Returning stale cached hashtags');
            return JSON.parse(stale);
        }

        return [];
    }
}

/**
 * Fetch trending sounds from TikTok Discovery API.
 * Returns cached data if available, fetches fresh if cache miss.
 * Returns empty array if API is not configured or circuit is open.
 */
export async function getTikTokTrendingSounds(
    country: string = 'AU'
): Promise<TikTokTrendingSound[]> {
    const token = await getDiscoveryToken();
    if (!token) return [];

    if (await isCircuitOpen()) {
        logger.debug('[TikTok Discovery] Circuit open, skipping sound fetch');
        return [];
    }

    const redis = getRedisConnection();

    try {
        // Check cache
        const cacheKey = `${CACHE_KEYS.sounds}:${country}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            logger.debug('[TikTok Discovery] Returning cached trending sounds');
            return JSON.parse(cached);
        }

        // Fetch from API — sounds use the same discovery endpoint pattern
        const url = `${TIKTOK_DISCOVERY_BASE}/discovery/trending_list/`;
        const response = await platformFetch('tiktok', 'discoveryTrendingSounds', url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                country_code: country,
                period: 7,
                limit: 10,
                type: 'sound', // Request sound trends
            }),
        });

        // Guard: TikTok may return HTML error pages instead of JSON
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
            const body = await response.text();
            logger.warn({ status: response.status, contentType, body: body.slice(0, 200) }, '[TikTok Discovery] Non-JSON response for trending sounds');
            await recordFailure();
            return [];
        }

        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            logger.warn({ error: data.error }, '[TikTok Discovery] API error for trending sounds');
            await recordFailure();
            return [];
        }

        const sounds: TikTokTrendingSound[] = (data.data?.trending_list || []).map(
            (item: Record<string, unknown>) => ({
                title: String(item.sound_name || item.title || item.name || ''),
                artist: String(item.artist || item.author || 'Unknown'),
                videoCount: Number(item.video_count) || 0,
                isRising: item.trend === 'UP',
            })
        );

        // Cache results
        await redis.set(cacheKey, JSON.stringify(sounds), 'EX', CACHE_TTL);
        await resetFailures();

        logger.info({ count: sounds.length, country }, '[TikTok Discovery] Fetched trending sounds');
        return sounds;
    } catch (error) {
        logger.error({ error }, '[TikTok Discovery] Failed to fetch trending sounds');
        await recordFailure();

        // Try stale cache
        const staleKey = `${CACHE_KEYS.sounds}:${country}`;
        const stale = await redis.get(staleKey);
        if (stale) {
            logger.warn('[TikTok Discovery] Returning stale cached sounds');
            return JSON.parse(stale);
        }

        return [];
    }
}

/**
 * Search TikTok trends by keyword.
 * Useful for checking if a specific topic/hashtag is trending.
 */
export async function searchTikTokTrends(
    keyword: string,
    country: string = 'AU'
): Promise<TikTokTrendingHashtag[]> {
    const token = await getDiscoveryToken();
    if (!token) return [];

    if (await isCircuitOpen()) return [];

    try {
        const url = `${TIKTOK_DISCOVERY_BASE}/discovery/trending/search/keyword/`;
        const response = await platformFetch('tiktok', 'discoveryTrendingSearch', url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                keyword,
                country_code: country,
            }),
        });

        // Guard: TikTok may return HTML error pages instead of JSON
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
            const body = await response.text();
            logger.warn({ status: response.status, contentType, body: body.slice(0, 200) }, '[TikTok Discovery] Non-JSON search response');
            return [];
        }

        const data = await response.json();

        if (data.error && data.error.code !== 'ok') {
            logger.warn({ error: data.error, keyword }, '[TikTok Discovery] Search API error');
            return [];
        }

        return (data.data?.trending_list || []).map((item: Record<string, unknown>) => ({
            name: String(item.hashtag_name || item.name || keyword),
            videoCount: Number(item.video_count) || 0,
            viewCount: Number(item.view_count) || 0,
            isRising: item.trend === 'UP',
        }));
    } catch (error) {
        logger.error({ error, keyword }, '[TikTok Discovery] Search failed');
        return [];
    }
}
