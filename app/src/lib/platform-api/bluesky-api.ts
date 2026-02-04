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

        // Why: Detect local uploads and read from disk instead of fetch
        const uploadsIndex = imageUrl.indexOf('/uploads/');
        const isLocal = uploadsIndex !== -1;

        if (isLocal) {
            const { readFileSync, existsSync } = await import('fs');
            const path = await import('path');

            const relativePath = imageUrl.substring(uploadsIndex);
            const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
            const localPath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

            if (!existsSync(localPath)) {
                return { success: false, error: `Local file not found: ${localPath}` };
            }

            const fileBuffer = readFileSync(localPath);
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
            for (const image of payload.images.slice(0, 4)) { // Max 4 images
                const uploadResult = await uploadBlob(session, image.url);
                if (!uploadResult.success || !uploadResult.data) {
                    logger.error({ error: uploadResult.error }, 'Bluesky image upload failed');
                    return { success: false, error: uploadResult.error };
                }
                imageBlobs.push({
                    image: uploadResult.data.blob,
                    alt: image.alt || '',
                });
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
