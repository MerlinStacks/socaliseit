/**
 * Platform Metrics Sync Service
 * Automated synchronization of engagement metrics from TikTok and Pinterest
 * 
 * Note: This service fetches metrics from platform APIs. Metrics are cached
 * in memory for retrieval. For production, extend to persist to database.
 */

import { db } from '@/lib/db';
import { createWorkerLogger } from '@/lib/logger';
import { Platform } from '@/generated/prisma/client';

const log = createWorkerLogger('MetricsSyncService');

// ============================================================================
// Types
// ============================================================================

export interface PlatformMetrics {
    impressions: number;
    reach: number;
    engagement: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks?: number;
    videoViews?: number;
}

export interface MetricsSyncResult {
    platform: string;
    postsUpdated: number;
    errors: string[];
}

// In-memory cache for metrics
const metricsCache = new Map<string, { metrics: PlatformMetrics; syncedAt: Date }>();

// ============================================================================
// TikTok Metrics
// ============================================================================

/**
 * Fetch video metrics from TikTok
 */
async function fetchTikTokMetrics(
    accessToken: string,
    videoId: string
): Promise<PlatformMetrics | null> {
    try {
        const response = await fetch('https://open.tiktokapis.com/v2/video/query/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filters: { video_ids: [videoId] },
                fields: [
                    'view_count',
                    'like_count',
                    'comment_count',
                    'share_count',
                    'download_count',
                ],
            }),
        });

        if (!response.ok) {
            log.error(`TikTok API error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const video = data.data?.videos?.[0];

        if (!video) return null;

        return {
            impressions: video.view_count || 0,
            reach: video.view_count || 0,
            engagement: (video.like_count || 0) + (video.comment_count || 0) + (video.share_count || 0),
            likes: video.like_count || 0,
            comments: video.comment_count || 0,
            shares: video.share_count || 0,
            saves: video.download_count || 0,
            videoViews: video.view_count || 0,
        };
    } catch (error) {
        log.error(`TikTok fetch error: ${error}`);
        return null;
    }
}

/**
 * Sync metrics for TikTok posts in a workspace
 */
async function syncTikTokPosts(organizationId: string): Promise<MetricsSyncResult> {
    const result: MetricsSyncResult = {
        platform: 'TIKTOK',
        postsUpdated: 0,
        errors: [],
    };

    // Get TikTok accounts for this workspace
    const accounts = await db.socialAccount.findMany({
        where: {
            organizationId,
            platform: Platform.TIKTOK,
        },
    });

    for (const account of accounts) {
        if (!account.accessToken) continue;

        // Query PostPlatform records (junction table with platformPostId)
        const postPlatforms = await db.postPlatform.findMany({
            where: {
                socialAccountId: account.id,
                status: 'PUBLISHED',
                platformPostId: { not: null },
            },
            orderBy: { publishedAt: 'desc' },
            take: 50,
        });

        for (const pp of postPlatforms) {
            if (!pp.platformPostId) continue;

            try {
                const metrics = await fetchTikTokMetrics(account.accessToken, pp.platformPostId);

                if (metrics) {
                    metricsCache.set(pp.id, { metrics, syncedAt: new Date() });
                    result.postsUpdated++;
                }

                // Rate limiting delay
                await new Promise((r) => setTimeout(r, 100));
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                result.errors.push(`TikTok ${pp.id}: ${msg}`);
            }
        }
    }

    return result;
}

// ============================================================================
// Pinterest Metrics
// ============================================================================

/**
 * Fetch pin analytics from Pinterest
 */
async function fetchPinterestMetrics(
    accessToken: string,
    pinId: string
): Promise<PlatformMetrics | null> {
    try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const response = await fetch(
            `https://api.pinterest.com/v5/pins/${pinId}/analytics?start_date=${startDate}&end_date=${endDate}&metric_types=IMPRESSION,OUTBOUND_CLICK,PIN_CLICK,SAVE`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            }
        );

        if (!response.ok) {
            log.error(`Pinterest API error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const metrics = data.all?.daily_metrics?.[0] || {};

        return {
            impressions: metrics.IMPRESSION || 0,
            reach: metrics.IMPRESSION || 0,
            engagement: (metrics.SAVE || 0) + (metrics.PIN_CLICK || 0),
            likes: 0,
            comments: 0,
            shares: 0,
            saves: metrics.SAVE || 0,
            clicks: (metrics.OUTBOUND_CLICK || 0) + (metrics.PIN_CLICK || 0),
        };
    } catch (error) {
        log.error(`Pinterest fetch error: ${error}`);
        return null;
    }
}

/**
 * Sync metrics for Pinterest posts in a workspace
 */
async function syncPinterestPosts(organizationId: string): Promise<MetricsSyncResult> {
    const result: MetricsSyncResult = {
        platform: 'PINTEREST',
        postsUpdated: 0,
        errors: [],
    };

    const accounts = await db.socialAccount.findMany({
        where: {
            organizationId,
            platform: Platform.PINTEREST,
        },
    });

    for (const account of accounts) {
        if (!account.accessToken) continue;

        const postPlatforms = await db.postPlatform.findMany({
            where: {
                socialAccountId: account.id,
                status: 'PUBLISHED',
                platformPostId: { not: null },
            },
            orderBy: { publishedAt: 'desc' },
            take: 50,
        });

        for (const pp of postPlatforms) {
            if (!pp.platformPostId) continue;

            try {
                const metrics = await fetchPinterestMetrics(account.accessToken, pp.platformPostId);

                if (metrics) {
                    metricsCache.set(pp.id, { metrics, syncedAt: new Date() });
                    result.postsUpdated++;
                }

                await new Promise((r) => setTimeout(r, 200));
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                result.errors.push(`Pinterest ${pp.id}: ${msg}`);
            }
        }
    }

    return result;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Sync metrics for all platforms in a workspace
 */
export async function syncAllMetrics(organizationId: string): Promise<MetricsSyncResult[]> {
    log.info(`Starting metrics sync for workspace ${organizationId}`);

    const results: MetricsSyncResult[] = [];

    const tiktokResult = await syncTikTokPosts(organizationId);
    results.push(tiktokResult);
    log.info(`TikTok: ${tiktokResult.postsUpdated} posts synced`);

    const pinterestResult = await syncPinterestPosts(organizationId);
    results.push(pinterestResult);
    log.info(`Pinterest: ${pinterestResult.postsUpdated} posts synced`);

    return results;
}

/**
 * Get cached metrics for a post platform
 */
export function getPostMetrics(postPlatformId: string): PlatformMetrics | null {
    const cached = metricsCache.get(postPlatformId);
    return cached?.metrics || null;
}

/**
 * Get aggregated metrics summary by platform
 */
export async function getAggregatedMetrics(
    organizationId: string,
    _startDate: Date,
    _endDate: Date
): Promise<Record<string, PlatformMetrics>> {
    const byPlatform: Record<string, PlatformMetrics> = {};

    // Get post platforms with their accounts to determine platform
    const postPlatforms = await db.postPlatform.findMany({
        where: {
            post: { organizationId },
            status: 'PUBLISHED',
        },
        include: { socialAccount: { select: { platform: true } } },
        take: 100,
    });

    for (const pp of postPlatforms) {
        const platform = pp.socialAccount?.platform || 'UNKNOWN';
        const cached = metricsCache.get(pp.id);

        if (!cached) continue;

        if (!byPlatform[platform]) {
            byPlatform[platform] = {
                impressions: 0,
                reach: 0,
                engagement: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                saves: 0,
            };
        }

        byPlatform[platform].impressions += cached.metrics.impressions;
        byPlatform[platform].reach += cached.metrics.reach;
        byPlatform[platform].engagement += cached.metrics.engagement;
        byPlatform[platform].likes += cached.metrics.likes;
        byPlatform[platform].comments += cached.metrics.comments;
        byPlatform[platform].shares += cached.metrics.shares;
        byPlatform[platform].saves += cached.metrics.saves;
    }

    return byPlatform;
}
