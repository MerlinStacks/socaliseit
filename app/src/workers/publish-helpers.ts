/**
 * Publish Helpers
 *
 * Why: Extracted from post-publisher.ts to eliminate ~180 lines of duplicated
 * code between the NEW and LEGACY architecture publish paths. Both paths
 * now call these shared helpers for token refresh, platform dispatch,
 * timeout racing, and error handling.
 */

import { db } from '@/lib/db';
import { getUserFriendlyError } from '@/lib/error-messages';
import { withRetry, classifyError } from '@/lib/resilience/retry-strategy';
import { withCircuitBreaker, CircuitOpenError } from '@/lib/resilience/circuit-breaker';
import { recordOutcome } from '@/lib/resilience/platform-health';
import type { Logger } from 'pino';
import type { PostModel } from '@/generated/prisma/models/Post';
import type { SocialAccountModel } from '@/generated/prisma/models/SocialAccount';
import type { PostMediaModel } from '@/generated/prisma/models/PostMedia';
import type { MediaModel } from '@/generated/prisma/models/Media';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Why: Represents the post shape returned by
 * `db.post.findUnique({ include: { socialAccount, media: { include: { media } } } })`.
 * Replaces `any` used throughout the publish pipeline.
 */
export type PublishablePostMedia = PostMediaModel & { media: MediaModel };

export type PublishablePost = PostModel & {
    socialAccount: SocialAccountModel | null;
    media: PublishablePostMedia[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Why: Prevents silent hangs in platform API calls from keeping a post stuck
 * in PUBLISHING status indefinitely.
 *
 * Set to 14 min because IG container polling can take up to 12 min (144×5s),
 * plus upload + publish step time. Must be less than LOCK_TTL (15 min).
 */
export const PUBLISH_TIMEOUT_MS = 14 * 60 * 1000; // 14 minutes

/**
 * Platforms that do NOT accept WebP images via their API.
 * Why: Instagram (JPEG only), Facebook/Pinterest/LinkedIn (JPG/PNG only),
 * Google Business (JPG/PNG only).
 */
const PLATFORMS_NO_WEBP = new Set(['instagram', 'facebook', 'pinterest', 'linkedin', 'google_business']);

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Append ?format=jpeg to .webp media URLs for platforms that reject WebP.
 * Only rewrites local /api/uploads/ paths — external URLs are left untouched.
 *
 * Why: Uses URL pathname parsing instead of string.endsWith('.webp') so that
 * URLs with existing query parameters are correctly detected and rewritten.
 */
export function rewriteWebpUrls(urls: string[], platform: string): string[] {
    if (!PLATFORMS_NO_WEBP.has(platform.toLowerCase())) return urls;
    return urls.map(url => {
        try {
            const parsed = new URL(url, 'http://localhost');
            // Why: Only rewrite local paths (e.g. /api/uploads/...). External CDN
            // URLs may not understand ?format=jpeg and could return 404.
            const isLocalPath = !url.startsWith('http');
            if (parsed.pathname.toLowerCase().endsWith('.webp') && isLocalPath) {
                parsed.searchParams.set('format', 'jpeg');
                return `${parsed.pathname}${parsed.search}`;
            }
            return url;
        } catch {
            // Fallback: only rewrite if it looks like a local path
            if (!url.startsWith('http') && url.toLowerCase().endsWith('.webp')) {
                return `${url}?format=jpeg`;
            }
            return url;
        }
    });
}

/**
 * Why: JSON.stringify(new Error('msg')) produces '{}' because Error properties
 * aren't enumerable. This helper captures the useful fields.
 */
export function serializeError(err: unknown): string {
    if (err instanceof Error) {
        return JSON.stringify({
            message: err.message,
            name: err.name,
            stack: err.stack?.split('\n').slice(0, 5).join('\n'),
            cause: err.cause ? String(err.cause) : undefined,
        });
    }
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

// ---------------------------------------------------------------------------
// Payload Builder
// ---------------------------------------------------------------------------

/**
 * Build the content payload for publishToPlatform from a post and optional overrides.
 *
 * Why: Both NEW and LEGACY paths construct an identical ~30-field payload object.
 * Centralising it here eliminates duplication and ensures new platform fields
 * are added in one place only.
 */
export function buildPublishPayload(post: PublishablePost, overrides?: { caption?: string; postType?: string; firstComment?: string }, platform?: string) {
    const mediaUrls = rewriteWebpUrls(
        post.media.map((m) => {
            // Why: Prefer pre-transcoded H.264 version for optimal platform quality.
            // The transcodedUrl is set at upload-time by api/media/route.ts.
            if (m.media.mimeType?.startsWith('video/') && m.media.transcodedUrl) {
                return m.media.transcodedUrl;
            }
            return m.media.url;
        }),
        platform || post.platform || '',
    );
    return {
        caption: overrides?.caption || post.caption,
        mediaUrls,
        mediaType: post.media.length === 0 ? 'text' as const :
            post.media[0]?.media.mimeType?.startsWith('video/') ? 'video' as const :
                post.media.length > 1 ? 'carousel' as const : 'image' as const,
        postType: ((overrides?.postType || post.postType)?.toLowerCase() || 'feed') as 'feed' | 'story' | 'reel' | 'carousel' | 'pin' | 'video' | 'article' | 'thread',
        firstComment: overrides?.firstComment || post.firstComment || undefined,
        thumbnailUrl: post.media[0]?.customThumbnailUrl || undefined,
        // Pinterest
        pinTitle: post.pinTitle || undefined,
        link: post.pinLink || undefined,
        boardId: post.boardId || undefined,
        // Location
        location: post.location || undefined,
        // YouTube
        videoTitle: post.videoTitle || undefined,
        youtubeCategory: post.youtubeCategory || undefined,
        youtubePlaylist: post.youtubePlaylist || undefined,
        videoTags: post.videoTags?.length ? post.videoTags : undefined,
        embeddable: post.embeddable,
        notifySubscribers: post.notifySubscribers,
        madeForKids: post.madeForKids,
        youtubePrivacy: post.youtubePrivacy as 'public' | 'private' | 'unlisted' | undefined,
        // Why (BUG-36): Forward YouTube comments toggle — previously always enabled
        youtubeCommentsEnabled: post.youtubeCommentsEnabled,
        // Why (BUG-45): Forward createFirstLike — previously never included in payload
        createFirstLike: post.createFirstLike,
        // Why (BUG-37): Forward LinkedIn visibility — previously always PUBLIC
        linkedinVisibility: (post.linkedinVisibility || undefined) as 'PUBLIC' | 'CONNECTIONS' | undefined,
        // TikTok
        tiktokPrivacyLevel: (post.tiktokPrivacyLevel || undefined) as 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY' | undefined,
        tiktokBrandOrganic: post.tiktokBrandOrganic,
        tiktokBrandContent: post.tiktokBrandContent,
        tiktokIsAigc: post.tiktokIsAigc,
        tiktokComments: post.tiktokComments,
        tiktokDuets: post.tiktokDuets,
        tiktokStitches: post.tiktokStitches,
        // Instagram
        instagramShareToFeed: post.instagramShareToFeed,
        instagramComments: post.instagramComments,
    };
}

// ---------------------------------------------------------------------------
// Single-platform publish (shared between NEW + LEGACY paths)
// ---------------------------------------------------------------------------

/** Result returned by publishSinglePlatform */
export interface SinglePublishResult {
    platform: string;
    success: boolean;
    postId?: string;
    error?: string;
    friendlyError?: string;
}

/**
 * Publish a single post to a single platform with token refresh, timeout, and error handling.
 *
 * Why: Both NEW and LEGACY architecture paths had ~70 identical lines for
 * loading the publisher module, refreshing OAuth tokens, racing against a
 * timeout, and recording errors. This shared function eliminates that duplication.
 */
export async function publishSinglePlatform(
    socialAccount: SocialAccountModel,
    payload: ReturnType<typeof buildPublishPayload>,
    postId: string,
    log: Logger,
    /** Why: Prevents infinite retry loops — set to true on the recursive call after token refresh */
    isRetryAttempt = false,
): Promise<SinglePublishResult> {
    const platform = socialAccount.platform;

    try {
        const { publishToPlatform } = await import('@/lib/platforms');
        const { ensureValidToken } = await import('@/lib/services/token-service');

        // Why: socialAccount.accessToken from DB may be encrypted or expired
        const tokenResult = await ensureValidToken(socialAccount.id);
        if (!tokenResult.success || !tokenResult.accessToken) {
            throw new Error(tokenResult.error || 'Failed to get valid access token');
        }

        // Why: withCircuitBreaker prevents flooding a degraded platform.
        // withRetry handles transient API errors within a single BullMQ job attempt.
        // The outer BullMQ retry (3 attempts, 30s backoff) handles catastrophic failures.
        const result = await withCircuitBreaker(platform, () =>
            withRetry(
                async () => {
                    // Why: Timer ref stored so clearTimeout prevents dangling unhandled rejection
                    let timeoutId: ReturnType<typeof setTimeout>;
                    const publishResult = await Promise.race([
                        publishToPlatform(
                            {
                                id: socialAccount.id,
                                platform: socialAccount.platform.toLowerCase() as Parameters<typeof publishToPlatform>[0]['platform'],
                                accountId: socialAccount.platformId || socialAccount.id,
                                accountName: socialAccount.username || socialAccount.platformId || 'unknown',
                                accessToken: tokenResult.accessToken!,
                                refreshToken: socialAccount.refreshToken || undefined,
                                tokenExpiresAt: socialAccount.tokenExpiry || new Date(Date.now() + 86400000),
                                isConnected: true,
                            },
                            payload,
                        ),
                        new Promise<never>((_, reject) => {
                            timeoutId = setTimeout(() => reject(new Error(
                                `Publishing to ${platform} timed out after ${PUBLISH_TIMEOUT_MS / 1000}s. ` +
                                'The platform API may be unresponsive.'
                            )), PUBLISH_TIMEOUT_MS);
                        }),
                    ]);
                    clearTimeout(timeoutId!);

                    if (!publishResult.success) {
                        throw new Error(publishResult.error || 'Publishing failed');
                    }
                    return publishResult;
                },
                {
                    maxAttempts: 3,
                    baseDelayMs: 3000,
                    platform,
                    log,
                    logContext: { postId, accountId: socialAccount.id },
                },
            ),
        );

        await recordOutcome(platform, true);
        return { platform, success: true, postId: result.postId };
    } catch (platformError) {
        await recordOutcome(platform, false);

        // Why: Circuit breaker open = platform is known degraded. Surface a specific message.
        if (platformError instanceof CircuitOpenError) {
            log.warn({ platform }, 'Circuit breaker open — skipping publish');
            await db.publishError.create({
                data: {
                    postId,
                    platform,
                    errorCode: 'CIRCUIT_OPEN',
                    errorRaw: platformError.message,
                    errorHuman: `${platform} is currently experiencing issues. Your post will be retried automatically.`,
                    suggestion: 'The system will retry once the platform recovers.',
                },
            });
            return { platform, success: false, error: platformError.message, friendlyError: `${platform} is temporarily unavailable` };
        }

        const errorMessage = platformError instanceof Error ? platformError.message : 'Unknown error';
        const friendlyError = getUserFriendlyError(platformError);
        const classification = classifyError(platformError);
        log.error({ platform, err: platformError, classification: classification.category }, 'Failed to publish to platform');

        // Why: On auth errors, attempt token refresh before deactivating
        if (friendlyError.category === 'auth') {
            const { handle401Error } = await import('@/lib/services/token-service');
            const refreshResult = await handle401Error(socialAccount.id, errorMessage);
            if (refreshResult.needsReconnect) {
                log.warn({ accountId: socialAccount.id, platform }, 'Account deactivated — needs reconnection');
            } else if (refreshResult.success && !isRetryAttempt) {
                // Why: Token was stale but refresh succeeded — retry once with the new token
                // instead of reporting failure. The isRetryAttempt guard prevents infinite loops.
                log.info({ accountId: socialAccount.id, platform }, 'Token refreshed — retrying publish');
                return publishSinglePlatform(socialAccount, payload, postId, log, true);
            } else if (refreshResult.success) {
                log.info({ accountId: socialAccount.id, platform }, 'Token refreshed — account stays active for next retry');
            }
        }

        await db.publishError.create({
            data: {
                postId,
                platform,
                errorCode: classification.retryability === 'permanent' ? 'PERMANENT_FAILURE' : 'PUBLISH_FAILED',
                errorRaw: serializeError(platformError),
                errorHuman: friendlyError.message,
                suggestion: friendlyError.suggestion,
            },
        });

        return { platform, success: false, error: errorMessage, friendlyError: friendlyError.message };
    }
}
