/**
 * Bluesky Publisher
 * Why: Bluesky-specific publishing logic (Posts, Threads).
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

/**
 * Publish to Bluesky
 */
export async function publishToBluesky(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const { createBlueskyPost, createBlueskyThread } = await import('@/lib/platform-api/bluesky-api');

    logger.debug({ platform: 'bluesky', postType: payload.postType, caption: payload.caption.slice(0, 50) }, 'Publishing to Bluesky');

    // Build session from account
    const session = {
        accessJwt: account.accessToken,
        refreshJwt: account.refreshToken,
        did: account.accountId,
        handle: account.accountName || '',
    };

    // Why: If a previous attempt timed out waiting for video processing,
    // the job ID was stored. Poll it instead of re-uploading.
    if (payload.blueskyPendingJobId) {
        logger.info({ pendingJobId: payload.blueskyPendingJobId }, 'Bluesky retry: checking pending video job');

        // Poll the existing job — need a fresh service auth token
        let blob: unknown = null;
        let jobFailed = false;
        let authFailed = false;

        const authToken = await (async () => {
            try {
                const params = new URLSearchParams({
                    aud: 'did:web:video.bsky.app',
                    lxm: 'com.atproto.repo.uploadBlob',
                    exp: String(Math.floor(Date.now() / 1000) + 60 * 30),
                });
                const response = await fetch(
                    `https://bsky.social/xrpc/com.atproto.server.getServiceAuth?${params}`,
                    { headers: { 'Authorization': `Bearer ${session.accessJwt}` } }
                );
                const data = await response.json();
                return response.ok ? data.token : null;
            } catch {
                return null;
            }
        })();

        if (authToken) {
            for (let i = 0; i < 10; i++) {
                const statusResponse = await fetch(
                    `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${payload.blueskyPendingJobId}`,
                    { headers: { 'Authorization': `Bearer ${authToken}` } }
                );
                const statusData = await statusResponse.json();
                const state = statusData.jobStatus?.state;

                if (state === 'JOB_STATE_COMPLETED') {
                    blob = statusData.jobStatus?.blob;
                    break;
                }
                if (state === 'JOB_STATE_FAILED') { jobFailed = true; break; }
                await new Promise(r => setTimeout(r, 3000));
            }
        } else {
            // Why: Auth failed — can't determine job status. Fall through to
            // re-upload rather than returning "still processing" forever.
            authFailed = true;
            logger.warn({ pendingJobId: payload.blueskyPendingJobId }, 'Bluesky retry: service auth failed, will re-upload');
        }

        if (blob) {
            // Job completed — create the post with the blob
            logger.info({ pendingJobId: payload.blueskyPendingJobId }, 'Bluesky retry: video ready, creating post');

            // Why: createBlueskyPost doesn't support videoBlob — use direct API call
            const record: Record<string, unknown> = {
                $type: 'app.bsky.feed.post',
                text: payload.caption,
                createdAt: new Date().toISOString(),
                embed: { $type: 'app.bsky.embed.video', video: blob },
            };

            const response = await fetch(`https://bsky.social/xrpc/com.atproto.repo.createRecord`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.accessJwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
            });
            const data = await response.json();
            if (response.ok) {
                const postId = data.uri?.split('/').pop();
                return { success: true, postId, postUrl: `https://bsky.app/profile/${account.accountName}/post/${postId}` };
            }
            // Post creation failed — fall through to re-upload
            logger.warn({ error: data }, 'Bluesky retry: post creation with pending blob failed, will re-upload');
        } else if (!jobFailed && !authFailed) {
            // Still processing
            return {
                success: false,
                error: 'Bluesky video still processing. Please retry again in a few minutes.',
                postId: `bsky_pending:${payload.blueskyPendingJobId}`,
            };
        }
        // If job failed or auth failed, fall through to re-upload
        payload.blueskyPendingJobId = undefined;
    }

    // Route thread posts
    if (payload.postType === 'thread') {
        const threadParts = payload.caption.split(/\n\n+/).filter(p => p.trim());

        if (threadParts.length < 2) {
            // Fall back to single post
            const result = await createBlueskyPost(session, {
                text: payload.caption,
                images: payload.mediaUrls.length > 0
                    ? payload.mediaUrls.map(url => ({ url }))
                    : undefined,
            });

            if (!result.success || !result.data) {
                logger.error({ platform: 'bluesky', error: result.error }, 'Bluesky publish failed');
                return { success: false, error: result.error };
            }

            const postId = result.data.uri.split('/').pop();
            return {
                success: true,
                postId: postId,
                postUrl: `https://bsky.app/profile/${account.accountName}/post/${postId}`,
            };
        }

        // Create thread with multiple posts
        const threadPayload = threadParts.map((text, index) => ({
            text,
            images: index === 0 && payload.mediaUrls.length > 0
                ? payload.mediaUrls.map(url => ({ url }))
                : undefined,
        }));

        const result = await createBlueskyThread(session, threadPayload);

        if (!result.success || !result.data) {
            logger.error({ platform: 'bluesky', postType: 'thread', error: result.error }, 'Bluesky thread publish failed');
            return { success: false, error: result.error };
        }

        const firstPostId = result.data.posts[0]?.uri.split('/').pop();
        return {
            success: true,
            postId: firstPostId,
            postUrl: `https://bsky.app/profile/${account.accountName}/post/${firstPostId}`,
        };
    }

    // Why: Route video posts to the dedicated video upload pipeline.
    // Videos use a separate AT Protocol service (video.bsky.app) with its own
    // auth flow, upload endpoint, and processing queue.
    if (payload.mediaType === 'video' && payload.mediaUrls.length > 0) {
        const { createBlueskyVideoPost } = await import('@/lib/platform-api/bluesky-api');

        const result = await createBlueskyVideoPost(session, payload.caption, payload.mediaUrls[0]);

        if (!result.success || !result.data) {
            logger.error({ platform: 'bluesky', error: result.error }, 'Bluesky video publish failed');
            // Why: Propagate pending job ID so retry can poll instead of re-uploading
            const pendingUri = result.data?.uri;
            return {
                success: false,
                error: result.error,
                postId: pendingUri?.startsWith('bsky_pending:') ? pendingUri : undefined,
            };
        }

        const postId = result.data.uri.split('/').pop();
        return {
            success: true,
            postId: postId,
            postUrl: `https://bsky.app/profile/${account.accountName}/post/${postId}`,
        };
    }

    // Default: Single post (text or images)
    const result = await createBlueskyPost(session, {
        text: payload.caption,
        images: payload.mediaUrls.length > 0 && payload.mediaType !== 'video'
            ? payload.mediaUrls.map(url => ({ url }))
            : undefined,
    });

    if (!result.success || !result.data) {
        logger.error({ platform: 'bluesky', error: result.error }, 'Bluesky publish failed');
        return { success: false, error: result.error };
    }

    const postId = result.data.uri.split('/').pop();
    return {
        success: true,
        postId: postId,
        postUrl: `https://bsky.app/profile/${account.accountName}/post/${postId}`,
    };
}
