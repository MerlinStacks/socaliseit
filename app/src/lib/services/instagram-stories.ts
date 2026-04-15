/**
 * Instagram Stories & Reels Service
 * Supports 2026 Instagram Content Publishing API
 */

import { db } from '@/lib/db';
import { createWorkerLogger } from '@/lib/logger';
import { ensureValidToken } from '@/lib/services/token-service';
import { GRAPH_API_URL } from '@/lib/platform-api/constants';

const log = createWorkerLogger('InstagramStoriesService');

const GRAPH_API_BASE = GRAPH_API_URL;

// ============================================================================
// Types
// ============================================================================

export type ContentType = 'story' | 'reel';

export interface StoryMediaItem {
    type: 'image' | 'video';
    url: string;
    duration?: number; // For videos, in seconds
}

export interface ReelConfig {
    videoUrl: string;
    caption?: string;
    coverImageUrl?: string;
    shareToFeed?: boolean;
    audioName?: string;
}

export interface StoryConfig {
    mediaItems: StoryMediaItem[];
    linkUrl?: string;
    linkText?: string;
}

export interface PublishResult {
    success: boolean;
    containerId?: string;
    mediaId?: string;
    permalink?: string;
    error?: string;
}

// ============================================================================
// Container Creation
// ============================================================================

/**
 * Create a Story container
 */
async function createStoryContainer(
    igUserId: string,
    accessToken: string,
    config: StoryConfig
): Promise<{ containerId: string }> {
    // Instagram Stories API requires single media items
    if (!config.mediaItems || config.mediaItems.length === 0) {
        throw new Error('At least one media item is required for a Story');
    }
    const mediaItem = config.mediaItems[0];

    const params: Record<string, string> = {
        media_type: 'STORIES',
    };

    if (mediaItem.type === 'image') {
        params.image_url = mediaItem.url;
    } else {
        params.video_url = mediaItem.url;
    }

    if (config.linkUrl) {
        params.link = config.linkUrl;
    }

    // Why: Bearer header avoids token leakage into server logs and CDN caches.
    const response = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(params),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create story container');
    }

    const data = await response.json();
    return { containerId: data.id };
}

/**
 * Create a Reel container
 */
async function createReelContainer(
    igUserId: string,
    accessToken: string,
    config: ReelConfig
): Promise<{ containerId: string }> {
    const params: Record<string, unknown> = {
        media_type: 'REELS',
        video_url: config.videoUrl,
        caption: config.caption || '',
        share_to_feed: config.shareToFeed ?? true,
    };

    if (config.coverImageUrl) {
        params.cover_url = config.coverImageUrl;
    }

    if (config.audioName) {
        params.audio_name = config.audioName;
    }

    const response = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(params),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create reel container');
    }

    const data = await response.json();
    return { containerId: data.id };
}

// ============================================================================
// Container Status Check
// ============================================================================

/**
 * Check container upload status (videos require processing)
 */
async function checkContainerStatus(
    containerId: string,
    accessToken: string
): Promise<'finished' | 'in_progress' | 'error'> {
    // Why: Bearer header avoids token leakage into server logs.
    const response = await fetch(
        `${GRAPH_API_BASE}/${containerId}?fields=status_code`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
        return 'error';
    }

    const data = await response.json();
    return data.status_code?.toLowerCase() || 'in_progress';
}

/**
 * Wait for container to be ready (with timeout)
 */
async function waitForContainerReady(
    containerId: string,
    accessToken: string,
    maxWaitMs: number = 300000 // 5 minutes
): Promise<boolean> {
    const startTime = Date.now();
    // Why: Adaptive backoff — start at 2s, increase to 5s after initial polls.
    // Same pattern used across all other platform pollers.
    let attempt = 0;

    while (Date.now() - startTime < maxWaitMs) {
        const pollInterval = attempt < 3 ? 2000 : 5000;
        const status = await checkContainerStatus(containerId, accessToken);

        if (status === 'finished') return true;
        if (status === 'error') return false;

        await new Promise((r) => setTimeout(r, pollInterval));
        attempt++;
    }

    return false;
}

// ============================================================================
// Publishing
// ============================================================================

/**
 * Publish a container (Story or Reel)
 */
async function publishContainer(
    igUserId: string,
    accessToken: string,
    containerId: string
): Promise<{ mediaId: string }> {
    const response = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            creation_id: containerId,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to publish content');
    }

    const data = await response.json();
    return { mediaId: data.id };
}

/**
 * Get media permalink
 */
async function getMediaPermalink(
    mediaId: string,
    accessToken: string
): Promise<string | null> {
    const response = await fetch(
        `${GRAPH_API_BASE}/${mediaId}?fields=permalink`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.permalink || null;
}

// ============================================================================
// Main API Functions
// ============================================================================

/**
 * Publish an Instagram Story
 */
export async function publishStory(
    socialAccountId: string,
    config: StoryConfig
): Promise<PublishResult> {
    try {
        const account = await db.socialAccount.findUnique({
            where: { id: socialAccountId },
        });

        if (!account?.platformId) {
            return { success: false, error: 'Invalid account configuration' };
        }

        // Why: Token must be decrypted and validated before use.
        // Previously used raw DB token (encrypted), which would silently fail all API calls.
        const tokenResult = await ensureValidToken(socialAccountId);
        if (!tokenResult.success || !tokenResult.accessToken) {
            return { success: false, error: tokenResult.error || 'Token refresh failed' };
        }
        const accessToken = tokenResult.accessToken;

        // Create container
        const { containerId } = await createStoryContainer(
            account.platformId,
            accessToken,
            config
        );

        // Wait for processing (if video)
        if (config.mediaItems[0].type === 'video') {
            const ready = await waitForContainerReady(containerId, accessToken);
            if (!ready) {
                return { success: false, containerId, error: 'Video processing timeout' };
            }
        }

        // Publish
        const { mediaId } = await publishContainer(
            account.platformId,
            accessToken,
            containerId
        );

        const permalink = await getMediaPermalink(mediaId, accessToken);

        log.info({ mediaId, platform: 'instagram', contentType: 'story' }, 'Published story');
        return { success: true, containerId, mediaId, permalink: permalink || undefined };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.error({ error: message, platform: 'instagram', contentType: 'story' }, 'Story publish failed');
        return { success: false, error: message };
    }
}

/**
 * Publish an Instagram Reel
 */
export async function publishReel(
    socialAccountId: string,
    config: ReelConfig
): Promise<PublishResult> {
    try {
        const account = await db.socialAccount.findUnique({
            where: { id: socialAccountId },
        });

        if (!account?.platformId) {
            return { success: false, error: 'Invalid account configuration' };
        }

        // Why: Token must be decrypted and validated before use.
        const tokenResult = await ensureValidToken(socialAccountId);
        if (!tokenResult.success || !tokenResult.accessToken) {
            return { success: false, error: tokenResult.error || 'Token refresh failed' };
        }
        const accessToken = tokenResult.accessToken;

        // Create container
        const { containerId } = await createReelContainer(
            account.platformId,
            accessToken,
            config
        );

        // Reels always require video processing
        const ready = await waitForContainerReady(containerId, accessToken, 600000); // 10 min
        if (!ready) {
            return { success: false, containerId, error: 'Video processing timeout' };
        }

        // Publish
        const { mediaId } = await publishContainer(
            account.platformId,
            accessToken,
            containerId
        );

        const permalink = await getMediaPermalink(mediaId, accessToken);

        log.info({ mediaId, platform: 'instagram', contentType: 'reel' }, 'Published reel');
        return { success: true, containerId, mediaId, permalink: permalink || undefined };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.error({ error: message, platform: 'instagram', contentType: 'reel' }, 'Reel publish failed');
        return { success: false, error: message };
    }
}

/**
 * Get Stories/Reels insights
 */
export async function getContentInsights(
    mediaId: string,
    accessToken: string,
    contentType: ContentType
): Promise<Record<string, number>> {
    const metrics = contentType === 'story'
        ? 'exits,impressions,reach,replies,taps_forward,taps_back'
        : 'comments,likes,plays,reach,saved,shares,total_interactions';

    const response = await fetch(
        `${GRAPH_API_BASE}/${mediaId}/insights?metric=${metrics}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
        throw new Error('Failed to fetch insights');
    }

    const data = await response.json();
    const insights: Record<string, number> = {};

    for (const metric of data.data || []) {
        insights[metric.name] = metric.values?.[0]?.value || 0;
    }

    return insights;
}
