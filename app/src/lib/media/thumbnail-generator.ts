/**
 * Video Thumbnail Generation Utility
 * 
 * Shared module for generating video thumbnails using FFmpeg.
 * Used by both the upload API and the thumbnail regeneration worker.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

const execAsync = promisify(exec);

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * Generate a thumbnail from a video file using FFmpeg
 * 
 * Why memory-efficient flags are used:
 * - 4K HEVC videos can use >1GB RAM during decoding
 * - Docker containers typically have 512MB limits
 * - Scaling down before frame extraction prevents OOM kills
 * 
 * @param videoPath - Absolute path to the video file
 * @param thumbnailName - Name for the thumbnail file (without extension)
 * @returns Thumbnail URL path or null if generation fails
 */
export async function generateVideoThumbnail(
    videoPath: string,
    thumbnailName: string
): Promise<string | null> {
    try {
        // Check if FFmpeg is available
        const { stdout } = await execAsync('ffmpeg -version');
        logger.debug({ version: stdout.split('\n')[0] }, 'FFmpeg available');
    } catch (ffmpegError) {
        logger.warn({
            error: ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)
        }, 'FFmpeg not available, skipping thumbnail generation');
        return null;
    }

    const thumbnailFilename = `${thumbnailName}_thumb.jpg`;
    const thumbnailPath = path.join(UPLOAD_DIR, thumbnailFilename);

    // Memory-efficient FFmpeg flags for 4K/HEVC videos:
    // -threads 2: Limit thread count to reduce memory usage
    // -vf scale=...: Scale down large videos to prevent OOM
    // -an: Skip audio processing entirely
    const memFlags = '-threads 2 -an';
    const scaleFilter = '-vf "scale=\'min(1080,iw)\':-2"'; // Max 1080px width, maintain aspect

    const ffmpegCmd1 = `ffmpeg -y ${memFlags} -ss 1 -i "${videoPath}" -vframes 1 ${scaleFilter} -q:v 3 "${thumbnailPath}"`;
    const ffmpegCmd2 = `ffmpeg -y ${memFlags} -ss 0.1 -i "${videoPath}" -vframes 1 ${scaleFilter} -q:v 3 "${thumbnailPath}"`;

    try {
        // Extract a single frame at 1 second (or fallback to 0.1s for very short videos)
        logger.debug({ videoPath, thumbnailPath }, 'Generating video thumbnail');
        await execAsync(ffmpegCmd1);

        if (existsSync(thumbnailPath)) {
            logger.debug({ thumbnailPath }, 'Video thumbnail generated');
            return `/api/uploads/${thumbnailFilename}`;
        }
        logger.warn({ thumbnailPath }, 'Thumbnail file not created despite successful command');
    } catch (error) {
        logger.debug({
            error: error instanceof Error ? error.message : String(error),
            videoPath
        }, 'First thumbnail attempt failed, trying fallback');

        // Try earlier timestamp if 1s failed (video might be shorter)
        try {
            await execAsync(ffmpegCmd2);
            if (existsSync(thumbnailPath)) {
                logger.debug({ thumbnailPath }, 'Video thumbnail generated (fallback)');
                return `/api/uploads/${thumbnailFilename}`;
            }
        } catch (fallbackError) {
            logger.warn({
                error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                videoPath
            }, 'Video thumbnail generation failed on both attempts');
        }
    }

    return null;
}

/**
 * Get the upload directory path
 */
export function getUploadDir(): string {
    return UPLOAD_DIR;
}
