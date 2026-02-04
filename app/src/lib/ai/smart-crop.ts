/**
 * Smart Crop Service
 * Subject-centered auto-framing for aspect ratio conversion.
 * 
 * Why: Enables automatic letterbox conversion while keeping
 * the subject centered, essential for 16:9 ↔ 9:16 repurposing.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AspectRatio {
    id: string;
    name: string;
    width: number;
    height: number;
    platforms: string[];
}

export interface CropRegion {
    x: number;          // 0-1 normalized
    y: number;          // 0-1 normalized
    width: number;      // 0-1 normalized
    height: number;     // 0-1 normalized
}

export interface FaceDetection {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
}

export interface SmartCropConfig {
    targetAspectRatio: string;
    trackSubject: boolean;
    manualFocusPoint?: { x: number; y: number };
}

export interface SmartCropResult {
    cropRegion: CropRegion;
    keyframes?: Array<{ frame: number; region: CropRegion }>;
    ffmpegFilter: string;
}

// ============================================================================
// ASPECT RATIOS
// ============================================================================

export const ASPECT_RATIOS: AspectRatio[] = [
    {
        id: '16:9',
        name: 'Landscape (16:9)',
        width: 16,
        height: 9,
        platforms: ['YouTube', 'Twitter', 'LinkedIn'],
    },
    {
        id: '9:16',
        name: 'Portrait (9:16)',
        width: 9,
        height: 16,
        platforms: ['TikTok', 'Reels', 'Shorts', 'Stories'],
    },
    {
        id: '1:1',
        name: 'Square (1:1)',
        width: 1,
        height: 1,
        platforms: ['Instagram Feed', 'Facebook'],
    },
    {
        id: '4:5',
        name: 'Portrait (4:5)',
        width: 4,
        height: 5,
        platforms: ['Instagram Feed'],
    },
    {
        id: '4:3',
        name: 'Standard (4:3)',
        width: 4,
        height: 3,
        platforms: ['Facebook'],
    },
];

// ============================================================================
// FACE DETECTION
// ============================================================================

/**
 * Detect faces in video frame using browser FaceDetector API.
 * Falls back to center if not supported.
 */
export async function detectFaces(
    videoElement: HTMLVideoElement
): Promise<FaceDetection[]> {
    // Check for FaceDetector API support
    if (!('FaceDetector' in window)) {
        return [];
    }

    try {
        // @ts-expect-error FaceDetector is experimental
        const detector = new window.FaceDetector({ fastMode: true });
        const faces = await detector.detect(videoElement);

        const videoWidth = videoElement.videoWidth;
        const videoHeight = videoElement.videoHeight;

        return faces.map((face: { boundingBox: DOMRect }) => ({
            x: face.boundingBox.x / videoWidth,
            y: face.boundingBox.y / videoHeight,
            width: face.boundingBox.width / videoWidth,
            height: face.boundingBox.height / videoHeight,
            confidence: 0.9,
        }));
    } catch {
        return [];
    }
}

/**
 * Calculate center of mass from detected faces.
 */
export function calculateFocusPoint(
    faces: FaceDetection[]
): { x: number; y: number } {
    if (faces.length === 0) {
        return { x: 0.5, y: 0.5 };
    }

    // Weight by face size (larger faces get more weight)
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (const face of faces) {
        const weight = face.width * face.height * face.confidence;
        weightedX += (face.x + face.width / 2) * weight;
        weightedY += (face.y + face.height / 2) * weight;
        totalWeight += weight;
    }

    return {
        x: weightedX / totalWeight,
        y: weightedY / totalWeight,
    };
}

// ============================================================================
// CROP CALCULATION
// ============================================================================

/**
 * Calculate crop region for target aspect ratio.
 */
export function calculateCropRegion(
    sourceWidth: number,
    sourceHeight: number,
    targetRatio: AspectRatio,
    focusPoint: { x: number; y: number } = { x: 0.5, y: 0.5 }
): CropRegion {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatioValue = targetRatio.width / targetRatio.height;

    let cropWidth: number;
    let cropHeight: number;

    if (sourceRatio > targetRatioValue) {
        // Source is wider, crop sides
        cropHeight = 1;
        cropWidth = targetRatioValue / sourceRatio;
    } else {
        // Source is taller, crop top/bottom
        cropWidth = 1;
        cropHeight = sourceRatio / targetRatioValue;
    }

    // Position crop around focus point
    let x = focusPoint.x - cropWidth / 2;
    let y = focusPoint.y - cropHeight / 2;

    // Clamp to valid range
    x = Math.max(0, Math.min(1 - cropWidth, x));
    y = Math.max(0, Math.min(1 - cropHeight, y));

    return { x, y, width: cropWidth, height: cropHeight };
}

/**
 * Generate keyframes for subject tracking.
 */
export async function generateTrackingKeyframes(
    videoElement: HTMLVideoElement,
    targetRatio: AspectRatio,
    fps: number,
    sampleInterval: number = 1 // seconds
): Promise<Array<{ frame: number; region: CropRegion }>> {
    const duration = videoElement.duration;
    const keyframes: Array<{ frame: number; region: CropRegion }> = [];

    const sourceWidth = videoElement.videoWidth;
    const sourceHeight = videoElement.videoHeight;

    for (let time = 0; time < duration; time += sampleInterval) {
        videoElement.currentTime = time;

        // Wait for seek to complete
        await new Promise<void>(resolve => {
            const onSeeked = () => {
                videoElement.removeEventListener('seeked', onSeeked);
                resolve();
            };
            videoElement.addEventListener('seeked', onSeeked);
        });

        const faces = await detectFaces(videoElement);
        const focusPoint = calculateFocusPoint(faces);
        const region = calculateCropRegion(sourceWidth, sourceHeight, targetRatio, focusPoint);

        keyframes.push({
            frame: Math.floor(time * fps),
            region,
        });
    }

    return keyframes;
}

// ============================================================================
// FFMPEG FILTER GENERATION
// ============================================================================

/**
 * Generate FFmpeg crop filter.
 */
export function generateFFmpegCropFilter(
    sourceWidth: number,
    sourceHeight: number,
    region: CropRegion
): string {
    const cropW = Math.round(region.width * sourceWidth);
    const cropH = Math.round(region.height * sourceHeight);
    const cropX = Math.round(region.x * sourceWidth);
    const cropY = Math.round(region.y * sourceHeight);

    return `crop=${cropW}:${cropH}:${cropX}:${cropY}`;
}

/**
 * Generate FFmpeg filter with keyframe tracking.
 */
export function generateKeyframedCropFilter(
    sourceWidth: number,
    sourceHeight: number,
    keyframes: Array<{ frame: number; region: CropRegion }>,
    fps: number
): string {
    if (keyframes.length === 0) {
        return '';
    }

    if (keyframes.length === 1) {
        return generateFFmpegCropFilter(sourceWidth, sourceHeight, keyframes[0].region);
    }

    // For animated crops, use zoompan filter
    const firstRegion = keyframes[0].region;
    const cropW = Math.round(firstRegion.width * sourceWidth);
    const cropH = Math.round(firstRegion.height * sourceHeight);

    // Generate x/y expressions that interpolate between keyframes
    const xExpr = keyframes.map((kf, i) => {
        const x = Math.round(kf.region.x * sourceWidth);
        const startFrame = kf.frame;
        const endFrame = keyframes[i + 1]?.frame || kf.frame + fps;
        return `if(between(n,${startFrame},${endFrame}),${x},`;
    }).join('') + keyframes[0].region.x * sourceWidth + ')'.repeat(keyframes.length);

    const yExpr = keyframes.map((kf, i) => {
        const y = Math.round(kf.region.y * sourceHeight);
        const startFrame = kf.frame;
        const endFrame = keyframes[i + 1]?.frame || kf.frame + fps;
        return `if(between(n,${startFrame},${endFrame}),${y},`;
    }).join('') + keyframes[0].region.y * sourceHeight + ')'.repeat(keyframes.length);

    return `crop=${cropW}:${cropH}:${xExpr}:${yExpr}`;
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Calculate smart crop for video.
 */
export async function calculateSmartCrop(
    videoElement: HTMLVideoElement | null,
    config: SmartCropConfig
): Promise<SmartCropResult> {
    const targetRatio = ASPECT_RATIOS.find(r => r.id === config.targetAspectRatio)
        || ASPECT_RATIOS[0];

    // Default dimensions if no video
    const sourceWidth = videoElement?.videoWidth || 1920;
    const sourceHeight = videoElement?.videoHeight || 1080;

    let focusPoint = config.manualFocusPoint || { x: 0.5, y: 0.5 };

    // Detect faces if tracking enabled and video available
    if (config.trackSubject && videoElement) {
        const faces = await detectFaces(videoElement);
        if (faces.length > 0) {
            focusPoint = calculateFocusPoint(faces);
        }
    }

    const cropRegion = calculateCropRegion(sourceWidth, sourceHeight, targetRatio, focusPoint);

    // Generate keyframes if tracking
    let keyframes: Array<{ frame: number; region: CropRegion }> | undefined;
    if (config.trackSubject && videoElement) {
        keyframes = await generateTrackingKeyframes(videoElement, targetRatio, 30);
    }

    const ffmpegFilter = keyframes && keyframes.length > 1
        ? generateKeyframedCropFilter(sourceWidth, sourceHeight, keyframes, 30)
        : generateFFmpegCropFilter(sourceWidth, sourceHeight, cropRegion);

    return {
        cropRegion,
        keyframes,
        ffmpegFilter,
    };
}

/**
 * Get all available aspect ratios.
 */
export function getAspectRatios(): AspectRatio[] {
    return ASPECT_RATIOS;
}
