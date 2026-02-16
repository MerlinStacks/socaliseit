/**
 * Post Publisher Worker
 * Processes scheduled posts and publishes them to social platforms
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { PostPublishJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { sendPostFailedNotification, sendPostPublishedNotification } from '@/lib/push-notifications';
import { getUserFriendlyError } from '@/lib/error-messages';
import { acquirePublishLock, releasePublishLock } from '@/lib/publish-lock';

/**
 * Why: Prevents silent hangs in platform API calls (e.g. Instagram video
 * container polling, Facebook resumable uploads) from keeping a post stuck
 * in PUBLISHING status indefinitely.
 */
const PUBLISH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Platforms that do NOT accept WebP images via their API.
 * Why: Instagram (JPEG only), Facebook/Pinterest/LinkedIn (JPG/PNG only),
 * Google Business (JPG/PNG only). When publishing to these platforms,
 * WebP URLs are rewritten with ?format=jpeg so the uploads route
 * converts on-the-fly via sharp.
 */
const PLATFORMS_NO_WEBP = new Set(['instagram', 'facebook', 'pinterest', 'linkedin', 'google_business']);

/**
 * Append ?format=jpeg to .webp media URLs for platforms that reject WebP.
 * Only rewrites local /api/uploads/ paths — external URLs are left untouched.
 */
function rewriteWebpUrls(urls: string[], platform: string): string[] {
    if (!PLATFORMS_NO_WEBP.has(platform.toLowerCase())) return urls;
    return urls.map(url =>
        url.toLowerCase().endsWith('.webp')
            ? `${url}?format=jpeg`
            : url
    );
}

/**
 * Why: JSON.stringify(new Error('msg')) produces '{}' because Error properties
 * aren't enumerable. This helper captures the useful fields.
 */
function serializeError(err: unknown): string {
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

/**
 * Process a post publishing job.
 * Handles OAuth token refresh, platform API calls, and status updates.
 * 
 * Supports both:
 * - NEW architecture: Post has platform/socialAccountId set directly (single platform)
 * - LEGACY: Post uses PostPlatform relations (multi-platform from one Post)
 */
async function processPostPublish(job: Job<PostPublishJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'post-publish');
    const { postId, organizationId, platformIds } = job.data;

    log.info({ postId, platformIds }, 'Starting post publish job');

    // Acquire distributed lock to prevent double-publish
    const lockToken = await acquirePublishLock(postId);
    if (!lockToken) {
        log.warn({ postId }, 'Post is already being published by another worker, skipping');
        return; // Another worker is handling this post
    }

    try {
        // Database-level guard: Check if post is already being published or published
        const currentPost = await db.post.findUnique({
            where: { id: postId },
            select: { status: true },
        });

        if (!currentPost) {
            throw new Error(`Post not found: ${postId}`);
        }

        // Prevent re-processing if already publishing or published
        // Allow retries to bypass this check if isRetry flag is set
        if (currentPost.status === 'PUBLISHING') {
            if (job.data.isRetry) {
                log.info({ postId }, 'Post in PUBLISHING status but isRetry=true, resetting for retry');
                // Reset status to allow retry
                await db.post.update({
                    where: { id: postId },
                    data: { status: 'SCHEDULED' },
                });
            } else {
                log.warn({ postId }, 'Post already in PUBLISHING status, skipping duplicate');
                return;
            }
        }

        if (currentPost.status === 'PUBLISHED') {
            log.warn({ postId }, 'Post already PUBLISHED, skipping');
            return;
        }

        // Why: Stale cleanup may have reset this post to FAILED while a BullMQ retry
        // was still in the queue. Without this guard, the retry fires, sets PUBLISHING
        // again, hangs, stale cleanup resets again → infinite loop.
        if (currentPost.status === 'FAILED' && !job.data.isRetry) {
            log.warn({ postId, attemptsMade: job.attemptsMade }, 'Post already FAILED (stale cleanup), skipping non-retry job');
            return;
        }

        // Update post status to PUBLISHING
        await db.post.update({
            where: { id: postId },
            data: { status: 'PUBLISHING' },
        });

        // Fetch post with all related data
        const post = await db.post.findUnique({
            where: { id: postId },
            include: {
                // NEW: Direct social account relation
                socialAccount: true,
                // LEGACY: PostPlatform relations
                platforms: {
                    include: {
                        socialAccount: true,
                    },
                },
                media: {
                    include: {
                        media: true,
                    },
                },
            },
        });

        if (!post) {
            throw new Error(`Post not found: ${postId}`);
        }

        // Determine if this is new-architecture (platform directly on Post)
        const isNewArchitecture = Boolean(post.platform && post.socialAccountId);

        // Guard: Log if both architectures are present (shouldn't happen)
        if (isNewArchitecture && post.platforms.length > 0) {
            log.warn({
                postId,
                newArchPlatform: post.platform,
                legacyPlatformCount: post.platforms.length
            }, 'Post has both new and legacy architecture data - using new architecture');
        }

        // Pre-validation for video-only platforms
        const videoOnlyPlatforms = ['tiktok', 'youtube'];
        const postPlatform = post.platform?.toLowerCase();

        if (postPlatform && videoOnlyPlatforms.includes(postPlatform)) {
            const hasVideo = post.media.some(m =>
                m.media.mimeType?.startsWith('video/')
            );

            if (!hasVideo) {
                log.warn({ postId, platform: postPlatform }, 'Video-only platform missing video content');

                await db.post.update({
                    where: { id: postId },
                    data: { status: 'FAILED' },
                });

                await db.publishError.create({
                    data: {
                        postId,
                        platform: post.platform!,
                        errorCode: 'MISSING_VIDEO',
                        errorRaw: `${postPlatform} requires video content`,
                        errorHuman: `${postPlatform === 'youtube' ? 'YouTube' : 'TikTok'} only supports video content. Please add a video to your post.`,
                        suggestion: 'Edit your post and attach a video file.',
                    },
                });

                await releasePublishLock(postId, lockToken);
                return;
            }
        }

        const results: Array<{ platform: string; success: boolean; error?: string; friendlyError?: string }> = [];

        if (isNewArchitecture) {
            // NEW ARCHITECTURE: Single platform directly on Post
            const socialAccount = post.socialAccount;
            if (!socialAccount) {
                throw new Error(`Social account not found for post: ${postId}`);
            }

            // Guard: Check if account is still connected
            if (!socialAccount.isActive) {
                log.warn({ postId, accountId: socialAccount.id }, 'Social account disconnected, cannot publish');

                await db.post.update({
                    where: { id: postId },
                    data: { status: 'FAILED' },
                });

                await db.publishError.create({
                    data: {
                        postId,
                        platform: post.platform!,
                        errorCode: 'ACCOUNT_DISCONNECTED',
                        errorRaw: 'Social account was disconnected before publishing',
                        errorHuman: 'This social account has been disconnected. Please reconnect it to publish.',
                        suggestion: 'Go to Settings > Connected Accounts to reconnect this account.',
                    },
                });

                await sendPostFailedNotification(
                    organizationId,
                    postId,
                    post.caption,
                    [post.platform!],
                    'Account disconnected - please reconnect in Settings'
                ).catch(() => { /* Non-blocking */ });

                return;
            }

            const mem = process.memoryUsage();
            log.info({
                platform: post.platform,
                accountId: socialAccount.id,
                isNewArchitecture: true,
                postType: post.postType,
                mediaCount: post.media.length,
                mediaTypes: post.media.map(m => m.media.mimeType),
                mediaUrls: post.media.map(m => m.media.url?.substring(0, 80)),
                memoryMB: Math.round(mem.rss / 1024 / 1024),
                heapMB: Math.round(mem.heapUsed / 1024 / 1024),
            }, 'Publishing to platform (new architecture)');

            try {
                log.info({ postType: post.postType }, 'Loading platform publisher module...');
                const { publishToPlatform } = await import('@/lib/platforms');
                const { ensureValidToken } = await import('@/lib/services/token-service');
                log.info({ postType: post.postType }, 'Platform publisher module loaded, calling publish...');

                // Get a fresh, decrypted access token before publishing.
                // Why: socialAccount.accessToken from DB may be encrypted (enc: prefix)
                // or expired (Google tokens last only 1 hour). ensureValidToken handles
                // both decryption and proactive refresh.
                const tokenResult = await ensureValidToken(socialAccount.id);
                if (!tokenResult.success || !tokenResult.accessToken) {
                    throw new Error(tokenResult.error || 'Failed to get valid access token');
                }

                // Why: Promise.race is inside the inner try-catch so timeout
                // errors are caught HERE (setting FAILED) instead of the outer
                // catch which would re-throw and trigger BullMQ auto-retry.
                const result = await Promise.race([
                    publishToPlatform(
                        {
                            id: socialAccount.id,
                            platform: socialAccount.platform.toLowerCase() as Parameters<typeof publishToPlatform>[0]['platform'],
                            accountId: socialAccount.platformId || socialAccount.id,
                            accountName: socialAccount.username || socialAccount.platformId || 'unknown',
                            accessToken: tokenResult.accessToken,
                            refreshToken: socialAccount.refreshToken || undefined,
                            tokenExpiresAt: socialAccount.tokenExpiry || new Date(Date.now() + 86400000),
                            isConnected: true,
                        },
                        {
                            caption: post.caption,
                            mediaUrls: rewriteWebpUrls(post.media.map(m => m.media.url), socialAccount.platform),
                            mediaType: post.media[0]?.media.mimeType?.startsWith('video/') ? 'video' :
                                post.media.length > 1 ? 'carousel' : 'image',
                            postType: (post.postType?.toLowerCase() || 'feed') as 'feed' | 'story' | 'reel' | 'carousel' | 'pin' | 'video' | 'article' | 'thread',
                            firstComment: post.firstComment || undefined,
                            thumbnailUrl: post.media[0]?.customThumbnailUrl || undefined,
                            // Pinterest-specific fields
                            pinTitle: post.pinTitle || undefined,
                            link: post.pinLink || undefined,
                            boardId: post.boardId || undefined,
                            // Location tagging (Instagram, TikTok, Facebook)
                            location: post.location || undefined,
                            // YouTube-specific fields
                            videoTitle: post.videoTitle || undefined,
                            youtubeCategory: post.youtubeCategory || undefined,
                            youtubePlaylist: post.youtubePlaylist || undefined,
                            videoTags: post.videoTags?.length ? post.videoTags : undefined,
                            embeddable: post.embeddable,
                            notifySubscribers: post.notifySubscribers,
                            madeForKids: post.madeForKids,
                            youtubePrivacy: post.youtubePrivacy as 'public' | 'private' | 'unlisted' | undefined,
                            // TikTok-specific fields
                            tiktokBrandOrganic: post.tiktokBrandOrganic,
                            tiktokBrandContent: post.tiktokBrandContent,
                            tiktokIsAigc: post.tiktokIsAigc,
                            tiktokComments: post.tiktokComments,
                            tiktokDuets: post.tiktokDuets,
                            tiktokStitches: post.tiktokStitches,
                            // Instagram-specific fields
                            instagramShareToFeed: post.instagramShareToFeed,
                            instagramComments: post.instagramComments,
                        }
                    ),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(
                            `Publishing to ${post.platform} timed out after ${PUBLISH_TIMEOUT_MS / 1000}s. ` +
                            'The platform API may be unresponsive.'
                        )), PUBLISH_TIMEOUT_MS)
                    ),
                ]);

                if (!result.success) {
                    throw new Error(result.error || 'Publishing failed');
                }

                // Update Post directly (not PostPlatform)
                await db.post.update({
                    where: { id: postId },
                    data: {
                        status: 'PUBLISHED',
                        publishedAt: new Date(),
                        platformPostId: result.postId || `${post.platform!.toLowerCase()}_${Date.now()}`,
                    },
                });

                results.push({ platform: post.platform!, success: true });
                log.info({ platform: post.platform, postType: post.postType }, 'Successfully published (new architecture)');
            } catch (platformError) {
                const errorMessage = platformError instanceof Error ? platformError.message : 'Unknown error';
                const friendlyError = getUserFriendlyError(platformError);
                log.error({ platform: post.platform, postType: post.postType, err: platformError }, 'Failed to publish (new architecture)');

                // On auth errors, attempt token refresh before deactivating
                // Why: handle401Error refreshes the token if possible; only deactivates
                // if the refresh token is also revoked. This avoids a race condition
                // where the worker deactivates an account that just needed a routine refresh.
                if (friendlyError.category === 'auth') {
                    const { handle401Error } = await import('@/lib/services/token-service');
                    const refreshResult = await handle401Error(socialAccount.id, errorMessage);
                    if (refreshResult.needsReconnect) {
                        log.warn({ accountId: socialAccount.id, platform: post.platform }, 'Account deactivated — token refresh failed, needs reconnection');
                    } else if (refreshResult.success) {
                        log.info({ accountId: socialAccount.id, platform: post.platform }, 'Token refreshed after auth failure — account stays active for next retry');
                    }
                }

                await db.publishError.create({
                    data: {
                        postId,
                        platform: post.platform!,
                        errorCode: 'PUBLISH_FAILED',
                        errorRaw: serializeError(platformError),
                        errorHuman: friendlyError.message,
                        suggestion: friendlyError.suggestion,
                    },
                });

                await db.post.update({
                    where: { id: postId },
                    data: { status: 'FAILED' },
                });

                results.push({ platform: post.platform!, success: false, error: errorMessage, friendlyError: friendlyError.message });
            }
        } else {
            // LEGACY: Process each PostPlatform entry
            for (const postPlatform of post.platforms) {
                if (!platformIds.includes(postPlatform.socialAccountId)) {
                    continue;
                }

                const { socialAccount } = postPlatform;

                // Guard: Check if account is still connected
                if (!socialAccount.isActive) {
                    log.warn({ accountId: socialAccount.id, platform: socialAccount.platform }, 'Skipping disconnected account');

                    await db.postPlatform.update({
                        where: { id: postPlatform.id },
                        data: { status: 'FAILED' },
                    });

                    await db.publishError.create({
                        data: {
                            postId,
                            platform: socialAccount.platform,
                            errorCode: 'ACCOUNT_DISCONNECTED',
                            errorRaw: 'Social account was disconnected before publishing',
                            errorHuman: 'This social account has been disconnected. Please reconnect it to publish.',
                            suggestion: 'Go to Settings > Connected Accounts to reconnect this account.',
                        },
                    });

                    results.push({
                        platform: socialAccount.platform,
                        success: false,
                        error: 'Account disconnected',
                        friendlyError: 'Account disconnected - please reconnect in Settings',
                    });
                    continue;
                }

                log.info({ platform: socialAccount.platform, accountId: socialAccount.id }, 'Publishing to platform');

                try {
                    const { publishToPlatform } = await import('@/lib/platforms');
                    const { ensureValidToken } = await import('@/lib/services/token-service');

                    // Get fresh, decrypted token (same as new architecture path)
                    const tokenResult = await ensureValidToken(socialAccount.id);
                    if (!tokenResult.success || !tokenResult.accessToken) {
                        throw new Error(tokenResult.error || 'Failed to get valid access token');
                    }

                    const result = await Promise.race([
                        publishToPlatform(
                            {
                                id: socialAccount.id,
                                platform: socialAccount.platform.toLowerCase() as Parameters<typeof publishToPlatform>[0]['platform'],
                                accountId: socialAccount.platformId || socialAccount.id,
                                accountName: socialAccount.username || socialAccount.platformId || 'unknown',
                                accessToken: tokenResult.accessToken,
                                refreshToken: socialAccount.refreshToken || undefined,
                                tokenExpiresAt: socialAccount.tokenExpiry || new Date(Date.now() + 86400000),
                                isConnected: true,
                            },
                            {
                                caption: postPlatform.caption || post.caption,
                                mediaUrls: rewriteWebpUrls(post.media.map(m => m.media.url), socialAccount.platform),
                                mediaType: post.media[0]?.media.mimeType?.startsWith('video/') ? 'video' :
                                    post.media.length > 1 ? 'carousel' : 'image',
                                postType: (postPlatform.postType?.toLowerCase() || 'feed') as 'feed' | 'story' | 'reel' | 'carousel' | 'pin' | 'video' | 'article' | 'thread',
                                firstComment: postPlatform.firstComment || post.firstComment || undefined,
                                thumbnailUrl: post.media[0]?.customThumbnailUrl || undefined,
                                // Pinterest-specific fields (from main post for legacy)
                                pinTitle: post.pinTitle || undefined,
                                link: post.pinLink || undefined,
                                boardId: post.boardId || undefined,
                                // Location tagging
                                location: post.location || undefined,
                                // YouTube-specific fields (from main post for legacy)
                                videoTitle: post.videoTitle || undefined,
                                youtubeCategory: post.youtubeCategory || undefined,
                                youtubePlaylist: post.youtubePlaylist || undefined,
                                videoTags: post.videoTags?.length ? post.videoTags : undefined,
                                embeddable: post.embeddable,
                                notifySubscribers: post.notifySubscribers,
                                madeForKids: post.madeForKids,
                                youtubePrivacy: post.youtubePrivacy as 'public' | 'private' | 'unlisted' | undefined,
                                // TikTok-specific fields (from main post)
                                tiktokBrandOrganic: post.tiktokBrandOrganic,
                                tiktokBrandContent: post.tiktokBrandContent,
                                tiktokIsAigc: post.tiktokIsAigc,
                                tiktokComments: post.tiktokComments,
                                tiktokDuets: post.tiktokDuets,
                                tiktokStitches: post.tiktokStitches,
                                // Instagram-specific fields
                                instagramShareToFeed: post.instagramShareToFeed,
                                instagramComments: post.instagramComments,
                            }
                        ),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error(
                                `Publishing to ${socialAccount.platform} timed out after ${PUBLISH_TIMEOUT_MS / 1000}s. ` +
                                'The platform API may be unresponsive.'
                            )), PUBLISH_TIMEOUT_MS)
                        ),
                    ]);

                    if (!result.success) {
                        throw new Error(result.error || 'Publishing failed');
                    }

                    await db.postPlatform.update({
                        where: { id: postPlatform.id },
                        data: {
                            status: 'PUBLISHED',
                            publishedAt: new Date(),
                            platformPostId: result.postId || `${socialAccount.platform.toLowerCase()}_${Date.now()}`,
                        },
                    });

                    results.push({ platform: socialAccount.platform, success: true });
                    log.info({ platform: socialAccount.platform }, 'Successfully published');
                } catch (platformError) {
                    const errorMessage = platformError instanceof Error ? platformError.message : 'Unknown error';
                    const friendlyError = getUserFriendlyError(platformError);
                    log.error({ platform: socialAccount.platform, postType: postPlatform.postType, err: platformError }, 'Failed to publish to platform');

                    await db.publishError.create({
                        data: {
                            postId,
                            platform: socialAccount.platform,
                            errorCode: 'PUBLISH_FAILED',
                            errorRaw: serializeError(platformError),
                            errorHuman: friendlyError.message,
                            suggestion: friendlyError.suggestion,
                        },
                    });

                    await db.postPlatform.update({
                        where: { id: postPlatform.id },
                        data: { status: 'FAILED' },
                    });

                    results.push({ platform: socialAccount.platform, success: false, error: errorMessage, friendlyError: friendlyError.message });
                }
            }

            // Determine overall post status (legacy only - new arch already updated above)
            const allSucceeded = results.every((r) => r.success);
            const anySucceeded = results.some((r) => r.success);

            await db.post.update({
                where: { id: postId },
                data: {
                    status: allSucceeded ? 'PUBLISHED' : anySucceeded ? 'PUBLISHED' : 'FAILED',
                    publishedAt: anySucceeded ? new Date() : null,
                },
            });
        }

        // Log activity
        await db.activity.create({
            data: {
                organizationId,
                action: results.every(r => r.success) ? 'published' : 'publish_partial',
                resourceType: 'post',
                resourceId: postId,
                resourceName: post.caption.substring(0, 50) + (post.caption.length > 50 ? '...' : ''),
                details: `Published to ${results.filter((r) => r.success).length}/${results.length} platforms`,
            },
        });

        // Send push notifications based on publish result
        const failedResults = results.filter((r) => !r.success);
        const failedPlatforms = failedResults.map((r) => r.platform);
        const successPlatforms = results.filter((r) => r.success).map((r) => r.platform);

        // Get the first friendly error message for the notification
        const firstFriendlyError = failedResults.find(r => r.friendlyError)?.friendlyError;

        if (failedPlatforms.length > 0) {
            await sendPostFailedNotification(
                organizationId,
                postId,
                post.caption,
                failedPlatforms,
                firstFriendlyError // Pass the user-friendly reason
            );
        } else if (successPlatforms.length > 0) {
            await sendPostPublishedNotification(
                organizationId,
                postId,
                post.caption,
                successPlatforms
            );
        }

        log.info({ results, isNewArchitecture }, 'Post publish job completed');
    } catch (error) {
        log.error({ err: error }, 'Post publish job failed');

        // Mark post as failed
        await db.post.update({
            where: { id: postId },
            data: { status: 'FAILED' },
        });

        // Get user-friendly message for unexpected errors
        const friendlyError = getUserFriendlyError(error);

        await sendPostFailedNotification(
            organizationId,
            postId,
            'Post failed to publish',
            ['All platforms'],
            friendlyError.message // Pass the user-friendly reason
        ).catch(() => { /* Non-blocking */ });

        throw error; // Re-throw to trigger BullMQ retry
    } finally {
        // Always release the lock
        await releasePublishLock(postId, lockToken);
    }
}

/**
 * Create and start the post publisher worker.
 */
export function createPostPublisherWorker(): Worker<PostPublishJobData> {
    const worker = new Worker<PostPublishJobData>('post-publish', processPostPublish, {
        connection: getBullMQConnection(),
        concurrency: 5, // Process up to 5 jobs concurrently
        limiter: {
            max: 10, // Max 10 jobs per duration
            duration: 1000, // Per second (rate limiting for platform APIs)
        },
    });

    worker.on('completed', (job) => {
        const log = createJobLogger(job.id || 'unknown', 'post-publish');
        log.info('Job completed successfully');
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'post-publish');
        log.error({ err }, 'Job failed');
    });

    return worker;
}
