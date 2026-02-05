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

    try {
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

        const results: Array<{ platform: string; success: boolean; error?: string; friendlyError?: string }> = [];

        if (isNewArchitecture) {
            // NEW ARCHITECTURE: Single platform directly on Post
            const socialAccount = post.socialAccount;
            if (!socialAccount) {
                throw new Error(`Social account not found for post: ${postId}`);
            }

            log.info({ platform: post.platform, accountId: socialAccount.id, isNewArchitecture: true }, 'Publishing to platform (new architecture)');

            try {
                const { publishToPlatform } = await import('@/lib/platforms');

                const result = await publishToPlatform(
                    {
                        id: socialAccount.id,
                        platform: socialAccount.platform.toLowerCase() as Parameters<typeof publishToPlatform>[0]['platform'],
                        accountId: socialAccount.platformId || socialAccount.id,
                        accountName: socialAccount.username || socialAccount.platformId || 'unknown',
                        accessToken: socialAccount.accessToken,
                        refreshToken: socialAccount.refreshToken || undefined,
                        tokenExpiresAt: socialAccount.tokenExpiry || new Date(Date.now() + 86400000),
                        isConnected: true,
                    },
                    {
                        caption: post.caption,
                        mediaUrls: post.media.map(m => m.media.url),
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
                    }
                );

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
                log.info({ platform: post.platform }, 'Successfully published (new architecture)');
            } catch (platformError) {
                const errorMessage = platformError instanceof Error ? platformError.message : 'Unknown error';
                const friendlyError = getUserFriendlyError(platformError);
                log.error({ platform: post.platform, err: platformError }, 'Failed to publish (new architecture)');

                await db.publishError.create({
                    data: {
                        postId,
                        platform: post.platform!,
                        errorCode: 'PUBLISH_FAILED',
                        errorRaw: JSON.stringify(platformError),
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
                log.info({ platform: socialAccount.platform, accountId: socialAccount.id }, 'Publishing to platform');

                try {
                    const { publishToPlatform } = await import('@/lib/platforms');

                    const result = await publishToPlatform(
                        {
                            id: socialAccount.id,
                            platform: socialAccount.platform.toLowerCase() as Parameters<typeof publishToPlatform>[0]['platform'],
                            accountId: socialAccount.platformId || socialAccount.id,
                            accountName: socialAccount.username || socialAccount.platformId || 'unknown',
                            accessToken: socialAccount.accessToken,
                            refreshToken: socialAccount.refreshToken || undefined,
                            tokenExpiresAt: socialAccount.tokenExpiry || new Date(Date.now() + 86400000),
                            isConnected: true,
                        },
                        {
                            caption: postPlatform.caption || post.caption,
                            mediaUrls: post.media.map(m => m.media.url),
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
                        }
                    );

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
                    log.error({ platform: socialAccount.platform, err: platformError }, 'Failed to publish to platform');

                    await db.publishError.create({
                        data: {
                            postId,
                            platform: socialAccount.platform,
                            errorCode: 'PUBLISH_FAILED',
                            errorRaw: JSON.stringify(platformError),
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
