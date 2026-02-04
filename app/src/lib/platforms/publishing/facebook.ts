/**
 * Facebook Publisher
 * Why: Facebook-specific publishing logic (Page Posts, Stories, Reels).
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

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
        }
    );

    if (!result.success) {
        logger.error({ platform: 'facebook', error: result.error }, 'Facebook publish failed');
        return {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
        };
    }

    return {
        success: true,
        postId: result.data?.id,
        postUrl: result.data?.permalink || `https://facebook.com/${account.accountId}/posts/${result.data?.id}`,
    };
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
        if (isVideo) {
            const endpoint = `https://graph.facebook.com/v24.0/${account.accountId}/video_stories`;

            // Step 1: Initialize upload - get video_id and upload_url
            const initResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: account.accessToken,
                    upload_phase: 'start',
                })
            });
            const initData = await initResponse.json();

            if (initData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: initData.error }, 'Facebook Story init failed');
                return { success: false, error: initData.error.message, errorCode: initData.error.code?.toString() };
            }

            const videoId = initData.video_id;
            const uploadUrl = initData.upload_url;

            if (!uploadUrl) {
                logger.error({ platform: 'facebook', postType: 'story' }, 'Facebook Story init missing upload_url');
                return { success: false, error: 'Missing upload URL from Facebook' };
            }

            // Step 2: Get video bytes - either from disk (local) or network (remote)
            logger.info({ platform: 'facebook', postType: 'story', videoId, mediaUrl }, 'Downloading video for Facebook Story upload');

            let videoBytes: Uint8Array;
            const uploadsIndex = mediaUrl.indexOf('/uploads/');
            const isLocal = uploadsIndex !== -1;

            if (isLocal) {
                // Local file: read from disk
                const { readFileSync, existsSync } = await import('fs');
                const path = await import('path');

                const relativePath = mediaUrl.substring(uploadsIndex);
                const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
                const filePath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

                logger.debug({ platform: 'facebook', postType: 'story', filePath }, 'Reading local file');

                if (!existsSync(filePath)) {
                    return { success: false, error: `Local video file not found: ${filePath}` };
                }

                const fileBuffer = readFileSync(filePath);
                videoBytes = new Uint8Array(fileBuffer);
            } else {
                // Remote URL: fetch over network
                const videoResponse = await fetch(mediaUrl);
                if (!videoResponse.ok) {
                    return { success: false, error: `Failed to fetch video: ${videoResponse.status}` };
                }
                const videoBuffer = await videoResponse.arrayBuffer();
                videoBytes = new Uint8Array(videoBuffer);
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
                body: Buffer.from(videoBytes),
            });
            const uploadData = await uploadResponse.json();

            if (uploadData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: uploadData.error }, 'Facebook Story upload failed');
                return { success: false, error: uploadData.error.message, errorCode: uploadData.error.code?.toString() };
            }

            // Step 3: Finish the story (no video_url needed - video already uploaded)
            const finishResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: account.accessToken,
                    upload_phase: 'finish',
                    video_id: videoId,
                })
            });
            const finishData = await finishResponse.json();

            if (finishData.error) {
                logger.error({ platform: 'facebook', postType: 'story', error: finishData.error }, 'Facebook Story finish failed');
                return { success: false, error: finishData.error.message, errorCode: finishData.error.code?.toString() };
            }

            logger.info({ platform: 'facebook', postType: 'story', postId: finishData.post_id }, 'Facebook Story published');
            return { success: true, postId: finishData.post_id || videoId };
        } else {
            // Photo stories - handle local files vs remote URLs
            const endpoint = `https://graph.facebook.com/v24.0/${account.accountId}/photo_stories`;
            const uploadsIndex = mediaUrl.indexOf('/uploads/');
            const isLocal = uploadsIndex !== -1;

            if (isLocal) {
                // Local file: read from disk and upload as source
                const { readFileSync, existsSync } = await import('fs');
                const path = await import('path');

                const relativePath = mediaUrl.substring(uploadsIndex);
                const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
                const filePath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

                logger.debug({ platform: 'facebook', postType: 'story', filePath }, 'Reading local photo');

                if (!existsSync(filePath)) {
                    return { success: false, error: `Local photo not found: ${filePath}` };
                }

                const fileBuffer = readFileSync(filePath);
                const fileBlob = new Blob([fileBuffer], { type: 'image/jpeg' });

                const formData = new FormData();
                formData.append('access_token', account.accessToken);
                formData.append('source', fileBlob, path.basename(filePath));

                const response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.error) {
                    logger.error({ platform: 'facebook', postType: 'story', error: data.error }, 'Facebook Photo Story publish failed');
                    return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
                }

                return { success: true, postId: data.post_id || data.id };
            } else {
                // Remote URL: use photo_url parameter
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        access_token: account.accessToken,
                        photo_url: mediaUrl,
                    })
                });

                const data = await response.json();

                if (data.error) {
                    logger.error({ platform: 'facebook', postType: 'story', error: data.error }, 'Facebook Story publish failed');
                    return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
                }

                return { success: true, postId: data.post_id || data.id };
            }
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
    const endpoint = `https://graph.facebook.com/v24.0/${account.accountId}/video_reels`;
    const uploadsIndex = mediaUrl.indexOf('/uploads/');
    const isLocal = uploadsIndex !== -1;

    try {
        if (isLocal) {
            // Local file: Use 3-phase resumable upload (same as Video Stories)
            // Why: Facebook Video Reels require binary upload for local files

            // Step 1: Initialize upload
            const initResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: account.accessToken,
                    upload_phase: 'start',
                })
            });
            const initData = await initResponse.json();

            if (initData.error) {
                logger.error({ platform: 'facebook', postType: 'reel', error: initData.error }, 'Facebook Reel init failed');
                return { success: false, error: initData.error.message, errorCode: initData.error.code?.toString() };
            }

            const videoId = initData.video_id;
            const uploadUrl = initData.upload_url;

            if (!uploadUrl) {
                return { success: false, error: 'Missing upload URL from Facebook' };
            }

            // Step 2: Read local file and upload binary
            const { readFileSync, existsSync } = await import('fs');
            const path = await import('path');

            const relativePath = mediaUrl.substring(uploadsIndex);
            const safeUrl = relativePath.replace(/^\/uploads\/+/, '');
            const filePath = path.join(process.cwd(), 'public', 'uploads', safeUrl);

            if (!existsSync(filePath)) {
                return { success: false, error: `Local video not found: ${filePath}` };
            }

            const fileBuffer = readFileSync(filePath);
            const videoBytes = new Uint8Array(fileBuffer);

            logger.info({ platform: 'facebook', postType: 'reel', videoId, size: videoBytes.length }, 'Uploading Reel video binary');

            const uploadResponse = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `OAuth ${account.accessToken}`,
                    'offset': '0',
                    'file_size': videoBytes.length.toString(),
                    'Content-Type': 'application/octet-stream',
                },
                body: Buffer.from(videoBytes),
            });
            const uploadData = await uploadResponse.json();

            if (uploadData.error) {
                logger.error({ platform: 'facebook', postType: 'reel', error: uploadData.error }, 'Facebook Reel upload failed');
                return { success: false, error: uploadData.error.message, errorCode: uploadData.error.code?.toString() };
            }

            // Step 3: Finish and publish the reel
            // Why: video_state: 'PUBLISHED' is REQUIRED for the Reel to be visible
            // Without this, Reels are uploaded but remain as unpublished drafts
            const finishResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: account.accessToken,
                    upload_phase: 'finish',
                    video_id: videoId,
                    video_state: 'PUBLISHED',
                    description: payload.caption,
                })
            });
            const finishData = await finishResponse.json();

            if (finishData.error) {
                logger.error({ platform: 'facebook', postType: 'reel', error: finishData.error }, 'Facebook Reel finish failed');
                return { success: false, error: finishData.error.message, errorCode: finishData.error.code?.toString() };
            }

            logger.info({ platform: 'facebook', postType: 'reel', postId: finishData.id || videoId }, 'Facebook Reel published');
            return { success: true, postId: finishData.id || videoId };
        } else {
            // Remote URL: Use video_url parameter
            const body = {
                access_token: account.accessToken,
                video_url: mediaUrl,
                description: payload.caption,
            };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (data.error) {
                logger.error({ platform: 'facebook', postType: 'reel', error: data.error }, 'Facebook Reel publish failed');
                return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
            }

            return { success: true, postId: data.id };
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ platform: 'facebook', postType: 'reel', error: message }, 'Facebook Reel publish error');
        return { success: false, error: message };
    }
}
