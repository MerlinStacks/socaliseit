/**
 * Audio Overlay Service - FFmpeg-based audio merge for videos
 * Why: Adds custom audio/music tracks to videos for Reels/TikTok engagement
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../logger';

const execAsync = promisify(exec);

interface AudioOverlayOptions {
    /** Volume of the overlay audio (0.0-1.0) */
    volume?: number;
    /** Fade in duration in seconds */
    fadeIn?: number;
    /** Fade out duration in seconds */
    fadeOut?: number;
    /** Loop audio to match video length */
    loop?: boolean;
    /** Keep original audio mixed in */
    keepOriginal?: boolean;
    /** Original audio volume when mixed (0.0-1.0) */
    originalVolume?: number;
}

interface OverlayResult {
    success: boolean;
    outputPath?: string;
    outputUrl?: string;
    error?: string;
}

/**
 * Check if FFmpeg is available
 */
async function isFFmpegAvailable(): Promise<boolean> {
    try {
        await execAsync('ffmpeg -version');
        return true;
    } catch {
        return false;
    }
}

/**
 * Overlay audio track onto video
 * @param videoPath - Path to input video
 * @param audioPath - Path to audio track
 * @param outputDir - Directory for output file
 * @param options - Overlay options
 */
export async function overlayAudio(
    videoPath: string,
    audioPath: string,
    outputDir: string,
    options: AudioOverlayOptions = {}
): Promise<OverlayResult> {
    const {
        volume = 0.8,
        fadeIn = 0,
        fadeOut = 0,
        loop = true,
        keepOriginal = false,
        originalVolume = 0.2,
    } = options;

    // Verify FFmpeg
    if (!(await isFFmpegAvailable())) {
        return { success: false, error: 'FFmpeg is not available' };
    }

    // Verify input files
    if (!existsSync(videoPath)) {
        return { success: false, error: 'Video file not found' };
    }
    if (!existsSync(audioPath)) {
        return { success: false, error: 'Audio file not found' };
    }

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
        await mkdir(outputDir, { recursive: true });
    }

    const outputFilename = `${randomUUID()}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);

    // Build filter complex
    const filters: string[] = [];

    // Audio input processing
    let audioFilter = `[1:a]volume=${volume}`;
    if (fadeIn > 0) {
        audioFilter += `,afade=t=in:st=0:d=${fadeIn}`;
    }
    if (fadeOut > 0) {
        // Fade out duration will be applied at the end
        audioFilter += `,afade=t=out:st=-${fadeOut}:d=${fadeOut}`;
    }
    audioFilter += '[overlay_audio]';
    filters.push(audioFilter);

    // Mix audio streams
    if (keepOriginal) {
        filters.push(`[0:a]volume=${originalVolume}[original]`);
        filters.push('[original][overlay_audio]amix=inputs=2:duration=first[final_audio]');
    } else {
        filters.push('[overlay_audio]anull[final_audio]');
    }

    // Build FFmpeg command
    const loopFlag = loop ? '-stream_loop -1' : '';
    const ffmpegCmd = [
        'ffmpeg',
        '-y', // Overwrite output
        `-i "${videoPath}"`, // Video input
        `${loopFlag} -i "${audioPath}"`, // Audio input (optionally looped)
        `-filter_complex "${filters.join(';')}"`,
        '-map 0:v', // Use video from first input
        '-map [final_audio]', // Use processed audio
        '-c:v copy', // Copy video stream (fast)
        '-c:a aac -b:a 128k', // Encode audio to AAC
        '-shortest', // End when shortest stream ends
        '-movflags +faststart',
        `"${outputPath}"`,
    ].join(' ');

    try {
        logger.info({ videoPath, audioPath }, 'Starting audio overlay');
        const startTime = Date.now();

        await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 50 });

        const elapsed = (Date.now() - startTime) / 1000;
        logger.info({ outputPath, elapsed }, 'Audio overlay completed');

        return {
            success: true,
            outputPath,
            outputUrl: `/api/uploads/processed/${outputFilename}`,
        };
    } catch (error) {
        logger.error({ error, videoPath, audioPath }, 'Audio overlay failed');
        // Clean up on failure
        if (existsSync(outputPath)) {
            try {
                await unlink(outputPath);
            } catch {
                // Ignore cleanup errors
            }
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Audio overlay failed',
        };
    }
}

/**
 * Remove audio from video (mute)
 */
export async function removeAudio(
    videoPath: string,
    outputDir: string
): Promise<OverlayResult> {
    if (!(await isFFmpegAvailable())) {
        return { success: false, error: 'FFmpeg is not available' };
    }

    if (!existsSync(videoPath)) {
        return { success: false, error: 'Video file not found' };
    }

    if (!existsSync(outputDir)) {
        await mkdir(outputDir, { recursive: true });
    }

    const outputFilename = `${randomUUID()}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);

    const ffmpegCmd = [
        'ffmpeg',
        '-y',
        `-i "${videoPath}"`,
        '-c:v copy',
        '-an', // Remove audio
        '-movflags +faststart',
        `"${outputPath}"`,
    ].join(' ');

    try {
        await execAsync(ffmpegCmd);
        return {
            success: true,
            outputPath,
            outputUrl: `/api/uploads/processed/${outputFilename}`,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to remove audio',
        };
    }
}
