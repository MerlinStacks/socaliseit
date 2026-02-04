/**
 * Post Publisher Worker
 * Processes scheduled posts and publishes them to social platforms
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { PostPublishJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { db } from '@/lib/db';

/**
 * Process a post publishing job.
 * Handles OAuth token refresh, platform API calls, and status updates.
 */
async function processPostPublish(job: Job<PostPublishJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'post-publish');
    const { postId, workspaceId, platformIds } = job.data;

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

        const results: Array<{ platform: string; success: boolean; error?: string }> = [];

        // Process each platform
        for (const postPlatform of post.platforms) {
            if (!platformIds.includes(postPlatform.socialAccountId)) {
                continue;
            }

            const { socialAccount } = postPlatform;
            log.info({ platform: socialAccount.platform, accountId: socialAccount.id }, 'Publishing to platform');

            try {
                // Import and use actual platform publishing
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
                        // Pass postType from PostPlatform to route to correct endpoint (story/reel/feed)
                        postType: (postPlatform.postType?.toLowerCase() || 'feed') as 'feed' | 'story' | 'reel' | 'carousel' | 'pin' | 'video' | 'article' | 'thread',
                        firstComment: postPlatform.firstComment || post.firstComment || undefined,
                    }
                );

                if (!result.success) {
                    throw new Error(result.error || 'Publishing failed');
                }

                // Update platform-specific status
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
                log.error({ platform: socialAccount.platform, err: platformError }, 'Failed to publish to platform');

                // Record the error
                await db.publishError.create({
                    data: {
                        postId,
                        platform: socialAccount.platform,
                        errorCode: 'PUBLISH_FAILED',
                        errorRaw: JSON.stringify(platformError),
                        errorHuman: errorMessage,
                        suggestion: 'Please check your account connection and try again.',
                    },
                });

                await db.postPlatform.update({
                    where: { id: postPlatform.id },
                    data: { status: 'FAILED' },
                });

                results.push({ platform: socialAccount.platform, success: false, error: errorMessage });
            }
        }

        // Determine overall post status
        const allSucceeded = results.every((r) => r.success);
        const anySucceeded = results.some((r) => r.success);

        await db.post.update({
            where: { id: postId },
            data: {
                status: allSucceeded ? 'PUBLISHED' : anySucceeded ? 'PUBLISHED' : 'FAILED',
                publishedAt: anySucceeded ? new Date() : null,
            },
        });

        // Log activity
        await db.activity.create({
            data: {
                workspaceId,
                action: allSucceeded ? 'published' : 'publish_partial',
                resourceType: 'post',
                resourceId: postId,
                resourceName: post.caption.substring(0, 50) + (post.caption.length > 50 ? '...' : ''),
                details: `Published to ${results.filter((r) => r.success).length}/${results.length} platforms`,
            },
        });

        log.info({ results }, 'Post publish job completed');
    } catch (error) {
        log.error({ err: error }, 'Post publish job failed');

        // Mark post as failed
        await db.post.update({
            where: { id: postId },
            data: { status: 'FAILED' },
        });

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
