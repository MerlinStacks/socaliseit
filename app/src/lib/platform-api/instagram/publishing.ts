/**
 * Instagram Publishing Functions
 * Why: Story, Reel, and Feed Post publishing logic.
 */

import { existsSync } from 'fs';
import { logger } from '@/lib/logger';
import { ApiResponse, StoryMediaPayload, TrialReelPayload, FeedPostPayload } from '../types';
import { GRAPH_API_URL } from './constants';
import { resolveLocalFilePath, waitForContainerReady, uploadLocalVideoToInstagram, createVideoContainer } from './upload';

/**
 * Why: When waitForContainerReady times out, the container was already created
 * and may still be processing. Return the container ID in the error response
 * so the retry flow can poll it instead of creating a duplicate.
 */
function containerTimeoutError(error: string | undefined, containerId: string): ApiResponse<{ id: string }> {
    const isTimeout = error?.toLowerCase().includes('timeout');
    return {
        success: false,
        error: error,
        // Why: Encode containerId in data so the publisher layer can extract it
        // and return it as a pending ID for retry.
        data: isTimeout ? { id: `ig_pending:${containerId}` } : undefined,
    } as ApiResponse<{ id: string }>;
}

/**
 * Resolve a local /api/uploads/... path to a publicly-accessible URL using APP_URL.
 *
 * Why: Instagram's image_url parameter requires a URL that Instagram's servers
 * can reach. Local relative paths like "/api/uploads/abc.jpg" are not routable.
 * Videos already handled this via createVideoContainer, but images were passed
 * raw — causing the misleading "Only photo or video" error.
 *
 * Returns the original URL unchanged if it's already absolute (starts with http).
 * Throws if the URL is local but APP_URL is not configured.
 */
function resolvePublicImageUrl(url: string): string {
    if (url.startsWith('http')) return url;

    const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL;
    if (!appUrl) {
        throw new Error(
            `Cannot publish image to Instagram: APP_URL is not configured. ` +
            `Instagram requires a publicly-accessible URL to download the image. ` +
            `Set APP_URL in your environment to your app's public base URL.`,
        );
    }

    const publicUrl = `${appUrl.replace(/\/$/, '')}${url}`;
    logger.debug({ originalUrl: url, publicUrl }, '[Instagram API] Resolved local image to public URL');
    return publicUrl;
}

/**
 * Publish Instagram Story
 */
export async function publishInstagramStory(
    accessToken: string,
    instagramBusinessId: string,
    payload: StoryMediaPayload
): Promise<ApiResponse<{ id: string }>> {
    try {
        // Step 1: Create Container
        // Why: All Instagram Graph API calls now use Authorization: Bearer headers
        // instead of passing access_token in the request body. Tokens in bodies
        // leak into proxy logs, WAF captures, and debugging tools.
        const containerUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media`;
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        };
        const containerBody: Record<string, unknown> = {
            media_type: 'STORIES',
        };

        let creationId: string;

        if (payload.type === 'image') {
            containerBody.image_url = resolvePublicImageUrl(payload.url);

            const containerResponse = await fetch(containerUrl, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(containerBody)
            });
            const containerData = await containerResponse.json();

            if (containerData.error) {
                return { success: false, error: containerData.error.message };
            }

            creationId = containerData.id;
        } else {
            // VIDEO Story - check for local file first
            const localPath = resolveLocalFilePath(payload.url);
            const isLocalFile = existsSync(localPath);

            logger.debug({ mediaUrl: payload.url, localPath, isLocalFile }, '[Instagram API] Story video upload strategy check');

            if (isLocalFile) {
                logger.debug('[Instagram API] Found local video file for Story, using resumable upload');

                const uploadResult = await uploadLocalVideoToInstagram(
                    accessToken,
                    instagramBusinessId,
                    localPath,
                    undefined,
                    'STORIES'
                );

                if (!uploadResult.success) {
                    return { success: false, error: uploadResult.error };
                }

                creationId = uploadResult.data!.containerId;

                const readyResult = await waitForContainerReady(accessToken, creationId);
                if (!readyResult.success) {
                    return containerTimeoutError(readyResult.error, creationId);
                }
            } else {
                // GUARD: Fail fast if local file is missing but URL is clearly local
                if (payload.url.includes('localhost') || payload.url.includes('127.0.0.1')) {
                    const errorMsg = `Local video file not found at '${localPath}'. Instagram cannot download from localhost ('${payload.url}'). Please ensure the file exists on the server's disk (check Docker volume mounts) or use a public URL.`;
                    logger.error({ mediaUrl: payload.url, localPath }, '[Instagram API] Failed to resolve local file for Story localhost URL');
                    return { success: false, error: errorMsg };
                }

                // Remote URL - use standard video_url approach
                containerBody.video_url = payload.url;

                const containerResponse = await fetch(containerUrl, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify(containerBody)
                });
                const containerData = await containerResponse.json();

                if (containerData.error) {
                    return { success: false, error: containerData.error.message };
                }

                creationId = containerData.id;

                // Why: Remote videos also need server-side transcoding.
                // Reuse the shared waitForContainerReady helper instead of
                // duplicating polling logic inline.
                const readyResult = await waitForContainerReady(accessToken, creationId);
                if (!readyResult.success) {
                    return containerTimeoutError(readyResult.error, creationId);
                }
            }
        }

        // Step 3: Publish Container
        const publishUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media_publish`;
        const publishResponse = await fetch(publishUrl, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                creation_id: creationId,
            })
        });
        const publishData = await publishResponse.json();

        if (publishData.error) {
            return { success: false, error: publishData.error.message };
        }

        return {
            success: true,
            data: { id: publishData.id }
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Publish Trial Reel (API feature for Jan 2026)
 */
export async function publishTrialReel(
    accessToken: string,
    instagramBusinessId: string,
    payload: TrialReelPayload
): Promise<ApiResponse<{ id: string }>> {
    try {
        // Step 1: Create Container
        const containerUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media`;
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        };
        const containerBody = {
            media_type: 'REELS',
            video_url: payload.videoUrl,
            caption: payload.caption,
            cover_url: payload.coverImageUrl,
            share_to_feed: payload.shareToFeed ?? false,
            is_trial_reel: true,
        };

        const containerResponse = await fetch(containerUrl, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(containerBody)
        });
        const containerData = await containerResponse.json();

        if (containerData.error) {
            return { success: false, error: containerData.error.message };
        }

        const creationId = containerData.id;

        // Why (BUG-38): All other video paths wait for container processing,
        // but publishTrialReel was missing this step. Reels need server-side
        // transcoding; publishing immediately fails with 'media not ready'.
        const readyResult = await waitForContainerReady(accessToken, creationId);
        if (!readyResult.success) {
            return containerTimeoutError(readyResult.error, creationId);
        }

        // Step 2: Publish Container
        const publishUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media_publish`;
        const publishResponse = await fetch(publishUrl, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                creation_id: creationId,
            })
        });
        const publishData = await publishResponse.json();

        if (publishData.error) {
            return { success: false, error: publishData.error.message };
        }

        return {
            success: true,
            data: { id: publishData.id }
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Publish Instagram Feed Post (single image, video, or carousel)
 */
export async function publishInstagramFeedPost(
    accessToken: string,
    instagramBusinessId: string,
    payload: FeedPostPayload
): Promise<ApiResponse<{ id: string; permalink?: string }>> {
    try {
        let creationId: string;

        // Why: All Instagram Graph API calls use Authorization: Bearer headers
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        };

        if (payload.type === 'CAROUSEL') {
            // Step 1a: Create child containers for each media item
            // Why: Separate images (instant) from videos (need waitForContainerReady).
            // Images can be created in parallel; videos are sequential due to polling.
            const imageItems: { url: string; index: number }[] = [];
            const videoItems: { url: string; index: number }[] = [];

            payload.mediaUrls.forEach((mediaUrl, index) => {
                // Why (BUG-36): Previously used `$` anchor, which failed on S3/MinIO URLs
                // with query strings (e.g., video.mp4?X-Amz-Signature=...).
                const isVideo = mediaUrl.match(/\.(mp4|mov|avi|webm)(\?|#|$)/i);
                if (isVideo) {
                    videoItems.push({ url: mediaUrl, index });
                } else {
                    imageItems.push({ url: mediaUrl, index });
                }
            });

            // Results array preserving original order
            const childIds: (string | null)[] = new Array(payload.mediaUrls.length).fill(null);

            // Parallelize image container creation (images don't need polling)
            const imageResults = await Promise.all(
                imageItems.map(async ({ url, index }) => {
                    const childBody = {
                        is_carousel_item: true,
                        image_url: resolvePublicImageUrl(url),
                    };
                    const childResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify(childBody),
                    });
                    const childData = await childResp.json();
                    if (childData.error) {
                        return { success: false as const, error: childData.error.message, index };
                    }
                    return { success: true as const, id: childData.id as string, index };
                })
            );

            for (const result of imageResults) {
                if (!result.success) {
                    return { success: false, error: `Failed to create carousel item: ${result.error}` };
                }
                childIds[result.index] = result.id;
            }

            // Process video containers sequentially (each needs polling)
            for (const { url, index } of videoItems) {
                const childBody = {
                    is_carousel_item: true,
                    media_type: 'VIDEO',
                    video_url: url,
                };
                const childResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify(childBody),
                });
                const childData = await childResp.json();

                if (childData.error) {
                    return { success: false, error: `Failed to create carousel item: ${childData.error.message}` };
                }

                const readyResult = await waitForContainerReady(accessToken, childData.id);
                if (!readyResult.success) {
                    return containerTimeoutError(readyResult.error, childData.id);
                }

                childIds[index] = childData.id;
            }

            // Step 1b: Create carousel parent container
            const parentBody: Record<string, unknown> = {
                media_type: 'CAROUSEL',
                caption: payload.caption,
                children: childIds as string[],
            };

            if (payload.locationId) {
                parentBody.location_id = payload.locationId;
            }

            const parentResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(parentBody)
            });
            const parentData = await parentResp.json();

            if (parentData.error) {
                return { success: false, error: parentData.error.message };
            }

            creationId = parentData.id;

            // Why: The carousel parent container needs server-side processing
            // (assembling child media) before it can be published. Without this,
            // media_publish fails with errorCode 9007 / errorSubcode 2207027:
            // "Media ID is not available — The media is not ready to be published."
            const readyResult = await waitForContainerReady(accessToken, creationId);
            if (!readyResult.success) {
                return containerTimeoutError(readyResult.error, creationId);
            }

        } else {
            // Step 1: Create single media container
            const mediaUrl = payload.mediaUrls[0];

            if (payload.type === 'VIDEO') {
                // Check if this is a local file that needs resumable upload
                const localPath = resolveLocalFilePath(mediaUrl);
                const isLocalFile = existsSync(localPath);

                logger.debug({ mediaUrl, localPath, isLocalFile }, '[Instagram API] Checking video upload strategy');

                if (isLocalFile) {
                    const isReel = payload.isReel !== false;
                    const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL;

                    if (appUrl) {
                        // Why: Meta API bug 2207089 (since Feb 26 2026) — resumable upload
                        // ignores media_type=REELS and defaults to VIDEO (carousel-only).
                        // Workaround: construct a public URL from APP_URL so Instagram
                        // downloads the file directly via video_url. Same pattern as
                        // Facebook (facebook-api.ts) and Google Business (google-business.ts).
                        const relativePath = mediaUrl.startsWith('http')
                            ? new URL(mediaUrl).pathname
                            : mediaUrl;
                        const publicUrl = `${appUrl.replace(/\/$/, '')}${relativePath}`;

                        logger.info({ publicUrl }, '[Instagram API] Using video_url for local video');

                        const containerResult = await createVideoContainer({
                            accessToken,
                            instagramBusinessId,
                            videoUrl: publicUrl,
                            caption: payload.caption,
                            isReel,
                            shareToFeed: payload.instagramShareToFeed,
                            coverImageUrl: payload.coverImageUrl,
                            locationId: payload.locationId,
                        });
                        if (!containerResult.success) {
                            return { success: false, error: containerResult.error, errorCode: containerResult.errorCode };
                        }

                        creationId = containerResult.data!.containerId;

                        const readyResult = await waitForContainerReady(accessToken, creationId);
                        if (!readyResult.success) {
                            return containerTimeoutError(readyResult.error, creationId);
                        }
                    } else {
                        // Fallback: No APP_URL — use resumable binary upload.
                        // Why: Without a public URL, Instagram can't download the file.
                        // Resumable upload is broken for REELS (Meta bug 2207089) but may
                        // be fixed by Meta at any time. Log a warning so the operator knows.
                        logger.warn(
                            '[Instagram API] No APP_URL set — falling back to resumable upload (may fail due to Meta bug 2207089)',
                        );
                        const resumableMediaType = isReel ? 'REELS' as const : 'VIDEO' as const;
                        const uploadResult = await uploadLocalVideoToInstagram(
                            accessToken,
                            instagramBusinessId,
                            localPath,
                            payload.caption,
                            resumableMediaType,
                            payload.coverImageUrl,
                            payload.instagramShareToFeed,
                        );

                        if (!uploadResult.success) {
                            return { success: false, error: uploadResult.error };
                        }

                        creationId = uploadResult.data!.containerId;

                        const readyResult = await waitForContainerReady(accessToken, creationId);
                        if (!readyResult.success) {
                            return containerTimeoutError(readyResult.error, creationId);
                        }
                    }
                } else {
                    // GUARD: Fail fast if local file is missing but URL is clearly local
                    if (mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1')) {
                        const errorMsg = `Local video file not found at '${localPath}'. Instagram cannot download from localhost ('${mediaUrl}'). Please ensure the file exists on the server's disk (check Docker volume mounts) or use a public URL.`;
                        logger.error({ mediaUrl, localPath }, '[Instagram API] Failed to resolve local file for localhost URL');
                        return { success: false, error: errorMsg };
                    }

                    // Remote URL - use standard video_url approach
                    const isReel = payload.isReel !== false;

                    const containerResult = await createVideoContainer({
                        accessToken,
                        instagramBusinessId,
                        videoUrl: mediaUrl,
                        caption: payload.caption,
                        isReel,
                        shareToFeed: payload.instagramShareToFeed,
                        coverImageUrl: payload.coverImageUrl,
                        locationId: payload.locationId,
                    });
                    if (!containerResult.success) {
                        return { success: false, error: containerResult.error, errorCode: containerResult.errorCode };
                    }

                    creationId = containerResult.data!.containerId;

                    const readyResult = await waitForContainerReady(accessToken, creationId);
                    if (!readyResult.success) {
                        return containerTimeoutError(readyResult.error, creationId);
                    }
                }
            } else {
                // IMAGE type
                const containerBody: Record<string, unknown> = {
                    caption: payload.caption,
                    image_url: resolvePublicImageUrl(mediaUrl),
                };

                if (payload.locationId) {
                    containerBody.location_id = payload.locationId;
                }

                if (payload.userTags && payload.userTags.length > 0) {
                    containerBody.user_tags = payload.userTags.map(t => ({
                        username: t.username,
                        x: t.x,
                        y: t.y
                    }));
                }

                const containerResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify(containerBody)
                });
                const containerData = await containerResp.json();

                if (containerData.error) {
                    return { success: false, error: containerData.error.message };
                }

                creationId = containerData.id;
            }
        }

        // Step 2: Publish the container
        const publishResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media_publish`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                creation_id: creationId,
            })
        });
        const publishData = await publishResp.json();

        if (publishData.error) {
            // Why: Instagram's "Invalid parameter" is notoriously vague.
            // Log the full error object to surface error_subcode, error_user_msg,
            // and fbtrace_id which are essential for debugging with Meta support.
            logger.error(
                {
                    creationId,
                    errorMessage: publishData.error.message,
                    errorCode: publishData.error.code,
                    errorSubcode: publishData.error.error_subcode,
                    errorUserMsg: publishData.error.error_user_msg,
                    errorUserTitle: publishData.error.error_user_title,
                    fbtraceId: publishData.error.fbtrace_id,
                },
                '[Instagram API] media_publish failed',
            );
            return { success: false, error: publishData.error.error_user_msg || publishData.error.message, errorCode: publishData.error.code };
        }

        const mediaId = publishData.id;

        // Step 3: Post first comment if provided
        if (payload.firstComment) {
            await fetch(`${GRAPH_API_URL}/${mediaId}/comments`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    message: payload.firstComment,
                })
            });
            // Don't fail if first comment fails
        }

        // Step 4: Get permalink
        const mediaResp = await fetch(`${GRAPH_API_URL}/${mediaId}?fields=permalink`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const mediaData = await mediaResp.json();

        return {
            success: true,
            data: {
                id: mediaId,
                permalink: mediaData.permalink
            }
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}
