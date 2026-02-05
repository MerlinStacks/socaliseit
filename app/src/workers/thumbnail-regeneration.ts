/**
 * Thumbnail Regeneration Worker
 * 
 * Processes jobs to regenerate missing video thumbnails.
 * Runs as a scheduled job every 24 hours and can be triggered manually.
 */

import { Worker, Job } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateVideoThumbnail, getUploadDir } from '@/lib/media/thumbnail-generator';
import path from 'path';
import { existsSync } from 'fs';

export interface ThumbnailRegenerationJobData {
    /** If provided, only regenerate for this specific media ID */
    mediaId?: string;
    /** If true, skip videos where the source file is missing */
    skipMissing?: boolean;
}

/**
 * Process a single video for thumbnail regeneration
 */
async function regenerateThumbnailForVideo(media: {
    id: string;
    url: string;
    filename: string;
}): Promise<{ success: boolean; error?: string }> {
    const uploadDir = getUploadDir();

    // Extract filename from URL (e.g., /api/uploads/uuid.mp4 -> uuid.mp4)
    const videoFilename = path.basename(media.url);
    const videoPath = path.join(uploadDir, videoFilename);

    // Check if source video exists
    if (!existsSync(videoPath)) {
        return { success: false, error: 'Source video file not found' };
    }

    // Generate thumbnail using shared utility
    const baseName = videoFilename.replace(path.extname(videoFilename), '');
    const thumbnailUrl = await generateVideoThumbnail(videoPath, baseName);

    if (!thumbnailUrl) {
        return { success: false, error: 'FFmpeg failed to generate thumbnail' };
    }

    // Update database record
    await db.media.update({
        where: { id: media.id },
        data: { thumbnailUrl },
    });

    return { success: true };
}

/**
 * Process thumbnail regeneration job
 */
async function processThumbnailRegeneration(
    job: Job<ThumbnailRegenerationJobData>
): Promise<{ processed: number; succeeded: number; failed: number }> {
    const { mediaId, skipMissing = true } = job.data;

    logger.info({ mediaId, skipMissing }, 'Starting thumbnail regeneration job');

    // Build query for videos missing thumbnails
    const whereClause: Record<string, unknown> = {
        mimeType: { startsWith: 'video/' },
        thumbnailUrl: null,
    };

    if (mediaId) {
        whereClause.id = mediaId;
    }

    // Fetch videos missing thumbnails
    const videosWithoutThumbnails = await db.media.findMany({
        where: whereClause,
        select: {
            id: true,
            url: true,
            filename: true,
        },
        take: 100, // Process in batches to avoid memory issues
    });

    logger.info(
        { count: videosWithoutThumbnails.length },
        'Found videos missing thumbnails'
    );

    let succeeded = 0;
    let failed = 0;

    // Process each video sequentially to avoid overwhelming FFmpeg/memory
    for (const video of videosWithoutThumbnails) {
        try {
            const result = await regenerateThumbnailForVideo(video);

            if (result.success) {
                succeeded++;
                logger.info({ mediaId: video.id }, 'Thumbnail regenerated');
            } else {
                failed++;
                if (!skipMissing || result.error !== 'Source video file not found') {
                    logger.warn(
                        { mediaId: video.id, error: result.error },
                        'Failed to regenerate thumbnail'
                    );
                }
            }
        } catch (error) {
            failed++;
            logger.error(
                { mediaId: video.id, error },
                'Unexpected error during thumbnail regeneration'
            );
        }

        // Update job progress
        await job.updateProgress(
            Math.round(((succeeded + failed) / videosWithoutThumbnails.length) * 100)
        );
    }

    const result = {
        processed: videosWithoutThumbnails.length,
        succeeded,
        failed,
    };

    logger.info(result, 'Thumbnail regeneration job completed');
    return result;
}

/**
 * Create the thumbnail regeneration worker
 */
export function createThumbnailRegenerationWorker(): Worker<ThumbnailRegenerationJobData> {
    const worker = new Worker<ThumbnailRegenerationJobData>(
        'media-maintenance',
        processThumbnailRegeneration,
        {
            connection: getBullMQConnection(),
            concurrency: 1, // Process one job at a time to avoid memory issues
        }
    );

    worker.on('completed', (job, result) => {
        logger.info(
            { jobId: job.id, result },
            'Thumbnail regeneration job completed'
        );
    });

    worker.on('failed', (job, err) => {
        logger.error(
            { jobId: job?.id, error: err.message },
            'Thumbnail regeneration job failed'
        );
    });

    return worker;
}
