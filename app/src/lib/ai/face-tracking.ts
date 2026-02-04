/**
 * Face Tracking Service
 * Auto-zoom on speaker faces in video.
 * 
 * Why: Face-centered framing increases engagement,
 * especially for talking-head content on vertical platforms.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TrackedFace {
    id: string;
    x: number;           // 0-1 normalized
    y: number;
    width: number;
    height: number;
    confidence: number;
    isSpeaker: boolean;
}

export interface FaceTrackingKeyframe {
    frame: number;
    time: number;
    faces: TrackedFace[];
    zoomRegion: ZoomRegion;
}

export interface ZoomRegion {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
}

export interface FaceTrackingConfig {
    fps: number;
    sampleInterval: number;      // Seconds between samples
    zoomLevel: number;           // 1.0-3.0, how much to zoom
    preferSpeaker: boolean;      // Focus on active speaker
    smoothing: number;           // 0-1, movement smoothing
}

export const DEFAULT_FACE_TRACKING_CONFIG: FaceTrackingConfig = {
    fps: 30,
    sampleInterval: 0.5,
    zoomLevel: 1.5,
    preferSpeaker: true,
    smoothing: 0.7,
};

// ============================================================================
// FACE DETECTION
// ============================================================================

/**
 * Detect faces in current video frame.
 */
export async function detectFacesInFrame(
    video: HTMLVideoElement
): Promise<TrackedFace[]> {
    if (!('FaceDetector' in window)) {
        return [];
    }

    try {
        // @ts-expect-error FaceDetector is experimental
        const detector = new window.FaceDetector({
            fastMode: true,
            maxDetectedFaces: 5,
        });

        const faces = await detector.detect(video);
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        return faces.map((face: { boundingBox: DOMRect }, index: number) => ({
            id: `face-${index}`,
            x: face.boundingBox.x / videoWidth,
            y: face.boundingBox.y / videoHeight,
            width: face.boundingBox.width / videoWidth,
            height: face.boundingBox.height / videoHeight,
            confidence: 0.9,
            isSpeaker: false, // Would need audio analysis to determine
        }));
    } catch {
        return [];
    }
}

/**
 * Estimate speaker based on face size and center position.
 * Larger, more centered faces are more likely to be the speaker.
 */
export function estimateSpeaker(faces: TrackedFace[]): TrackedFace | null {
    if (faces.length === 0) return null;
    if (faces.length === 1) return faces[0];

    // Score each face
    const scored = faces.map(face => {
        const size = face.width * face.height;
        const centerX = face.x + face.width / 2;
        const centerY = face.y + face.height / 2;

        // Distance from center of frame
        const centerDist = Math.sqrt(
            (centerX - 0.5) ** 2 + (centerY - 0.5) ** 2
        );

        // Score: larger faces and more centered = higher score
        const score = size * 100 + (1 - centerDist) * 50;
        return { face, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].face;
}

// ============================================================================
// ZOOM CALCULATION
// ============================================================================

/**
 * Calculate zoom region to focus on face(s).
 */
export function calculateZoomRegion(
    faces: TrackedFace[],
    config: FaceTrackingConfig
): ZoomRegion {
    if (faces.length === 0) {
        // No faces, center zoom
        return {
            x: 0.5 - (1 / config.zoomLevel) / 2,
            y: 0.5 - (1 / config.zoomLevel) / 2,
            width: 1 / config.zoomLevel,
            height: 1 / config.zoomLevel,
            scale: config.zoomLevel,
        };
    }

    // Find target face
    const targetFace = config.preferSpeaker
        ? estimateSpeaker(faces) || faces[0]
        : faces[0];

    // Calculate zoom to center on face with some headroom
    const faceCenterX = targetFace.x + targetFace.width / 2;
    const faceCenterY = targetFace.y + targetFace.height / 2;

    const zoomWidth = 1 / config.zoomLevel;
    const zoomHeight = 1 / config.zoomLevel;

    // Position zoom region with face in upper third (more natural framing)
    let x = faceCenterX - zoomWidth / 2;
    let y = faceCenterY - zoomHeight * 0.35; // Face in upper portion

    // Clamp to frame bounds
    x = Math.max(0, Math.min(1 - zoomWidth, x));
    y = Math.max(0, Math.min(1 - zoomHeight, y));

    return {
        x,
        y,
        width: zoomWidth,
        height: zoomHeight,
        scale: config.zoomLevel,
    };
}

/**
 * Smooth zoom transition between keyframes.
 */
export function smoothZoomRegion(
    current: ZoomRegion,
    target: ZoomRegion,
    smoothing: number
): ZoomRegion {
    const lerp = (a: number, b: number) => a + (b - a) * (1 - smoothing);

    return {
        x: lerp(current.x, target.x),
        y: lerp(current.y, target.y),
        width: lerp(current.width, target.width),
        height: lerp(current.height, target.height),
        scale: lerp(current.scale, target.scale),
    };
}

// ============================================================================
// KEYFRAME GENERATION
// ============================================================================

/**
 * Generate face tracking keyframes for video.
 */
export async function generateFaceTrackingKeyframes(
    video: HTMLVideoElement,
    config: FaceTrackingConfig = DEFAULT_FACE_TRACKING_CONFIG
): Promise<FaceTrackingKeyframe[]> {
    const duration = video.duration;
    const keyframes: FaceTrackingKeyframe[] = [];
    let previousZoom: ZoomRegion | null = null;

    for (let time = 0; time < duration; time += config.sampleInterval) {
        video.currentTime = time;

        // Wait for seek
        await new Promise<void>(resolve => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            video.addEventListener('seeked', onSeeked);
        });

        const faces = await detectFacesInFrame(video);
        let zoomRegion = calculateZoomRegion(faces, config);

        // Apply smoothing if we have previous keyframe
        if (previousZoom) {
            zoomRegion = smoothZoomRegion(previousZoom, zoomRegion, config.smoothing);
        }
        previousZoom = zoomRegion;

        keyframes.push({
            frame: Math.floor(time * config.fps),
            time,
            faces,
            zoomRegion,
        });
    }

    return keyframes;
}

// ============================================================================
// FFMPEG FILTER GENERATION
// ============================================================================

/**
 * Generate FFmpeg filter for face tracking zoom.
 */
export function generateFaceTrackingFilter(
    keyframes: FaceTrackingKeyframe[],
    sourceWidth: number,
    sourceHeight: number,
    outputWidth: number,
    outputHeight: number
): string {
    if (keyframes.length === 0) return '';

    // Use zoompan filter for animated zoom
    const firstKf = keyframes[0];

    // For static zoom (single keyframe)
    if (keyframes.length === 1) {
        const region = firstKf.zoomRegion;
        const cropW = Math.round(region.width * sourceWidth);
        const cropH = Math.round(region.height * sourceHeight);
        const cropX = Math.round(region.x * sourceWidth);
        const cropY = Math.round(region.y * sourceHeight);

        return `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${outputWidth}:${outputHeight}`;
    }

    // For animated zoom, build expression
    // This is a simplified version - full implementation would interpolate between keyframes
    const zoomExpr = keyframes.map((kf, i) => {
        const nextKf = keyframes[i + 1];
        if (!nextKf) return `${kf.zoomRegion.scale}`;
        return `if(between(on,${kf.frame},${nextKf.frame}),${kf.zoomRegion.scale},`;
    }).join('') + firstKf.zoomRegion.scale + ')'.repeat(keyframes.length - 1);

    const xExpr = keyframes.map((kf, i) => {
        const x = Math.round(kf.zoomRegion.x * sourceWidth);
        const nextKf = keyframes[i + 1];
        if (!nextKf) return `${x}`;
        return `if(between(on,${kf.frame},${nextKf.frame}),${x},`;
    }).join('') + Math.round(firstKf.zoomRegion.x * sourceWidth) + ')'.repeat(keyframes.length - 1);

    const yExpr = keyframes.map((kf, i) => {
        const y = Math.round(kf.zoomRegion.y * sourceHeight);
        const nextKf = keyframes[i + 1];
        if (!nextKf) return `${y}`;
        return `if(between(on,${kf.frame},${nextKf.frame}),${y},`;
    }).join('') + Math.round(firstKf.zoomRegion.y * sourceHeight) + ')'.repeat(keyframes.length - 1);

    return `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${outputWidth}x${outputHeight}`;
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Analyze video and generate face tracking data.
 */
export async function analyzeFaceTracking(
    video: HTMLVideoElement,
    config: FaceTrackingConfig = DEFAULT_FACE_TRACKING_CONFIG
): Promise<{
    keyframes: FaceTrackingKeyframe[];
    hasFaces: boolean;
    faceCount: number;
}> {
    const keyframes = await generateFaceTrackingKeyframes(video, config);

    // Count unique faces
    const faceCountPerFrame = keyframes.map(kf => kf.faces.length);
    const maxFaces = Math.max(...faceCountPerFrame, 0);
    const hasFaces = maxFaces > 0;

    return {
        keyframes,
        hasFaces,
        faceCount: maxFaces,
    };
}

/**
 * Preview zoom region as CSS transform.
 */
export function getZoomPreviewStyle(
    region: ZoomRegion
): React.CSSProperties {
    return {
        transformOrigin: `${(region.x + region.width / 2) * 100}% ${(region.y + region.height / 2) * 100}%`,
        transform: `scale(${region.scale})`,
    };
}
