/**
 * Facebook Publisher
 * Why: Facebook-specific publishing logic (Page Posts, Stories, Reels).
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';
import { resolveLocalFilePath } from '../../platform-api/local-file';
import { GRAPH_API_URL } from '../../platform-api/constants';

/**
 * Why: Facebook silently rejects photo stories when the Content-Type doesn't
 * match the actual file format. Hardcoding 'image/jpeg' broke PNG/WebP uploads.
 */
const MIME_BY_EXT: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
};

/** Resolve MIME type from a file path extension, defaulting to 'image/jpeg'. */
function getMimeType(filePath: string): string {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    return MIME_BY_EXT[ext] || 'image/jpeg';
}

/**
 * Why: Facebook error responses include `type`, `code`, and sometimes
 * `error_subcode` — but we were only surfacing `.message`. This helper
 * builds a rich string so the retry classifier can pattern-match on
 * "OAuthException" and the upstream logs capture the subcode.
 */
function formatFbError(err: { message?: string; type?: string; code?: number; error_subcode?: number }): string {
    const parts = [err.message || 'Unknown Facebook error'];
    if (err.type) parts.push(`[${err.type}]`);
    if (err.code != null) parts.push(`code=${err.code}`);
    if (err.error_subcode != null) parts.push(`subcode=${err.error_subcode}`);
    return parts.join(' ');
}

/**
 * Main Facebook publisher - routes to appropriate sub-publisher
 */
export async function publishToFacebook(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.postType === 'story') {
        return publishToFacebookStory(account, payload);
    }
    if (payload.postType === 'reel') {
        return publishToFacebookReel(account, payload);
    }

    // Default: Page post
    try {
        const { publishFacebookPagePost } = await import('@/lib/platform-api/facebook-api');

        let mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL' = 'IMAGE';
        if (payload.mediaType === 'video') {
            mediaType = 'VIDEO';
        } else if (payload.mediaType === 'carousel' || payload.mediaUrls.length > 1) {
            mediaType = 'CAROUSEL';
        }

        const result = await publishFacebookPagePost(
            account.accessToken,
            account.accountId,
            {
                type: mediaType,
                caption: payload.caption,
                mediaUrls: payload.mediaUrls,
                locationId: payload.location,  // Pass location for geo-tagging
                altText: payload.altText,
                altTexts: payload.altTexts,
            }
        );

        if (!result.success) {
            logger.error({ platform: 'facebook', error: result.error }, 'Facebook publish failed');
            return {
                success: false,
                error: result.error || 'Unknown Facebook error',
                errorCode: result.errorCode,
            };
        }

        return {
            success: true,
            postId: result.data?.id,
            postUrl: result.data?.permalink || `https://facebook.com/${account.accountId}/posts/${result.data?.id}`,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'facebook', postType: 'feed', error: message }, 'Facebook page post publish error');
        return { success: false, error: message };
    }
}

/**
 * Publish Facebook Story
 * Why: Facebook Video Stories require a 3-phase resumable upload protocol:
 *   1. Start → get video_id and upload_url
 *   2. Transfer → upload video binary to rupload.facebook.com
 *   3. Finish → finalize the story
 */
async function publishToFacebookStory(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaUrls.length === 0) {
        return { success: false, error: 'Stories require media' };
    }

    const mediaUrl = payload.mediaUrls[0];
    const isVideo = payload.mediaType === 'video';

    try {
        // Why: All Facebook Graph API calls use Authorization: Bearer headers
        // instead of passing access_token in the request body.
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${account.accessToken}`,
        };

        if (isVideo) {
            const endpoint = `${GRAPH_API_URL}/${account.accountId}/video_stories`;

            // Step 1: Initialize upload - get video_id and upload_url
            const initResponse = await fetch(endpoint, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    upload_phase: 'start',
                })
            });

            if (!initResponse.ok) {
                const errData = await initResponse.json().catch(() => ({}));
                logger.error({ platform: 'facebook', postType: 'story', error: errData, status: initResponse.status }, 'Facebook Story init failed (HTTP)');
                return { success: false, error: errData.error ? formatFbError(errData.error) : `Facebook API returned ${initResponse.status}` };
            }

            const initData = await initResponse.json();

            if (initData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: initData.error, subcode: initData.error?.error_subcode }, 'Facebook Story init failed');
                return { success: false, error: formatFbError(initData.error), errorCode: initData.error?.code?.toString() };
            }

            const videoId = initData.video_id;
            const uploadUrl = initData.upload_url;

            if (!uploadUrl) {
                logger.error({ platform: 'facebook', postType: 'story' }, 'Facebook Story init missing upload_url');
                return { success: false, error: 'Missing upload URL from Facebook' };
            }

            // Step 2: Get video bytes - either from disk (local) or network (remote)
            logger.info({ platform: 'facebook', postType: 'story', videoId, mediaUrl }, 'Downloading video for Facebook Story upload');

            let videoBytes: Buffer;
            // Why: Use shared resolveLocalFilePath helper instead of duplicating path logic.
            const localPath = resolveLocalFilePath(mediaUrl);
            const { existsSync } = await import('fs');
            const isLocal = existsSync(localPath);

            if (isLocal) {
                logger.debug({ platform: 'facebook', postType: 'story', filePath: localPath }, 'Reading local file');

                // Read file - single Buffer, no extra copies
                videoBytes = await import('fs/promises').then(fsp => fsp.readFile(localPath));
            } else {
                // Remote URL: fetch over network
                const videoResponse = await fetch(mediaUrl);
                if (!videoResponse.ok) {
                    return { success: false, error: `Failed to fetch video: ${videoResponse.status}` };
                }
                videoBytes = Buffer.from(await videoResponse.arrayBuffer());
            }

            logger.info({
                platform: 'facebook',
                postType: 'story',
                videoId,
                size: videoBytes.length,
                source: isLocal ? 'local' : 'remote'
            }, 'Uploading video binary to Facebook');

            const uploadResponse = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `OAuth ${account.accessToken}`,
                    'offset': '0',
                    'file_size': videoBytes.length.toString(),
                    'Content-Type': 'application/octet-stream',
                },
                body: new Uint8Array(videoBytes),
            });

            if (!uploadResponse.ok) {
                const errData = await uploadResponse.json().catch(() => ({}));
                logger.error({ platform: 'facebook', postType: 'story', status: uploadResponse.status, error: errData }, 'Facebook Story upload failed (HTTP)');
                return { success: false, error: errData.error ? formatFbError(errData.error) : `Upload failed with HTTP ${uploadResponse.status}` };
            }

            const uploadData = await uploadResponse.json();

            if (uploadData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: uploadData.error, subcode: uploadData.error?.error_subcode }, 'Facebook Story upload failed');
                return { success: false, error: formatFbError(uploadData.error), errorCode: uploadData.error?.code?.toString() };
            }

            // Step 3: Finish the story (no video_url needed - video already uploaded)
            const finishResponse = await fetch(endpoint, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    upload_phase: 'finish',
                    video_id: videoId,
                })
            });

            if (!finishResponse.ok) {
                const errData = await finishResponse.json().catch(() => ({}));
                logger.error({ platform: 'facebook', postType: 'story', status: finishResponse.status, error: errData }, 'Facebook Story finish failed (HTTP)');
                return { success: false, error: errData.error ? formatFbError(errData.error) : `Finish failed with HTTP ${finishResponse.status}` };
            }

            const finishData = await finishResponse.json();

            if (finishData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: finishData.error, subcode: finishData.error?.error_subcode }, 'Facebook Story finish failed');
                return { success: false, error: formatFbError(finishData.error), errorCode: finishData.error?.code?.toString() };
            }

            logger.info({ platform: 'facebook', postType: 'story', postId: finishData.post_id }, 'Facebook Story published');
            return { success: true, postId: finishData.post_id || videoId };
        } else {
            // Photo stories — two-step process required by Facebook Graph API:
            //   1. Upload photo to /{page-id}/photos with published=false → get photo_id
            //   2. POST { photo_id } to /{page-id}/photo_stories
            // Why: Facebook's photo_stories endpoint does NOT accept raw image data.
            //   Sending FormData or photo_url directly returns OAuthException code 1.
            const photosEndpoint = `${GRAPH_API_URL}/${account.accountId}/photos`;
            const storyEndpoint = `${GRAPH_API_URL}/${account.accountId}/photo_stories`;
            // Why: Use shared resolveLocalFilePath helper.
            const localPhotoPath = resolveLocalFilePath(mediaUrl);
            const { existsSync: existsSyncPhoto } = await import('fs');
            const isLocal = existsSyncPhoto(localPhotoPath);

            // Step 1: Upload photo as unpublished
            let photoId: string;

            if (isLocal) {
                const { readFile } = await import('fs/promises');
                const path = await import('path');

                logger.debug({ platform: 'facebook', postType: 'story', filePath: localPhotoPath }, 'Reading local photo for story');

                const fileBlob = new Blob([await readFile(localPhotoPath)], { type: getMimeType(localPhotoPath) });

                const formData = new FormData();
                formData.append('source', fileBlob, path.basename(localPhotoPath));
                formData.append('published', 'false');

                const uploadResponse = await fetch(photosEndpoint, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${account.accessToken}` },
                    body: formData,
                });

                if (!uploadResponse.ok) {
                    const errData = await uploadResponse.json().catch(() => ({}));
                    logger.error({ platform: 'facebook', postType: 'story', status: uploadResponse.status, error: errData }, 'Facebook Photo Story upload failed (HTTP)');
                    return { success: false, error: errData.error ? formatFbError(errData.error) : `Upload failed with HTTP ${uploadResponse.status}` };
                }

                const uploadData = await uploadResponse.json();

                if (uploadData.error) {
                    logger.error({ platform: 'facebook', postType: 'story', error: uploadData.error, subcode: uploadData.error?.error_subcode }, 'Facebook Photo Story upload failed');
                    return { success: false, error: formatFbError(uploadData.error), errorCode: uploadData.error?.code?.toString() };
                }

                photoId = uploadData.id;
            } else {
                // Remote URL: upload via url parameter
                const uploadResponse = await fetch(photosEndpoint, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                        url: mediaUrl,
                        published: false,
                    }),
                });

                if (!uploadResponse.ok) {
                    const errData = await uploadResponse.json().catch(() => ({}));
                    logger.error({ platform: 'facebook', postType: 'story', status: uploadResponse.status, error: errData }, 'Facebook Photo Story upload failed (HTTP)');
                    return { success: false, error: errData.error ? formatFbError(errData.error) : `Upload failed with HTTP ${uploadResponse.status}` };
                }

                const uploadData = await uploadResponse.json();

                if (uploadData.error) {
                    logger.error({ platform: 'facebook', postType: 'story', error: uploadData.error, subcode: uploadData.error?.error_subcode }, 'Facebook Photo Story upload failed');
                    return { success: false, error: formatFbError(uploadData.error), errorCode: uploadData.error?.code?.toString() };
                }

                photoId = uploadData.id;
            }

            if (!photoId) {
                logger.error({ platform: 'facebook', postType: 'story' }, 'Facebook Photo upload returned no photo_id');
                return { success: false, error: 'Photo upload succeeded but returned no photo_id' };
            }

            logger.info({ platform: 'facebook', postType: 'story', photoId }, 'Photo uploaded, creating story');

            // Step 2: Create the story using the uploaded photo_id
            const storyResponse = await fetch(storyEndpoint, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    photo_id: photoId,
                }),
            });

            if (!storyResponse.ok) {
                const errData = await storyResponse.json().catch(() => ({}));
                logger.error({ platform: 'facebook', postType: 'story', status: storyResponse.status, error: errData, photoId }, 'Facebook Photo Story publish failed (HTTP)');
                return { success: false, error: errData.error ? formatFbError(errData.error) : `Story publish failed with HTTP ${storyResponse.status}` };
            }

            const storyData = await storyResponse.json();

            if (storyData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: storyData.error, subcode: storyData.error.error_subcode, photoId }, 'Facebook Photo Story publish failed');
                return { success: false, error: formatFbError(storyData.error), errorCode: storyData.error.code?.toString() };
            }

            logger.info({ platform: 'facebook', postType: 'story', postId: storyData.post_id, photoId }, 'Facebook Photo Story published');
            return { success: true, postId: storyData.post_id || storyData.id };
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'facebook', postType: 'story', error: message }, 'Facebook Story publish error');
        return { success: false, error: message };
    }
}

/**
 * Publish Facebook Reel
 */
async function publishToFacebookReel(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    if (payload.mediaType !== 'video') {
        return { success: false, error: 'Reels require video content' };
    }

    if (payload.mediaUrls.length === 0) {
        return { success: false, error: 'Reels require a video' };
    }

    const mediaUrl = payload.mediaUrls[0];
    const endpoint = `${GRAPH_API_URL}/${account.accountId}/video_reels`;
    const uploadsIndex = mediaUrl.indexOf('/uploads/');
    const isLocal = uploadsIndex !== -1;

    try {
        if (isLocal) {
            // Local file: Use 3-phase resumable upload (same as Video Stories)
            // Why: Facebook Video Reels require binary upload for local files

            // Step 1: Initialize upload
            // Why: Use Authorization: Bearer headers instead of body token.
            const authHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${account.accessToken}`,
            };
            const initResponse = await fetch(endpoint, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    upload_phase: 'start',
                })
            });

            if (!initResponse.ok) {
                const errData = await initResponse.json().catch(() => ({}));
                logger.error({ platform: 'facebook', postType: 'reel', status: initResponse.status, error: errData }, 'Facebook Reel init failed (HTTP)');
                return { success: false, error: errData.error ? formatFbError(errData.error) : `Facebook API returned ${initResponse.status}` };
            }

            const initData = await initResponse.json();

            if (initData.error) {
                logger.error({ platform: 'facebook', postType: 'reel', error: initData.error, subcode: initData.error?.error_subcode }, 'Facebook Reel init failed');
                return { success: false, error: formatFbError(initData.error), errorCode: initData.error?.code?.toString() };
            }

            const videoId = initData.video_id;
            const uploadUrl = initData.upload_url;

            if (!uploadUrl) {
                return { success: false, error: 'Missing upload URL from Facebook' };
            }

            // Step 2: Read local file and upload
            // Why: Use shared resolveLocalFilePath helper.
            const localPath = resolveLocalFilePath(mediaUrl);
            const { existsSync } = await import('fs');
            const fsp = await import('fs/promises');

            if (!existsSync(localPath)) {
                return { success: false, error: `Local video not found: ${localPath}` };
            }

            const videoBytes = await fsp.readFile(localPath);

            logger.info({ platform: 'facebook', postType: 'reel', videoId, size: videoBytes.length }, 'Uploading Reel video binary');

            const uploadResponse = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `OAuth ${account.accessToken}`,
                    'offset': '0',
                    'file_size': videoBytes.length.toString(),
                    'Content-Type': 'application/octet-stream',
                },
                body: new Uint8Array(videoBytes),
            });

            if (!uploadResponse.ok) {
                const errData = await uploadResponse.json().catch(() => ({}));
                logger.error({ platform: 'facebook', postType: 'reel', status: uploadResponse.status, error: errData }, 'Facebook Reel upload failed (HTTP)');
                return { success: false, error: errData.error ? formatFbError(errData.error) : `Upload failed with HTTP ${uploadResponse.status}` };
            }

            const uploadData = await uploadResponse.json();

            if (uploadData.error) {
                logger.error({ platform: 'facebook', postType: 'reel', error: uploadData.error, subcode: uploadData.error?.error_subcode }, 'Facebook Reel upload failed');
                return { success: false, error: formatFbError(uploadData.error), errorCode: uploadData.error?.code?.toString() };
            }

            // Step 3: Finish and publish the reel
            // Why: video_state: 'PUBLISHED' is REQUIRED for the Reel to be visible
            // Without this, Reels are uploaded but remain as unpublished drafts
            const finishResponse = await fetch(endpoint, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    upload_phase: 'finish',
                    video_id: videoId,
                    video_state: 'PUBLISHED',
                    description: payload.caption,
                    thumb_url: payload.thumbnailUrl,
                })
            });

            if (!finishResponse.ok) {
                const errData = await finishResponse.json().catch(() => ({}));
                logger.error({ platform: 'facebook', postType: 'reel', status: finishResponse.status, error: errData }, 'Facebook Reel finish failed (HTTP)');
                return { success: false, error: errData.error ? formatFbError(errData.error) : `Finish failed with HTTP ${finishResponse.status}` };
            }

            const finishData = await finishResponse.json();

            if (finishData.error) {
                logger.error({ platform: 'facebook', postType: 'reel', error: finishData.error, subcode: finishData.error?.error_subcode }, 'Facebook Reel finish failed');
                return { success: false, error: formatFbError(finishData.error), errorCode: finishData.error?.code?.toString() };
            }

            logger.info({ platform: 'facebook', postType: 'reel', postId: finishData.id || videoId }, 'Facebook Reel published');
            return { success: true, postId: finishData.id || videoId };
        } else {
            // Remote URL: Use video_url parameter
            const body: Record<string, unknown> = {
                video_url: mediaUrl,
                description: payload.caption,
            };
            if (payload.thumbnailUrl) {
                body.thumb_url = payload.thumbnailUrl;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${account.accessToken}`,
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                logger.error({ platform: 'facebook', postType: 'reel', status: response.status, error: errData }, 'Facebook Reel publish failed (HTTP)');
                return { success: false, error: errData.error ? formatFbError(errData.error) : `Facebook API returned ${response.status}` };
            }

            const data = await response.json();

            if (data.error) {
                logger.error({ platform: 'facebook', postType: 'reel', error: data.error, subcode: data.error.error_subcode }, 'Facebook Reel publish failed');
                return { success: false, error: formatFbError(data.error), errorCode: data.error.code?.toString() };
            }

            return { success: true, postId: data.id };
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'facebook', postType: 'reel', error: message }, 'Facebook Reel publish error');
        return { success: false, error: message };
    }
}
