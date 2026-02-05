/**
 * Instagram Publishing Functions
 * Why: Story, Reel, and Feed Post publishing logic.
 */

import { existsSync } from 'fs';
import { logger } from '@/lib/logger';
import { ApiResponse, StoryMediaPayload, TrialReelPayload, FeedPostPayload } from '../types';
import { GRAPH_API_URL } from './constants';
import { resolveLocalFilePath, waitForContainerReady, uploadLocalVideoToInstagram } from './upload';

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
        const containerUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media`;
        const containerBody: any = {
            media_type: 'STORIES',
            access_token: accessToken,
        };

        let creationId: string;

        if (payload.type === 'image') {
            containerBody.image_url = payload.url;

            const containerResponse = await fetch(containerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                    return { success: false, error: readyResult.error };
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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(containerBody)
                });
                const containerData = await containerResponse.json();

                if (containerData.error) {
                    return { success: false, error: containerData.error.message };
                }

                creationId = containerData.id;
            }
        }

        // Step 2: For videos, poll container status until FINISHED
        if (payload.type === 'video') {
            const maxAttempts = 30;
            const pollInterval = 10000;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const statusUrl = `${GRAPH_API_URL}/${creationId}?fields=status_code,status&access_token=${accessToken}`;
                const statusResponse = await fetch(statusUrl);
                const statusData = await statusResponse.json();

                if (statusData.error) {
                    return { success: false, error: statusData.error.message };
                }

                if (statusData.status_code === 'FINISHED') {
                    break;
                }

                if (statusData.status_code === 'ERROR') {
                    const errorMsg = statusData.status || 'Video processing failed on Instagram';
                    return { success: false, error: errorMsg };
                }

                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }

        // Step 3: Publish Container
        const publishUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media_publish`;
        const publishResponse = await fetch(publishUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: accessToken
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
    } catch (error: any) {
        return { success: false, error: error.message };
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
        const containerBody = {
            media_type: 'REELS',
            video_url: payload.videoUrl,
            caption: payload.caption,
            cover_url: payload.coverImageUrl,
            share_to_feed: payload.shareToFeed ?? false,
            is_trial_reel: true,
            access_token: accessToken,
        };

        const containerResponse = await fetch(containerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(containerBody)
        });
        const containerData = await containerResponse.json();

        if (containerData.error) {
            return { success: false, error: containerData.error.message };
        }

        const creationId = containerData.id;

        // Step 2: Publish Container
        const publishUrl = `${GRAPH_API_URL}/${instagramBusinessId}/media_publish`;
        const publishResponse = await fetch(publishUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: accessToken
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
    } catch (error: any) {
        return { success: false, error: error.message };
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

        if (payload.type === 'CAROUSEL') {
            // Step 1a: Create child containers for each media item
            const childIds: string[] = [];

            for (const mediaUrl of payload.mediaUrls) {
                const isVideo = mediaUrl.match(/\.(mp4|mov|avi|webm)$/i);
                const childBody: Record<string, unknown> = {
                    is_carousel_item: true,
                    access_token: accessToken,
                };

                if (isVideo) {
                    childBody.media_type = 'VIDEO';
                    childBody.video_url = mediaUrl;
                } else {
                    childBody.image_url = mediaUrl;
                }

                const childResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(childBody)
                });
                const childData = await childResp.json();

                if (childData.error) {
                    return { success: false, error: `Failed to create carousel item: ${childData.error.message}` };
                }

                // Wait for video containers to be ready
                if (isVideo) {
                    const readyResult = await waitForContainerReady(accessToken, childData.id);
                    if (!readyResult.success) {
                        return { success: false, error: readyResult.error, errorCode: readyResult.errorCode };
                    }
                }

                childIds.push(childData.id);
            }

            // Step 1b: Create carousel parent container
            const parentBody: Record<string, unknown> = {
                media_type: 'CAROUSEL',
                caption: payload.caption,
                children: childIds.join(','),
                access_token: accessToken,
            };

            if (payload.locationId) {
                parentBody.location_id = payload.locationId;
            }

            const parentResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parentBody)
            });
            const parentData = await parentResp.json();

            if (parentData.error) {
                return { success: false, error: parentData.error.message };
            }

            creationId = parentData.id;

        } else {
            // Step 1: Create single media container
            const mediaUrl = payload.mediaUrls[0];

            if (payload.type === 'VIDEO') {
                // Check if this is a local file that needs resumable upload
                const localPath = resolveLocalFilePath(mediaUrl);
                const isLocalFile = existsSync(localPath);

                logger.debug({ mediaUrl, localPath, isLocalFile }, '[Instagram API] Checking video upload strategy');

                if (isLocalFile) {
                    logger.debug('[Instagram API] Found local file on disk, proceeding with resumable upload');

                    const uploadResult = await uploadLocalVideoToInstagram(
                        accessToken,
                        instagramBusinessId,
                        localPath,
                        payload.caption,
                        payload.isReel ? 'REELS' : 'VIDEO',
                        payload.coverImageUrl
                    );

                    if (!uploadResult.success) {
                        return { success: false, error: uploadResult.error };
                    }

                    creationId = uploadResult.data!.containerId;

                    const readyResult = await waitForContainerReady(accessToken, creationId);
                    if (!readyResult.success) {
                        return { success: false, error: readyResult.error, errorCode: readyResult.errorCode };
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

                    const containerBody: Record<string, unknown> = {
                        caption: payload.caption,
                        access_token: accessToken,
                        media_type: isReel ? 'REELS' : 'VIDEO',
                        video_url: mediaUrl,
                    };

                    if (isReel) {
                        containerBody.share_to_feed = true;
                    }

                    if (payload.coverImageUrl) {
                        containerBody.cover_url = payload.coverImageUrl;
                    }

                    if (payload.locationId) {
                        containerBody.location_id = payload.locationId;
                    }

                    const containerResp = await fetch(`${GRAPH_API_URL}/${instagramBusinessId}/media`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(containerBody)
                    });
                    const containerData = await containerResp.json();

                    if (containerData.error) {
                        return { success: false, error: containerData.error.message };
                    }

                    creationId = containerData.id;

                    const readyResult = await waitForContainerReady(accessToken, creationId);
                    if (!readyResult.success) {
                        return { success: false, error: readyResult.error, errorCode: readyResult.errorCode };
                    }
                }
            } else {
                // IMAGE type
                const containerBody: Record<string, unknown> = {
                    caption: payload.caption,
                    access_token: accessToken,
                    image_url: mediaUrl,
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
                    headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: accessToken
            })
        });
        const publishData = await publishResp.json();

        if (publishData.error) {
            return { success: false, error: publishData.error.message };
        }

        const mediaId = publishData.id;

        // Step 3: Post first comment if provided
        if (payload.firstComment) {
            await fetch(`${GRAPH_API_URL}/${mediaId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: payload.firstComment,
                    access_token: accessToken
                })
            });
            // Don't fail if first comment fails
        }

        // Step 4: Get permalink
        const mediaResp = await fetch(`${GRAPH_API_URL}/${mediaId}?fields=permalink&access_token=${accessToken}`);
        const mediaData = await mediaResp.json();

        return {
            success: true,
            data: {
                id: mediaId,
                permalink: mediaData.permalink
            }
        };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
