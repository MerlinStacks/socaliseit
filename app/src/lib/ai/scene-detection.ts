/**
 * Scene Detection Service
 * Analyzes video frames to detect scene changes and cut points.
 * 
 * Why: Automates identification of natural edit points in videos,
 * speeding up the editing workflow for content creators.
 * 
 * Uses frame differencing for client-side analysis.
 * Server-side FFmpeg integration available for production.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedScene {
    id: string;
    startTime: number;    // Seconds
    endTime: number;      // Seconds
    startFrame: number;
    endFrame: number;
    durationSeconds: number;
    confidence: number;   // 0-1 score indicating strength of scene boundary
    thumbnailTime: number; // Best frame for thumbnail (midpoint)
}

export interface SceneDetectionResult {
    scenes: DetectedScene[];
    totalDuration: number;
    analysisMethod: 'frame-diff' | 'ffmpeg' | 'histogram';
    processedFrames: number;
    detectionThreshold: number;
}

export interface SceneDetectionConfig {
    /** Sensitivity threshold (0.1-0.9). Lower = more scenes detected */
    sensitivity: number;
    /** Minimum scene duration in seconds */
    minSceneDuration: number;
    /** Frames per second of the video */
    fps: number;
    /** Sample rate - analyze every Nth frame for performance */
    sampleRate?: number;
}

export const DEFAULT_SCENE_CONFIG: SceneDetectionConfig = {
    sensitivity: 0.4,
    minSceneDuration: 1.0,
    fps: 30,
    sampleRate: 5, // Analyze every 5th frame
};

// ============================================================================
// CLIENT-SIDE SCENE DETECTION (Canvas Frame Differencing)
// ============================================================================

/**
 * Detect scenes in a video using frame differencing.
 * Compares consecutive frames to find significant visual changes.
 * 
 * @param videoUrl - URL to the video file
 * @param config - Detection configuration
 * @param onProgress - Optional progress callback (0-100)
 */
export async function detectScenesClient(
    videoUrl: string,
    config: SceneDetectionConfig = DEFAULT_SCENE_CONFIG,
    onProgress?: (progress: number) => void
): Promise<SceneDetectionResult> {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    // Load video
    await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
        video.src = videoUrl;
    });

    const duration = video.duration;
    const fps = config.fps;
    const sampleRate = config.sampleRate || 5;
    const totalFrames = Math.floor(duration * fps);
    const framesToAnalyze = Math.floor(totalFrames / sampleRate);

    // Create canvas for frame analysis
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');

    // Use smaller resolution for faster analysis
    const analysisWidth = 160;
    const analysisHeight = 90;
    canvas.width = analysisWidth;
    canvas.height = analysisHeight;

    // Collect frame differences
    const frameDiffs: Array<{ frame: number; time: number; diff: number }> = [];
    let prevImageData: ImageData | null = null;

    for (let i = 0; i < framesToAnalyze; i++) {
        const frameNum = i * sampleRate;
        const time = frameNum / fps;

        // Seek to frame
        video.currentTime = time;
        await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
        });

        // Draw frame to canvas
        ctx.drawImage(video, 0, 0, analysisWidth, analysisHeight);
        const imageData = ctx.getImageData(0, 0, analysisWidth, analysisHeight);

        if (prevImageData) {
            const diff = calculateFrameDifference(prevImageData, imageData);
            frameDiffs.push({ frame: frameNum, time, diff });
        }

        prevImageData = imageData;

        // Report progress
        if (onProgress) {
            onProgress(Math.round((i / framesToAnalyze) * 100));
        }
    }

    // Detect scene boundaries from frame differences
    const scenes = detectSceneBoundaries(frameDiffs, config, duration, fps);

    return {
        scenes,
        totalDuration: duration,
        analysisMethod: 'frame-diff',
        processedFrames: framesToAnalyze,
        detectionThreshold: config.sensitivity,
    };
}

/**
 * Calculate the difference between two frames using pixel comparison.
 * Returns a normalized difference score (0-1).
 */
function calculateFrameDifference(prev: ImageData, curr: ImageData): number {
    const pixels = prev.data.length / 4;
    let totalDiff = 0;

    for (let i = 0; i < prev.data.length; i += 4) {
        // Compare RGB channels (skip alpha)
        const rDiff = Math.abs(prev.data[i] - curr.data[i]);
        const gDiff = Math.abs(prev.data[i + 1] - curr.data[i + 1]);
        const bDiff = Math.abs(prev.data[i + 2] - curr.data[i + 2]);

        totalDiff += (rDiff + gDiff + bDiff) / 3;
    }

    // Normalize to 0-1 range
    return totalDiff / (pixels * 255);
}

/**
 * Analyze frame differences to identify scene boundaries.
 */
function detectSceneBoundaries(
    frameDiffs: Array<{ frame: number; time: number; diff: number }>,
    config: SceneDetectionConfig,
    totalDuration: number,
    fps: number
): DetectedScene[] {
    if (frameDiffs.length === 0) {
        // Return single scene for entire video
        return [{
            id: 'scene-0',
            startTime: 0,
            endTime: totalDuration,
            startFrame: 0,
            endFrame: Math.floor(totalDuration * fps),
            durationSeconds: totalDuration,
            confidence: 1.0,
            thumbnailTime: totalDuration / 2,
        }];
    }

    // Calculate dynamic threshold based on sensitivity and content
    const sortedDiffs = [...frameDiffs].sort((a, b) => a.diff - b.diff);
    const medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)].diff;
    const maxDiff = sortedDiffs[sortedDiffs.length - 1].diff;

    // Higher sensitivity = lower threshold = more scenes detected
    // sensitivity of 0.5 means threshold at median + half way to max
    const threshold = medianDiff + (maxDiff - medianDiff) * (1 - config.sensitivity);

    // Find peaks above threshold
    const sceneChanges: Array<{ frame: number; time: number; confidence: number }> = [];
    const minFrameGap = Math.floor(config.minSceneDuration * fps);

    for (let i = 1; i < frameDiffs.length - 1; i++) {
        const curr = frameDiffs[i];
        const prev = frameDiffs[i - 1];
        const next = frameDiffs[i + 1];

        // Is this a local peak above threshold?
        if (curr.diff > threshold && curr.diff >= prev.diff && curr.diff >= next.diff) {
            // Check minimum gap from last scene change
            const lastChange = sceneChanges[sceneChanges.length - 1];
            if (!lastChange || (curr.frame - lastChange.frame) >= minFrameGap) {
                sceneChanges.push({
                    frame: curr.frame,
                    time: curr.time,
                    confidence: Math.min(1, curr.diff / maxDiff),
                });
            }
        }
    }

    // Convert scene changes to scene segments
    const scenes: DetectedScene[] = [];
    let sceneStart = 0;

    for (let i = 0; i < sceneChanges.length; i++) {
        const change = sceneChanges[i];
        const sceneEnd = change.time;
        const sceneEndFrame = change.frame;

        // Only add scene if it meets minimum duration
        if (sceneEnd - sceneStart >= config.minSceneDuration) {
            scenes.push({
                id: `scene-${scenes.length}`,
                startTime: sceneStart,
                endTime: sceneEnd,
                startFrame: Math.floor(sceneStart * fps),
                endFrame: sceneEndFrame,
                durationSeconds: sceneEnd - sceneStart,
                confidence: change.confidence,
                thumbnailTime: sceneStart + (sceneEnd - sceneStart) / 2,
            });
        }

        sceneStart = sceneEnd;
    }

    // Add final scene
    if (totalDuration - sceneStart >= config.minSceneDuration) {
        scenes.push({
            id: `scene-${scenes.length}`,
            startTime: sceneStart,
            endTime: totalDuration,
            startFrame: Math.floor(sceneStart * fps),
            endFrame: Math.floor(totalDuration * fps),
            durationSeconds: totalDuration - sceneStart,
            confidence: 1.0,
            thumbnailTime: sceneStart + (totalDuration - sceneStart) / 2,
        });
    }

    return scenes;
}

// ============================================================================
// SERVER-SIDE FFmpeg DETECTION (API Route)
// ============================================================================

/**
 * Call server-side scene detection API.
 * Uses FFmpeg for more accurate detection in production.
 */
export async function detectScenesServer(
    videoUrl: string,
    config: SceneDetectionConfig = DEFAULT_SCENE_CONFIG
): Promise<SceneDetectionResult> {
    const response = await fetch('/api/video/scene-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            videoUrl,
            sensitivity: config.sensitivity,
            minSceneDuration: config.minSceneDuration,
            fps: config.fps,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Scene detection failed');
    }

    return response.json();
}

// ============================================================================
// HYBRID DETECTION (Auto-select best method)
// ============================================================================

/**
 * Detect scenes using the best available method.
 * Tries server-side first, falls back to client-side.
 */
export async function detectScenes(
    videoUrl: string,
    config: SceneDetectionConfig = DEFAULT_SCENE_CONFIG,
    onProgress?: (progress: number) => void
): Promise<SceneDetectionResult> {
    try {
        // Try server-side first (more accurate, uses FFmpeg)
        return await detectScenesServer(videoUrl, config);
    } catch {
        // Fall back to client-side frame differencing
        return await detectScenesClient(videoUrl, config, onProgress);
    }
}
