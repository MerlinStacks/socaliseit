/**
 * Platform Publishing Orchestrator
 * Why: Routes publish requests to platform-specific handlers.
 */

import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';
import { publishToInstagram } from './instagram';
import { publishToFacebook } from './facebook';
import { publishToTikTok } from './tiktok';
import { publishToYouTube } from './youtube';
import { publishToPinterest } from './pinterest';
import { publishToLinkedIn } from './linkedin';
import { publishToBluesky } from './bluesky';
import { publishToGoogleBusiness } from './google-business';
import { publishToThreads } from './threads';
import { refreshAccessToken } from '../oauth';
import { getCredentialsForPlatform } from '../credentials';
import { refreshBlueskySession } from '@/lib/platform-api/bluesky-api';
import { isLocalUrl, resolveLocalFilePath } from '@/lib/platform-api/local-file';
import {
    getVideoMetadata,
    needsTranscoding,
    transcodeVideo,
    getPresetForPlatform,
    isFFmpegAvailable,
} from '@/lib/services/video-transcode';
import { db } from '../../db';
import { logger } from '../../logger';
import type { Platform } from '../../platform-config';
import path from 'path';

/**
 * Publish content to a platform.
 * Routes to platform-specific implementation based on account type.
 * Automatically refreshes expired tokens when possible.
 */
export async function publishToPlatform(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // Why: payload may be replaced by ensureOptimalVideoCodec with transcoded URLs
    let publishPayload = payload;
    // Check if token is expired and attempt refresh
    let currentToken = account.accessToken;
    let accountToUse = account;

    // Why (R2-04): If tokenExpiresAt is null (Bluesky, legacy records),
    // `new Date() > null` returns false — tokens would never refresh.
    // Treat missing expiry as "already expired" to trigger a refresh attempt.
    if (!account.tokenExpiresAt || new Date() > account.tokenExpiresAt) {
        logger.info({ platform: account.platform, accountId: account.id }, 'Token expired, attempting refresh');

        // Check if we have a refresh token
        if (!account.refreshToken) {
            logger.warn({ platform: account.platform }, 'No refresh token available');
            return {
                success: false,
                error: 'Access token expired and no refresh token available. Please reconnect your account.',
                errorCode: 'TOKEN_EXPIRED',
            };
        }

        try {
            if (account.platform === 'bluesky') {
                // Why: Bluesky uses AT Protocol session auth, not OAuth.
                // refreshJwt is stored in the refreshToken field.
                const result = await refreshBlueskySession(account.refreshToken);

                if (!result.success || !result.data) {
                    throw new Error(result.error || 'Bluesky session refresh failed');
                }

                await db.socialAccount.update({
                    where: { id: account.id },
                    data: {
                        accessToken: result.data.accessJwt,
                        refreshToken: result.data.refreshJwt || account.refreshToken,
                        tokenExpiry: new Date(Date.now() + 7200 * 1000), // AT Protocol JWTs ~2h
                    },
                });

                logger.info({ platform: 'bluesky' }, 'Bluesky session refresh successful');
                currentToken = result.data.accessJwt;
                accountToUse = { ...account, accessToken: currentToken };
            } else {
                // OAuth refresh for all other platforms
                // Why: Prisma stores Platform as uppercase enum (e.g. YOUTUBE),
                // but refreshAccessToken switch uses lowercase platform-config values.
                const normalizedPlatform = account.platform.toLowerCase() as Platform;
                const credentials = await getCredentialsForPlatform(normalizedPlatform) || undefined;

                const refreshed = await refreshAccessToken(
                    normalizedPlatform,
                    account.refreshToken,
                    credentials,
                );

                await db.socialAccount.update({
                    where: { id: account.id },
                    data: {
                        accessToken: refreshed.accessToken,
                        refreshToken: refreshed.refreshToken || account.refreshToken,
                        tokenExpiry: new Date(Date.now() + refreshed.expiresIn * 1000),
                    },
                });

                logger.info({ platform: account.platform }, 'Token refresh successful');
                currentToken = refreshed.accessToken;
                accountToUse = { ...account, accessToken: currentToken };
            }
        } catch (refreshError) {
            const errorMessage = refreshError instanceof Error ? refreshError.message : 'Unknown error';
            logger.error({ platform: account.platform, error: errorMessage }, 'Token refresh failed');

            return {
                success: false,
                error: `Token refresh failed: ${errorMessage}. Please reconnect your account.`,
                errorCode: 'TOKEN_REFRESH_FAILED',
            };
        }
    }

    // Pre-publish video codec check: auto-transcode non-H.264 videos
    // Why: Platforms (especially Facebook) produce significantly better quality
    // when given H.264 input. Other codecs (HEVC, VP9, AV1) get re-encoded
    // by Facebook's pipeline with much more aggressive compression.
    //
    // Optimization: If the video was already transcoded at upload-time
    // (transcodedUrl stored in Media record and used by publish-helpers),
    // the URL will point to /transcoded/ — skip the expensive probe+transcode.
    if (publishPayload.mediaType === 'video' && publishPayload.mediaUrls.length > 0) {
        const videoUrl = publishPayload.mediaUrls[0];
        const alreadyTranscoded = videoUrl.includes('/transcoded/');
        if (alreadyTranscoded) {
            logger.debug(
                { videoUrl },
                '[Codec Check] Video already transcoded at upload-time, skipping publish-time transcode',
            );
        } else {
            // Why: Fallback for legacy uploads that weren't pre-transcoded at upload-time
            const optimizedPayload = await ensureOptimalVideoCodec(accountToUse, publishPayload);
            if (optimizedPayload) {
                publishPayload = optimizedPayload;
            }
        }
    }

    // Platform-specific publishing logic
    switch (accountToUse.platform) {
        case 'instagram':
            return publishToInstagram(accountToUse, publishPayload);
        case 'tiktok':
            return publishToTikTok(accountToUse, publishPayload);
        case 'youtube':
            return publishToYouTube(accountToUse, publishPayload);
        case 'facebook':
            return publishToFacebook(accountToUse, publishPayload);
        case 'pinterest':
            return publishToPinterest(accountToUse, publishPayload);
        case 'linkedin':
            return publishToLinkedIn(accountToUse, publishPayload);
        case 'bluesky':
            return publishToBluesky(accountToUse, publishPayload);
        case 'threads':
            return publishToThreads(accountToUse, publishPayload);
        case 'google_business':
            return publishToGoogleBusiness(accountToUse, publishPayload);
        case 'manual':
            // Why: Manual platforms don't publish via API — the notification-reminder
            // worker sends a push notification at the scheduled time instead.
            return { success: true };
        default:
            return { success: false, error: 'Unsupported platform' };
    }
}

/**
 * Pre-publish video codec optimization.
 * 
 * Why: Social media platforms (Facebook, Instagram, TikTok) produce significantly
 * better visual quality when given H.264 (AVC) encoded input. Videos in other
 * codecs (HEVC/H.265, VP9, AV1, ProRes) get re-encoded server-side with more
 * aggressive compression, often resulting in pixelated output.
 * 
 * This function probes the first video's codec and, if it isn't H.264,
 * auto-transcodes it to the optimal format for the target platform.
 * Only processes local files (remote URLs can't be probed).
 */
const TRANSCODE_DIR = path.join(process.cwd(), 'public', 'uploads', 'transcoded');

/** Platforms that benefit from pre-publish H.264 transcoding */
const CODEC_CHECK_PLATFORMS = new Set([
    'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'threads',
]);

async function ensureOptimalVideoCodec(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishPayload | null> {
    // Only check platforms that benefit from H.264
    if (!CODEC_CHECK_PLATFORMS.has(account.platform)) {
        return null;
    }

    const videoUrl = payload.mediaUrls[0];

    // Only works for local files — we can't probe remote URLs
    if (!isLocalUrl(videoUrl)) {
        return null;
    }

    // Check FFmpeg availability (no-op if not installed)
    if (!(await isFFmpegAvailable())) {
        logger.debug('[Codec Check] FFmpeg not available, skipping codec optimization');
        return null;
    }

    const localPath = resolveLocalFilePath(videoUrl);
    const metadata = await getVideoMetadata(localPath);

    if (!metadata) {
        logger.debug({ videoUrl }, '[Codec Check] Could not read video metadata, skipping');
        return null;
    }

    // Determine the platform-specific preset
    const preset = getPresetForPlatform(account.platform, payload.postType);

    // Check if transcoding is needed (codec, dimensions, size, etc.)
    if (!needsTranscoding(metadata, preset)) {
        logger.debug(
            { codec: metadata.codec, platform: account.platform },
            '[Codec Check] Video already optimal, no transcoding needed',
        );
        return null;
    }

    // Transcode the video
    logger.info(
        { codec: metadata.codec, preset, platform: account.platform, width: metadata.width, height: metadata.height },
        '[Codec Check] Video needs optimization, transcoding to H.264',
    );

    const result = await transcodeVideo({
        inputPath: localPath,
        outputDir: TRANSCODE_DIR,
        preset,
    });

    if (!result.success || !result.outputUrl) {
        logger.warn(
            { error: result.error, preset },
            '[Codec Check] Transcoding failed, publishing original video',
        );
        return null;
    }

    logger.info(
        { originalCodec: metadata.codec, outputUrl: result.outputUrl, preset },
        '[Codec Check] Video transcoded successfully, using optimized version',
    );

    // Return updated payload with transcoded URL
    return {
        ...payload,
        mediaUrls: [result.outputUrl, ...payload.mediaUrls.slice(1)],
    };
}
