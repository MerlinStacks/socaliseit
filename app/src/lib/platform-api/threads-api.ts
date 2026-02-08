/**
 * Threads API Integration
 * Handles all direct API calls to Meta's Threads platform.
 *
 * Why: Threads uses a separate API domain (graph.threads.net) from the main
 * Meta Graph API, with its own scopes and endpoints. Publishing follows a
 * two-step flow: create media container → publish container.
 */

import { ApiResponse } from './types';
import { logger } from '@/lib/logger';

const THREADS_API = 'https://graph.threads.net/v1.0';

// ============================================================================
// Profile
// ============================================================================

export interface ThreadsProfile {
    id: string;
    username: string;
    name?: string;
    threadsProfilePictureUrl?: string;
    threadsBiography?: string;
    isVerified?: boolean;
}

/**
 * Fetch authenticated Threads user profile.
 * Why: Used during OAuth callback to populate SocialAccount fields.
 */
export async function getThreadsProfile(
    accessToken: string
): Promise<ApiResponse<ThreadsProfile>> {
    try {
        const fields = 'id,username,name,threads_profile_picture_url,threads_biography,is_verified';
        const url = `${THREADS_API}/me?fields=${fields}&access_token=${accessToken}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            logger.error({ errorData }, 'Threads profile fetch failed');
            return {
                success: false,
                error: errorData.error?.message || 'Failed to fetch Threads profile',
                errorCode: errorData.error?.code?.toString(),
            };
        }

        const data = await response.json();
        return {
            success: true,
            data: {
                id: data.id,
                username: data.username,
                name: data.name,
                threadsProfilePictureUrl: data.threads_profile_picture_url,
                threadsBiography: data.threads_biography,
                isVerified: data.is_verified,
            },
        };
    } catch (error) {
        logger.error({ error }, 'Threads profile fetch exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================================================
// Publishing (Two-Step Container Flow)
// ============================================================================

/**
 * Create and publish a text-only Threads post.
 * Why: Text posts skip the container wait — they publish immediately.
 */
export async function createThreadsTextPost(
    userId: string,
    accessToken: string,
    text: string
): Promise<ApiResponse<{ id: string }>> {
    return createAndPublish(userId, accessToken, {
        media_type: 'TEXT',
        text,
    });
}

/**
 * Create and publish an image Threads post.
 * Why: Image URL must be publicly accessible — Threads fetches it server-side.
 */
export async function createThreadsImagePost(
    userId: string,
    accessToken: string,
    text: string,
    imageUrl: string
): Promise<ApiResponse<{ id: string }>> {
    return createAndPublish(userId, accessToken, {
        media_type: 'IMAGE',
        image_url: imageUrl,
        text,
    });
}

/**
 * Create and publish a video Threads post.
 * Why: Video containers need polling — status must be FINISHED before publish.
 */
export async function createThreadsVideoPost(
    userId: string,
    accessToken: string,
    text: string,
    videoUrl: string
): Promise<ApiResponse<{ id: string }>> {
    return createAndPublish(userId, accessToken, {
        media_type: 'VIDEO',
        video_url: videoUrl,
        text,
    });
}

/**
 * Create and publish a carousel Threads post.
 * Why: Carousels require child containers first, then a parent container.
 * Each child must be IMAGE or VIDEO (not TEXT).
 */
export async function createThreadsCarouselPost(
    userId: string,
    accessToken: string,
    text: string,
    items: Array<{ type: 'IMAGE' | 'VIDEO'; url: string }>
): Promise<ApiResponse<{ id: string }>> {
    try {
        // Step 1: Create child containers (no text on children)
        const childIds: string[] = [];
        for (const item of items) {
            const params: Record<string, string> = {
                media_type: item.type,
                is_carousel_item: 'true',
                access_token: accessToken,
            };
            if (item.type === 'IMAGE') {
                params.image_url = item.url;
            } else {
                params.video_url = item.url;
            }

            const childRes = await fetch(`${THREADS_API}/${userId}/threads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(params),
            });

            if (!childRes.ok) {
                const err = await childRes.json();
                logger.error({ err, item }, 'Threads carousel child creation failed');
                return {
                    success: false,
                    error: err.error?.message || 'Failed to create carousel item',
                };
            }

            const childData = await childRes.json();
            childIds.push(childData.id);
        }

        // Step 2: Wait for video children to finish processing
        for (const childId of childIds) {
            const ready = await waitForContainer(childId, accessToken);
            if (!ready) {
                return { success: false, error: `Carousel item ${childId} failed processing` };
            }
        }

        // Step 3: Create parent CAROUSEL container
        const parentRes = await fetch(`${THREADS_API}/${userId}/threads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                media_type: 'CAROUSEL',
                children: childIds.join(','),
                text,
                access_token: accessToken,
            }),
        });

        if (!parentRes.ok) {
            const err = await parentRes.json();
            logger.error({ err }, 'Threads carousel parent creation failed');
            return { success: false, error: err.error?.message || 'Failed to create carousel' };
        }

        const parentData = await parentRes.json();

        // Step 4: Publish the carousel
        return publishContainer(userId, parentData.id, accessToken);
    } catch (error) {
        logger.error({ error }, 'Threads carousel post exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Core two-step flow: create container → wait → publish.
 * Why: Threads API separates creation from publishing to allow media processing.
 */
async function createAndPublish(
    userId: string,
    accessToken: string,
    containerParams: Record<string, string>
): Promise<ApiResponse<{ id: string }>> {
    try {
        // Step 1: Create media container
        const createRes = await fetch(`${THREADS_API}/${userId}/threads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                ...containerParams,
                access_token: accessToken,
            }),
        });

        if (!createRes.ok) {
            const err = await createRes.json();
            logger.error({ err, containerParams }, 'Threads container creation failed');
            return {
                success: false,
                error: err.error?.message || 'Failed to create Threads container',
                errorCode: err.error?.code?.toString(),
            };
        }

        const { id: containerId } = await createRes.json();

        // Step 2: Wait for container processing (videos need time)
        if (containerParams.media_type === 'VIDEO') {
            const ready = await waitForContainer(containerId, accessToken);
            if (!ready) {
                return { success: false, error: 'Video processing timed out' };
            }
        }

        // Step 3: Publish
        return publishContainer(userId, containerId, accessToken);
    } catch (error) {
        logger.error({ error }, 'Threads create-and-publish exception');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Publish a processed container.
 * Why: The final POST to /{userId}/threads_publish makes the post live.
 */
async function publishContainer(
    userId: string,
    containerId: string,
    accessToken: string
): Promise<ApiResponse<{ id: string }>> {
    const publishRes = await fetch(`${THREADS_API}/${userId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            creation_id: containerId,
            access_token: accessToken,
        }),
    });

    if (!publishRes.ok) {
        const err = await publishRes.json();
        logger.error({ err, containerId }, 'Threads publish failed');
        return {
            success: false,
            error: err.error?.message || 'Failed to publish Threads post',
            errorCode: err.error?.code?.toString(),
        };
    }

    const data = await publishRes.json();
    logger.info({ postId: data.id }, 'Threads post published');
    return { success: true, data: { id: data.id } };
}

/**
 * Poll container status until FINISHED or error (max ~60s).
 * Why: Video/carousel containers need server-side processing before they can be published.
 */
async function waitForContainer(
    containerId: string,
    accessToken: string,
    maxAttempts = 30,
    intervalMs = 2000
): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        const statusRes = await fetch(
            `${THREADS_API}/${containerId}?fields=status&access_token=${accessToken}`
        );
        if (statusRes.ok) {
            const data = await statusRes.json();
            if (data.status === 'FINISHED') return true;
            if (data.status === 'ERROR' || data.status === 'EXPIRED') {
                logger.error({ containerId, status: data.status }, 'Threads container failed');
                return false;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    logger.error({ containerId }, 'Threads container processing timed out');
    return false;
}
