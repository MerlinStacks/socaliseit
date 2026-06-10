/**
 * Video Transcode Worker
 *
 * Processes async H.264 transcoding jobs enqueued at media upload time.
 * Reports progress to Redis so clients can poll for real-time updates.
 */

import { Worker, Job } from 'bullmq';
import { getBullMQConnection, getRedisConnection } from '@/lib/bullmq/connection';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { transcodeVideoWithProgress } from '@/lib/services/video-transcode';
import type { VideoTranscodeJobData } from '@/lib/bullmq/queues';
import type { TranscodePreset } from '@/lib/services/video-transcode';

/**
 * Process a single video transcode job
 */
async function processVideoTranscode(
    job: Job<VideoTranscodeJobData>,
): Promise<{ success: boolean; transcodedUrl?: string }> {
    const { mediaId, inputPath, outputDir, preset, duration, forceTranscode } = job.data;
    const redis = getRedisConnection();

    logger.info({ mediaId, preset, jobId: job.id }, 'Starting video transcode job');

    // Update status to processing
    await db.media.update({
        where: { id: mediaId },
        data: { transcodeStatus: 'processing' },
    });

    // Run FFmpeg with progress reporting
    const result = await transcodeVideoWithProgress(
        {
            inputPath,
            outputDir,
            preset: preset as TranscodePreset,
            mediaId,
            duration,
            forceTranscode,
        },
        redis,
    );

    const redisKey = `transcode:progress:${mediaId}`;

    if (result.success && result.outputUrl) {
        // Update DB with transcoded URL and completed status
        await db.media.update({
            where: { id: mediaId },
            data: {
                transcodedUrl: result.outputUrl,
                transcodeStatus: 'completed',
            },
        });

        // Clean up Redis progress key
        await redis.del(redisKey).catch(() => {});

        logger.info(
            { mediaId, transcodedUrl: result.outputUrl, jobId: job.id },
            'Video transcode job completed successfully',
        );

        return { success: true, transcodedUrl: result.outputUrl };
    } else if (result.success && result.outputPath && !result.outputUrl) {
        // Video didn't need transcoding (already compliant)
        await db.media.update({
            where: { id: mediaId },
            data: { transcodeStatus: null },
        });

        await redis.del(redisKey).catch(() => {});

        logger.info(
            { mediaId, jobId: job.id },
            'Video already meets requirements, no transcode needed',
        );

        return { success: true };
    } else {
        // Transcode failed -- mark as failed, original video remains usable
        await db.media.update({
            where: { id: mediaId },
            data: { transcodeStatus: 'failed' },
        });

        await redis.del(redisKey).catch(() => {});

        logger.error(
            { mediaId, error: result.error, jobId: job.id },
            'Video transcode job failed',
        );

        // Throw so BullMQ can retry
        throw new Error(result.error || 'Transcode failed');
    }
}

/**
 * Create the video transcode worker
 */
export function createVideoTranscodeWorker(): Worker<VideoTranscodeJobData> {
    const worker = new Worker<VideoTranscodeJobData>(
        'video-transcode',
        processVideoTranscode,
        {
            connection: getBullMQConnection(),
            concurrency: 1, // One transcode at a time to avoid CPU/memory contention
        },
    );

    worker.on('completed', (job, result) => {
        logger.info(
            { jobId: job.id, mediaId: job.data.mediaId, result },
            'Video transcode worker job completed',
        );
    });

    worker.on('failed', (job, err) => {
        logger.error(
            { jobId: job?.id, mediaId: job?.data.mediaId, error: err.message },
            'Video transcode worker job failed',
        );
    });

    return worker;
}
