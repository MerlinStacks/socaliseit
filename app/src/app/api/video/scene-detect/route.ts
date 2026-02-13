/**
 * Scene Detection API
 * Server-side video scene change detection.
 * 
 * Why: Offloads heavy video processing to the server,
 * enabling FFmpeg-based detection for production use.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { validateExternalUrl } from '@/lib/validate-url';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeError } from '@/lib/sanitize-error';

const execFileAsync = promisify(execFile);

// ============================================================================
// TYPES
// ============================================================================

interface SceneDetectRequest {
    videoUrl?: string;
    sensitivity?: number;
    minSceneDuration?: number;
    fps?: number;
}

interface DetectedScene {
    id: string;
    startTime: number;
    endTime: number;
    startFrame: number;
    endFrame: number;
    durationSeconds: number;
    confidence: number;
    thumbnailTime: number;
}

// ============================================================================
// HELPERS
// ============================================================================

const TEMP_DIR = '/tmp/scene-detect';

/**
 * Check if FFmpeg is available on the system
 */
async function isFFmpegAvailable(): Promise<boolean> {
    try {
        await execFileAsync('ffmpeg', ['-version']);
        return true;
    } catch {
        return false;
    }
}

/**
 * Download video to temp file for FFmpeg processing
 */
async function downloadVideo(url: string): Promise<string> {
    // Ensure temp directory exists
    if (!existsSync(TEMP_DIR)) {
        await mkdir(TEMP_DIR, { recursive: true });
    }

    const filename = `${randomUUID()}.mp4`;
    const filepath = join(TEMP_DIR, filename);

    // URL is already validated by caller via validateExternalUrl()
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(filepath, buffer);

    return filepath;
}

/**
 * Get video duration using FFprobe
 */
async function getVideoDuration(filepath: string): Promise<number> {
    // Use execFile with args array to prevent shell injection
    const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filepath,
    ]);
    return parseFloat(stdout.trim());
}

/**
 * Detect scenes using FFmpeg scene filter
 */
async function detectWithFFmpeg(
    filepath: string,
    sensitivity: number,
    fps: number
): Promise<Array<{ time: number; score: number }>> {
    // FFmpeg scene filter threshold (inverted from sensitivity)
    // sensitivity 0.9 = threshold 0.1 (detect more scenes)
    // sensitivity 0.1 = threshold 0.9 (detect fewer scenes)
    const threshold = 1 - sensitivity;

    try {
        // Use execFile with args array to prevent shell injection
        // Why: exec() interpolates into a shell string, execFile() passes args directly
        const { stdout, stderr } = await execFileAsync('ffmpeg', [
            '-i', filepath,
            '-vf', `select='gt(scene,${threshold})',showinfo`,
            '-f', 'null',
            '-',
        ]);

        // FFmpeg writes filter output to stderr, not stdout
        const output = stderr || stdout;

        // Parse FFmpeg output for scene changes
        const sceneChanges: Array<{ time: number; score: number }> = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // Look for Parsed_showinfo lines with pts_time
            const match = line.match(/pts_time:(\d+\.?\d*)/);
            if (match) {
                const time = parseFloat(match[1]);
                // Extract scene score if available
                const scoreMatch = line.match(/scene:(\d+\.?\d*)/);
                const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
                sceneChanges.push({ time, score });
            }
        }

        return sceneChanges;
    } catch (error) {
        logger.error({ error }, 'FFmpeg scene detection failed');
        return [];
    }
}

// ============================================================================
// POST - Detect scenes in video
// ============================================================================

export async function POST(request: NextRequest) {
    let tempFilePath: string | null = null;

    try {
        // Auth check — this endpoint was previously unprotected
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Rate limit: 5 requests per minute for expensive video processing
        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:scene-detect`, EXPENSIVE_RATE_LIMIT
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
            );
        }

        const body = await request.json() as SceneDetectRequest;

        const {
            videoUrl,
            sensitivity = 0.4,
            minSceneDuration = 1.0,
            fps = 30,
        } = body;

        if (!videoUrl) {
            return NextResponse.json(
                { error: 'videoUrl is required' },
                { status: 400 }
            );
        }

        // SSRF protection: validate URL before downloading
        const urlCheck = await validateExternalUrl(videoUrl);
        if (!urlCheck.valid) {
            return NextResponse.json(
                { error: `Invalid URL: ${urlCheck.reason}` },
                { status: 400 }
            );
        }

        // Check if FFmpeg is available
        const ffmpegAvailable = await isFFmpegAvailable();

        if (!ffmpegAvailable) {
            // Return response indicating client should use fallback
            return NextResponse.json(
                {
                    error: 'FFmpeg not available',
                    fallback: true,
                    message: 'Use client-side detection'
                },
                { status: 503 }
            );
        }

        // Download video to temp file
        tempFilePath = await downloadVideo(videoUrl);

        // Get video duration
        const duration = await getVideoDuration(tempFilePath);

        // Detect scenes
        const sceneChanges = await detectWithFFmpeg(tempFilePath, sensitivity, fps);

        // Convert to scene segments
        const scenes: DetectedScene[] = [];
        let sceneStart = 0;

        for (let i = 0; i < sceneChanges.length; i++) {
            const change = sceneChanges[i];
            const sceneEnd = change.time;

            // Only add scene if it meets minimum duration
            if (sceneEnd - sceneStart >= minSceneDuration) {
                scenes.push({
                    id: `scene-${scenes.length}`,
                    startTime: sceneStart,
                    endTime: sceneEnd,
                    startFrame: Math.floor(sceneStart * fps),
                    endFrame: Math.floor(sceneEnd * fps),
                    durationSeconds: sceneEnd - sceneStart,
                    confidence: change.score,
                    thumbnailTime: sceneStart + (sceneEnd - sceneStart) / 2,
                });
            }

            sceneStart = sceneEnd;
        }

        // Add final scene
        if (duration - sceneStart >= minSceneDuration) {
            scenes.push({
                id: `scene-${scenes.length}`,
                startTime: sceneStart,
                endTime: duration,
                startFrame: Math.floor(sceneStart * fps),
                endFrame: Math.floor(duration * fps),
                durationSeconds: duration - sceneStart,
                confidence: 1.0,
                thumbnailTime: sceneStart + (duration - sceneStart) / 2,
            });
        }

        // If no scenes detected, return entire video as one scene
        if (scenes.length === 0) {
            scenes.push({
                id: 'scene-0',
                startTime: 0,
                endTime: duration,
                startFrame: 0,
                endFrame: Math.floor(duration * fps),
                durationSeconds: duration,
                confidence: 1.0,
                thumbnailTime: duration / 2,
            });
        }

        logger.info({
            scenesDetected: scenes.length,
            duration,
            sensitivity,
        }, '[SceneDetect] Analysis complete');

        return NextResponse.json({
            scenes,
            totalDuration: duration,
            analysisMethod: 'ffmpeg',
            processedFrames: Math.floor(duration * fps),
            detectionThreshold: sensitivity,
        });

    } catch (error) {
        logger.error({ error }, '[SceneDetect] Error');

        return NextResponse.json(
            {
                error: sanitizeError(error, 'Scene detection failed'),
                fallback: true,
            },
            { status: 500 }
        );
    } finally {
        // Clean up temp file
        if (tempFilePath) {
            try {
                await unlink(tempFilePath);
            } catch {
                // Ignore cleanup errors
            }
        }
    }
}
