/**
 * Bluesky AT Protocol Integration
 * Handles publishing to Bluesky via the AT Protocol
 * 
 * Why: Bluesky uses the AT Protocol (atproto) which requires:
 * 1. Session authentication (accessJwt, refreshJwt)
 * 2. Blob uploads for images
 * 3. Record creation for posts
 */

import { ApiResponse } from './types';
import { logger } from '@/lib/logger';
import { resolveLocalFilePath } from './local-file';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

const BSKY_API = 'https://bsky.social/xrpc';

/**
 * Bluesky session credentials
 */
export interface BlueskySession {
    accessJwt: string;
    refreshJwt?: string;
    did: string; // Decentralized Identifier
    handle: string;
}

/**
 * Bluesky post payload
 */
export interface BlueskyPostPayload {
    text: string;
    images?: Array<{
        url: string;
        alt?: string;
    }>;
    /** Video attachment — mutually exclusive with images */
    videoUrl?: string;
    /** Reply to another post (parent = immediate parent, root = thread root) */
    replyTo?: {
        uri: string;
        cid: string;
    };
    /** Thread root - only used for multi-post threads where root != parent */
    replyRoot?: {
        uri: string;
        cid: string;
    };
    /** Link card embed */
    embedUrl?: string;
}

// ============================================================================
// Video Upload (Phase 5 — 2026)
// ============================================================================

/**
 * Get a scoped service auth token for the video upload endpoint.
 *
 * Why: AT Protocol video uploads use a separate PDS video service that
 * requires a short-lived, scoped auth token (`com.atproto.server.getServiceAuth`)
 * with audience `did:web:video.bsky.app` and scope `com.atproto.repo.uploadBlob`.
 */
async function getVideoServiceAuth(
    session: BlueskySession
): Promise<ApiResponse<string>> {
    try {
        const params = new URLSearchParams({
            aud: 'did:web:video.bsky.app',
            lxm: 'com.atproto.repo.uploadBlob',
            exp: String(Math.floor(Date.now() / 1000) + 60 * 30), // 30 min
        });

        const response = await fetch(
            `${BSKY_API}/com.atproto.server.getServiceAuth?${params}`,
            {
                headers: { 'Authorization': `Bearer ${session.accessJwt}` },
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.message || 'Service auth failed' };
        }

        return { success: true, data: data.token };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Upload a video to Bluesky's video processing service.
 *
 * Why: Bluesky videos go through a separate upload → processing → ready pipeline.
 * The video is uploaded as a binary blob to `video.bsky.app`, which returns a
 * job ID. We must poll `getJobStatus` until the job state is `JOB_STATE_COMPLETED`.
 *
 * @returns The video blob reference for use in `app.bsky.embed.video`
 */
export async function uploadBlueskyVideo(
    session: BlueskySession,
    videoUrl: string
): Promise<ApiResponse<{ blob: unknown }>> {
    try {
        // Step 1: Get video service auth token
        const authResult = await getVideoServiceAuth(session);
        if (!authResult.success || !authResult.data) {
            return { success: false, error: authResult.error || 'Failed to get video service auth' };
        }

        // Step 2: Fetch video binary
        // Why: Use top-level static imports instead of per-call dynamic imports.
        // resolveLocalFilePath was already imported at the top of this file.
        const localPath = resolveLocalFilePath(videoUrl);
        const isLocal = existsSync(localPath);

        let videoBuffer: ArrayBuffer;

        if (isLocal) {
            const fileBuffer = await readFile(localPath);
            videoBuffer = fileBuffer.buffer.slice(
                fileBuffer.byteOffset,
                fileBuffer.byteOffset + fileBuffer.byteLength
            );
            logger.debug({ path: localPath, size: fileBuffer.length }, '[Bluesky] Read local video');
        } else {
            const videoResponse = await fetch(videoUrl);
            if (!videoResponse.ok) {
                return { success: false, error: `Failed to fetch video: ${videoUrl}` };
            }
            videoBuffer = await videoResponse.arrayBuffer();
        }

        // Step 3: Upload to video processing service
        const uploadUrl = `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(session.did)}&name=video.mp4`;

        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authResult.data}`,
                'Content-Type': 'video/mp4',
                'Content-Length': String(videoBuffer.byteLength),
            },
            body: videoBuffer,
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok) {
            logger.error({ error: uploadData }, '[Bluesky] Video upload failed');
            return { success: false, error: uploadData.message || 'Video upload failed' };
        }

        const jobId = uploadData.jobId;
        if (!jobId) {
            return { success: false, error: 'No jobId returned from video upload' };
        }

        // Step 4: Poll job status until complete
        logger.info({ jobId }, '[Bluesky] Video upload started, polling for completion');

        for (let attempt = 0; attempt < 60; attempt++) {
            // Why: Adaptive polling — fast (2s) for the first 15 attempts,
            // then slow (5s) to reduce API pressure. Same pattern as Instagram/TikTok/Threads.
            const pollDelay = attempt < 15 ? 2000 : 5000;
            await new Promise(r => setTimeout(r, pollDelay));

            const statusResponse = await fetch(
                `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${jobId}`,
                {
                    headers: { 'Authorization': `Bearer ${authResult.data}` },
                }
            );

            const statusData = await statusResponse.json();
            const state = statusData.jobStatus?.state;

            if (state === 'JOB_STATE_COMPLETED') {
                const blob = statusData.jobStatus?.blob;
                if (!blob) {
                    return { success: false, error: 'Video processing completed but no blob returned' };
                }

                logger.info({ jobId }, '[Bluesky] Video processing complete');
                return { success: true, data: { blob } };
            }

            if (state === 'JOB_STATE_FAILED') {
                const errorMsg = statusData.jobStatus?.error || 'Video processing failed';
                logger.error({ jobId, error: errorMsg }, '[Bluesky] Video processing failed');
                return { success: false, error: errorMsg };
            }
        }

        return { success: false, error: `Video processing timed out after 2 minutes [jobId:${jobId}]` };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, '[Bluesky] Video upload exception');
        return { success: false, error: message };
    }
}

/**
 * Create a Bluesky post with a video embed.
 *
 * Why: Orchestrates the full video post flow: upload → process → create post.
 * Uses `app.bsky.embed.video` embed type (different from `app.bsky.embed.images`).
 */
export async function createBlueskyVideoPost(
    session: BlueskySession,
    text: string,
    videoUrl: string
): Promise<ApiResponse<{ uri: string; cid: string }>> {
    // Step 1: Upload and process video
    const uploadResult = await uploadBlueskyVideo(session, videoUrl);
    if (!uploadResult.success || !uploadResult.data) {
        // Why: Extract jobId from timeout error so retry can poll instead of re-uploading
        const jobIdMatch = uploadResult.error?.match(/\[jobId:([^\]]+)\]/);
        const pendingJobId = jobIdMatch?.[1];
        return {
            success: false,
            error: uploadResult.error || 'Video upload failed',
            data: pendingJobId ? { uri: `bsky_pending:${pendingJobId}`, cid: '' } : undefined,
        };
    }

    // Step 2: Create post with video embed
    const facets = parseFacets(text);
    const record: Record<string, unknown> = {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
        embed: {
            $type: 'app.bsky.embed.video',
            video: uploadResult.data.blob,
        },
    };

    if (facets.length > 0) {
        record.facets = facets;
    }

    const response = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.accessJwt}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            repo: session.did,
            collection: 'app.bsky.feed.post',
            record,
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        logger.error({ error: data }, '[Bluesky] Video post creation failed');
        return { success: false, error: data.message || 'Video post creation failed' };
    }

    return { success: true, data: { uri: data.uri, cid: data.cid } };
}

/**
 * Upload an image blob to Bluesky
 */
async function uploadBlob(
    session: BlueskySession,
    imageUrl: string
): Promise<ApiResponse<{ blob: { $type: string; ref: { $link: string }; mimeType: string; size: number } }>> {
    try {
        let imageBuffer: ArrayBuffer;
        let contentType: string;

        // Why: Use shared resolveLocalFilePath helper instead of duplicating
        // the /uploads/ path resolution logic.
        const localPath = resolveLocalFilePath(imageUrl);
        const { existsSync } = await import('fs');
        const isLocal = existsSync(localPath);

        if (isLocal) {
            const { readFile } = await import('fs/promises');
            const path = await import('path');

            const fileBuffer = await readFile(localPath);
            imageBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

            const ext = path.extname(localPath).toLowerCase();
            contentType = ext === '.png' ? 'image/png' :
                ext === '.gif' ? 'image/gif' :
                    ext === '.webp' ? 'image/webp' : 'image/jpeg';
        } else {
            // Remote URL: fetch over network
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
                return { success: false, error: `Failed to fetch image: ${imageUrl}` };
            }
            imageBuffer = await imageResponse.arrayBuffer();
            contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        }

        // Upload to Bluesky
        const response = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.accessJwt}`,
                'Content-Type': contentType,
            },
            body: imageBuffer,
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Blob upload failed',
            };
        }

        return { success: true, data: { blob: data.blob } };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Parse facets (mentions, links, hashtags) from text
 * Why: Bluesky requires explicit byte positions for rich text features
 */
function parseFacets(text: string): Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; uri?: string; did?: string; tag?: string }>;
}> {
    const facets: Array<{
        index: { byteStart: number; byteEnd: number };
        features: Array<{ $type: string; uri?: string; did?: string; tag?: string }>;
    }> = [];

    // URL detection
    const urlRegex = /https?:\/\/[^\s]+/g;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
        const byteStart = Buffer.byteLength(text.slice(0, match.index), 'utf8');
        const byteEnd = byteStart + Buffer.byteLength(match[0], 'utf8');
        facets.push({
            index: { byteStart, byteEnd },
            features: [{
                $type: 'app.bsky.richtext.facet#link',
                uri: match[0],
            }],
        });
    }

    // Hashtag detection
    const hashtagRegex = /#(\w+)/g;
    while ((match = hashtagRegex.exec(text)) !== null) {
        const byteStart = Buffer.byteLength(text.slice(0, match.index), 'utf8');
        const byteEnd = byteStart + Buffer.byteLength(match[0], 'utf8');
        facets.push({
            index: { byteStart, byteEnd },
            features: [{
                $type: 'app.bsky.richtext.facet#tag',
                tag: match[1],
            }],
        });
    }

    return facets;
}

/**
 * Create a post on Bluesky
 */
export async function createBlueskyPost(
    session: BlueskySession,
    payload: BlueskyPostPayload
): Promise<ApiResponse<{ uri: string; cid: string }>> {
    try {
        // Upload images if present
        const imageBlobs: Array<{ image: unknown; alt: string }> = [];

        if (payload.images && payload.images.length > 0) {
            // Why: Image blobs are independent uploads — parallelize for faster publishing.
            const uploadResults = await Promise.all(
                payload.images.slice(0, 4).map(async (image) => {
                    const uploadResult = await uploadBlob(session, image.url);
                    if (!uploadResult.success || !uploadResult.data) {
                        return { success: false as const, error: uploadResult.error, alt: image.alt };
                    }
                    return { success: true as const, blob: uploadResult.data.blob, alt: image.alt };
                })
            );

            for (const result of uploadResults) {
                if (!result.success) {
                    logger.error({ error: result.error }, 'Bluesky image upload failed');
                    return { success: false, error: result.error };
                }
                imageBlobs.push({ image: result.blob, alt: result.alt || '' });
            }
        }

        // Build post record
        const record: Record<string, unknown> = {
            $type: 'app.bsky.feed.post',
            text: payload.text,
            createdAt: new Date().toISOString(),
        };

        // Add facets for rich text
        const facets = parseFacets(payload.text);
        if (facets.length > 0) {
            record.facets = facets;
        }

        // Add images embed
        if (imageBlobs.length > 0) {
            record.embed = {
                $type: 'app.bsky.embed.images',
                images: imageBlobs,
            };
        }

        // Add reply reference for thread structure
        // Why: AT Protocol requires both root (first post in thread) and parent (direct parent)
        if (payload.replyTo) {
            record.reply = {
                root: payload.replyRoot || payload.replyTo, // Use explicit root if provided
                parent: payload.replyTo,
            };
        }

        // Create record
        const response = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.accessJwt}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                repo: session.did,
                collection: 'app.bsky.feed.post',
                record,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error({ platform: 'bluesky', error: data }, 'Bluesky post creation failed');
            return {
                success: false,
                error: data.message || 'Bluesky post creation failed',
            };
        }

        return {
            success: true,
            data: {
                uri: data.uri,
                cid: data.cid,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'bluesky', error: message }, 'Bluesky publish error');
        return { success: false, error: message };
    }
}

/**
 * Create a thread on Bluesky (multiple connected posts)
 * Why: Bluesky threads require proper root/parent structure.
 * root = first post in thread (always the same)
 * parent = immediate previous post
 */
export async function createBlueskyThread(
    session: BlueskySession,
    posts: Array<BlueskyPostPayload>
): Promise<ApiResponse<{ posts: Array<{ uri: string; cid: string }> }>> {
    try {
        if (posts.length === 0) {
            return { success: false, error: 'Thread must have at least one post' };
        }

        const createdPosts: Array<{ uri: string; cid: string }> = [];
        let rootPost: { uri: string; cid: string } | undefined;
        let previousPost: { uri: string; cid: string } | undefined;

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];

            // For replies, root is always the first post, parent is the previous post
            let replyRef: BlueskyPostPayload['replyTo'] = undefined;
            let replyRootRef: BlueskyPostPayload['replyRoot'] = undefined;
            if (i > 0 && rootPost && previousPost) {
                // Parent is the immediate previous post
                replyRef = {
                    uri: previousPost.uri,
                    cid: previousPost.cid,
                };
                // Root is always the first post in the thread
                replyRootRef = {
                    uri: rootPost.uri,
                    cid: rootPost.cid,
                };
            }

            const threadPost: BlueskyPostPayload = {
                ...post,
                replyTo: replyRef,
                replyRoot: replyRootRef,
            };

            const result = await createBlueskyPost(session, threadPost);
            if (!result.success || !result.data) {
                logger.error({ error: result.error, postIndex: i }, 'Bluesky thread post failed');
                return {
                    success: false,
                    error: `Thread post ${i + 1} failed: ${result.error}`,
                };
            }

            createdPosts.push(result.data);

            // Track root (first post) and parent (previous post)
            if (i === 0) {
                rootPost = result.data;
            }
            previousPost = result.data;
        }

        return {
            success: true,
            data: { posts: createdPosts },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'bluesky', error: message }, 'Bluesky thread error');
        return { success: false, error: message };
    }
}

/**
 * Refresh Bluesky session tokens
 */
export async function refreshBlueskySession(
    refreshJwt: string
): Promise<ApiResponse<BlueskySession>> {
    try {
        const response = await fetch(`${BSKY_API}/com.atproto.server.refreshSession`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${refreshJwt}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Session refresh failed',
            };
        }

        return {
            success: true,
            data: {
                accessJwt: data.accessJwt,
                refreshJwt: data.refreshJwt,
                did: data.did,
                handle: data.handle,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}
