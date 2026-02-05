/**
 * VideoTranscodeService - FFmpeg-based video transcoding for platform compliance
 * Why: Ensures videos meet platform-specific requirements (size, aspect ratio, format)
 * while preserving quality through intelligent encoding settings.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../logger';

const execAsync = promisify(exec);

/**
 * Parse FFmpeg frame rate string safely (e.g., "30/1" -> 30)
 * Why: Replaced eval() to prevent code injection and handle malformed input
 */
function parseFps(fpsStr: string): number {
    if (!fpsStr) return 30;
    const parts = fpsStr.split('/');
    if (parts.length === 2) {
        const num = parseFloat(parts[0]);
        const denom = parseFloat(parts[1]);
        if (!isNaN(num) && !isNaN(denom) && denom !== 0) {
            return num / denom;
        }
    }
    const parsed = parseFloat(fpsStr);
    return isNaN(parsed) ? 30 : parsed;
}


/**
 * Platform-specific video encoding presets
 * Why: Each platform has different requirements; presets ensure compliance
 */
export const TRANSCODE_PRESETS = {
    // Instagram Reels & TikTok (9:16 vertical video)
    REELS: {
        maxWidth: 1080,
        maxHeight: 1920,
        aspectRatio: '9:16',
        maxDurationSec: 90,
        maxSizeMB: 100,
        codec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '128k',
        fps: 30,
        crf: 23, // Quality: lower = better, 23 is good balance
    },
    // Instagram/Facebook Story (9:16 vertical)
    STORY: {
        maxWidth: 1080,
        maxHeight: 1920,
        aspectRatio: '9:16',
        maxDurationSec: 60,
        maxSizeMB: 100,
        codec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '128k',
        fps: 30,
        crf: 23,
    },
    // TikTok (9:16 vertical, larger file size allowed)
    TIKTOK: {
        maxWidth: 1080,
        maxHeight: 1920,
        aspectRatio: '9:16',
        maxDurationSec: 180,
        maxSizeMB: 287,
        codec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '128k',
        fps: 30,
        crf: 20, // Higher quality for TikTok
    },
    // YouTube Shorts (9:16 vertical)
    SHORTS: {
        maxWidth: 1080,
        maxHeight: 1920,
        aspectRatio: '9:16',
        maxDurationSec: 60,
        maxSizeMB: 500,
        codec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '192k',
        fps: 30,
        crf: 18, // Higher quality for YouTube
    },
    // Standard Feed Post (1:1 square or 4:5 portrait)
    FEED_SQUARE: {
        maxWidth: 1080,
        maxHeight: 1080,
        aspectRatio: '1:1',
        maxDurationSec: 60,
        maxSizeMB: 100,
        codec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '128k',
        fps: 30,
        crf: 23,
    },
    FEED_PORTRAIT: {
        maxWidth: 1080,
        maxHeight: 1350,
        aspectRatio: '4:5',
        maxDurationSec: 60,
        maxSizeMB: 100,
        codec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '128k',
        fps: 30,
        crf: 23,
    },
    // YouTube Long-form (16:9 landscape)
    YOUTUBE: {
        maxWidth: 1920,
        maxHeight: 1080,
        aspectRatio: '16:9',
        maxDurationSec: 43200, // 12 hours
        maxSizeMB: 12000,
        codec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '192k',
        fps: 30,
        crf: 18,
    },
    // LinkedIn Video
    LINKEDIN: {
        maxWidth: 1920,
        maxHeight: 1080,
        aspectRatio: '16:9',
        maxDurationSec: 600,
        maxSizeMB: 200,
        codec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '128k',
        fps: 30,
        crf: 23,
    },
} as const;

export type TranscodePreset = keyof typeof TRANSCODE_PRESETS;

interface VideoMetadata {
    width: number;
    height: number;
    duration: number;
    size: number; // bytes
    codec: string;
    fps: number;
}

interface TranscodeOptions {
    /** Input video file path */
    inputPath: string;
    /** Output directory (file will be named with UUID) */
    outputDir: string;
    /** Preset to use for transcoding */
    preset: TranscodePreset;
    /** Optional custom output filename */
    outputFilename?: string;
}

interface TranscodeResult {
    success: boolean;
    outputPath?: string;
    outputUrl?: string;
    metadata?: VideoMetadata;
    error?: string;
}

/**
 * Check if FFmpeg is available on the system
 */
export async function isFFmpegAvailable(): Promise<boolean> {
    try {
        await execAsync('ffmpeg -version');
        return true;
    } catch {
        return false;
    }
}

/**
 * Get video metadata using FFprobe
 */
export async function getVideoMetadata(inputPath: string): Promise<VideoMetadata | null> {
    try {
        const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`;
        const { stdout } = await execAsync(cmd);
        const data = JSON.parse(stdout);

        const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
        if (!videoStream) return null;

        const stats = statSync(inputPath);

        return {
            width: videoStream.width || 0,
            height: videoStream.height || 0,
            duration: parseFloat(data.format?.duration || videoStream.duration || '0'),
            size: stats.size,
            codec: videoStream.codec_name || 'unknown',
            fps: parseFps(videoStream.r_frame_rate || '30/1'), // e.g., "30/1" -> 30
        };
    } catch (error) {
        logger.error({ error, inputPath }, 'Failed to get video metadata');
        return null;
    }
}

/**
 * Check if video needs transcoding based on preset requirements
 */
export function needsTranscoding(metadata: VideoMetadata, preset: TranscodePreset): boolean {
    const specs = TRANSCODE_PRESETS[preset];

    // Check if any dimension exceeds limits
    if (metadata.width > specs.maxWidth || metadata.height > specs.maxHeight) {
        return true;
    }

    // Check file size
    const sizeMB = metadata.size / (1024 * 1024);
    if (sizeMB > specs.maxSizeMB) {
        return true;
    }

    // Check duration
    if (metadata.duration > specs.maxDurationSec) {
        return true;
    }

    // Check codec (we want H.264 for maximum compatibility)
    if (metadata.codec !== 'h264') {
        return true;
    }

    return false;
}

/**
 * Transcode a video according to platform preset
 */
export async function transcodeVideo(options: TranscodeOptions): Promise<TranscodeResult> {
    const { inputPath, outputDir, preset, outputFilename } = options;
    const specs = TRANSCODE_PRESETS[preset];

    // Verify FFmpeg is available
    if (!(await isFFmpegAvailable())) {
        return { success: false, error: 'FFmpeg is not available on this system' };
    }

    // Verify input file exists
    if (!existsSync(inputPath)) {
        return { success: false, error: 'Input file does not exist' };
    }

    // Get input metadata
    const inputMeta = await getVideoMetadata(inputPath);
    if (!inputMeta) {
        return { success: false, error: 'Failed to read video metadata' };
    }

    // Check if transcoding is needed
    if (!needsTranscoding(inputMeta, preset)) {
        logger.info({ inputPath, preset }, 'Video already meets preset requirements, skipping transcode');
        return {
            success: true,
            outputPath: inputPath,
            metadata: inputMeta,
        };
    }

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
        await mkdir(outputDir, { recursive: true });
    }

    // Generate output filename
    const filename = outputFilename || `${randomUUID()}.mp4`;
    const outputPath = path.join(outputDir, filename);

    // Build FFmpeg command
    const filterArgs: string[] = [];

    // Scale to fit within max dimensions while preserving aspect ratio
    filterArgs.push(`scale='min(${specs.maxWidth},iw)':min'(${specs.maxHeight},ih)':force_original_aspect_ratio=decrease`);

    // Pad to exact aspect ratio if needed
    const [aspectW, aspectH] = specs.aspectRatio.split(':').map(Number);
    filterArgs.push(`pad='if(gt(a\\,${aspectW}/${aspectH})\\,iw\\,ih*${aspectW}/${aspectH})':'if(gt(a\\,${aspectW}/${aspectH})\\,iw*${aspectH}/${aspectW}\\,ih)':(ow-iw)/2:(oh-ih)/2`);

    // Limit FPS
    filterArgs.push(`fps=${specs.fps}`);

    // Calculate target bitrate for file size limit
    // target_bitrate = (target_size_bits - audio_overhead) / duration
    const targetSizeBits = specs.maxSizeMB * 8 * 1024 * 1024 * 0.95; // 95% of max for safety
    const audioOverhead = (parseInt(specs.audioBitrate, 10) || 128) * 1000 * inputMeta.duration;
    const targetVideoBitrate = Math.floor((targetSizeBits - audioOverhead) / inputMeta.duration);
    const videoBitrate = Math.min(targetVideoBitrate, 8000000); // Cap at 8Mbps

    const ffmpegCmd = [
        'ffmpeg',
        '-y', // Overwrite output
        `-i "${inputPath}"`,
        `-c:v ${specs.codec}`,
        `-crf ${specs.crf}`,
        `-maxrate ${videoBitrate}`,
        `-bufsize ${videoBitrate * 2}`,
        `-c:a ${specs.audioCodec}`,
        `-b:a ${specs.audioBitrate}`,
        `-vf "${filterArgs.join(',')}"`,
        `-t ${Math.min(inputMeta.duration, specs.maxDurationSec)}`, // Limit duration
        '-movflags +faststart', // Web optimization
        '-preset medium',
        `"${outputPath}"`,
    ].join(' ');

    try {
        logger.info({ inputPath, outputPath, preset }, 'Starting video transcode');
        const startTime = Date.now();

        await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 50 }); // 50MB buffer

        const elapsed = (Date.now() - startTime) / 1000;
        logger.info({ outputPath, elapsed }, 'Video transcode completed');

        // Get output metadata
        const outputMeta = await getVideoMetadata(outputPath);

        return {
            success: true,
            outputPath,
            outputUrl: `/api/uploads/transcoded/${filename}`,
            metadata: outputMeta || undefined,
        };
    } catch (error) {
        logger.error({ error, inputPath, preset }, 'Video transcode failed');
        // Clean up partial output if it exists
        if (existsSync(outputPath)) {
            try {
                await unlink(outputPath);
            } catch {
                // Ignore cleanup errors
            }
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Transcode failed',
        };
    }
}

/**
 * Get recommended preset for a platform and post type
 */
export function getPresetForPlatform(platform: string, postType: string): TranscodePreset {
    const key = `${platform.toLowerCase()}_${postType.toLowerCase()}`;

    const presetMap: Record<string, TranscodePreset> = {
        'instagram_reel': 'REELS',
        'instagram_story': 'STORY',
        'instagram_feed': 'FEED_PORTRAIT',
        'facebook_reel': 'REELS',
        'facebook_story': 'STORY',
        'facebook_feed': 'FEED_PORTRAIT',
        'tiktok_feed': 'TIKTOK',
        'tiktok_reel': 'TIKTOK',
        'youtube_reel': 'SHORTS',
        'youtube_shorts': 'SHORTS',
        'youtube_video': 'YOUTUBE',
        'linkedin_video': 'LINKEDIN',
        'linkedin_feed': 'LINKEDIN',
    };

    return presetMap[key] || 'FEED_PORTRAIT';
}
