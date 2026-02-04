/**
 * Thumbnail Generator Service
 * Extract and score optimal thumbnail frames from video.
 * 
 * Why: Thumbnails are the #1 factor in video click-through rate.
 * AI-scored frame extraction helps creators pick winning thumbnails.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ThumbnailCandidate {
    id: string;
    frame: number;
    time: number;
    score: number;
    dataUrl: string;
    signals: ThumbnailSignals;
}

export interface ThumbnailSignals {
    hasFace: boolean;
    faceSize: number;          // 0-1, relative to frame
    sharpness: number;         // 0-1
    colorfulness: number;      // 0-1
    composition: number;       // 0-1, rule of thirds score
    brightness: number;        // 0-1
}

export interface ThumbnailConfig {
    numCandidates: number;     // How many to extract (default 6)
    preferFaces: boolean;      // Prioritize frames with faces
    minSharpness: number;      // 0-1, filter out blurry frames
}

export const DEFAULT_THUMBNAIL_CONFIG: ThumbnailConfig = {
    numCandidates: 6,
    preferFaces: true,
    minSharpness: 0.3,
};

// ============================================================================
// IMAGE ANALYSIS
// ============================================================================

/**
 * Calculate image sharpness using Laplacian variance.
 */
export function calculateSharpness(
    imageData: ImageData
): number {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Convert to grayscale and calculate Laplacian
    let variance = 0;
    let mean = 0;
    const values: number[] = [];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;

            // Grayscale value
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

            // Laplacian (simplified)
            const idxTop = ((y - 1) * width + x) * 4;
            const idxBottom = ((y + 1) * width + x) * 4;
            const idxLeft = (y * width + (x - 1)) * 4;
            const idxRight = (y * width + (x + 1)) * 4;

            const grayTop = 0.299 * data[idxTop] + 0.587 * data[idxTop + 1] + 0.114 * data[idxTop + 2];
            const grayBottom = 0.299 * data[idxBottom] + 0.587 * data[idxBottom + 1] + 0.114 * data[idxBottom + 2];
            const grayLeft = 0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2];
            const grayRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];

            const laplacian = Math.abs(4 * gray - grayTop - grayBottom - grayLeft - grayRight);
            values.push(laplacian);
            mean += laplacian;
        }
    }

    mean /= values.length;
    for (const v of values) {
        variance += (v - mean) ** 2;
    }
    variance /= values.length;

    // Normalize to 0-1 (typical variance range is 0-2000)
    return Math.min(1, variance / 500);
}

/**
 * Calculate colorfulness score.
 */
export function calculateColorfulness(
    imageData: ImageData
): number {
    const data = imageData.data;
    let rg = 0, yb = 0;
    let rgMean = 0, ybMean = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        rg += Math.abs(r - g);
        yb += Math.abs(0.5 * (r + g) - b);
        rgMean += r - g;
        ybMean += 0.5 * (r + g) - b;
        count++;
    }

    rgMean /= count;
    ybMean /= count;
    rg /= count;
    yb /= count;

    // Standard deviation
    const stdRoot = Math.sqrt(rg ** 2 + yb ** 2);
    const meanRoot = Math.sqrt(rgMean ** 2 + ybMean ** 2);

    const colorfulness = stdRoot + 0.3 * meanRoot;

    // Normalize (typical range 0-100)
    return Math.min(1, colorfulness / 100);
}

/**
 * Calculate rule-of-thirds composition score.
 */
export function calculateComposition(
    imageData: ImageData,
    faceRegions: Array<{ x: number; y: number; width: number; height: number }>
): number {
    if (faceRegions.length === 0) {
        return 0.5; // Neutral if no subjects detected
    }

    const width = imageData.width;
    const height = imageData.height;

    // Rule of thirds intersection points
    const thirdPoints = [
        { x: 1 / 3, y: 1 / 3 },
        { x: 2 / 3, y: 1 / 3 },
        { x: 1 / 3, y: 2 / 3 },
        { x: 2 / 3, y: 2 / 3 },
    ];

    let bestScore = 0;

    for (const face of faceRegions) {
        const faceCenterX = (face.x + face.width / 2) / width;
        const faceCenterY = (face.y + face.height / 2) / height;

        for (const point of thirdPoints) {
            const dist = Math.sqrt(
                (faceCenterX - point.x) ** 2 +
                (faceCenterY - point.y) ** 2
            );
            // Closer to thirds = higher score
            const score = 1 - Math.min(1, dist * 2);
            bestScore = Math.max(bestScore, score);
        }
    }

    return bestScore;
}

/**
 * Calculate average brightness.
 */
export function calculateBrightness(
    imageData: ImageData
): number {
    const data = imageData.data;
    let sum = 0;

    for (let i = 0; i < data.length; i += 4) {
        // Perceived brightness
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    return sum / (data.length / 4) / 255;
}

// ============================================================================
// FRAME EXTRACTION
// ============================================================================

/**
 * Extract frame as data URL.
 */
export function extractFrameAsDataUrl(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
): string {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Score a single frame.
 */
export async function scoreFrame(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    config: ThumbnailConfig
): Promise<ThumbnailSignals> {
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Detect faces if available
    let faceRegions: Array<{ x: number; y: number; width: number; height: number }> = [];
    let hasFace = false;
    let faceSize = 0;

    if ('FaceDetector' in window) {
        try {
            // @ts-expect-error FaceDetector is experimental
            const detector = new window.FaceDetector({ fastMode: true });
            const faces = await detector.detect(video);
            faceRegions = faces.map((f: { boundingBox: DOMRect }) => ({
                x: f.boundingBox.x,
                y: f.boundingBox.y,
                width: f.boundingBox.width,
                height: f.boundingBox.height,
            }));
            hasFace = faces.length > 0;
            if (hasFace) {
                const totalFaceArea = faceRegions.reduce(
                    (sum, f) => sum + f.width * f.height,
                    0
                );
                faceSize = totalFaceArea / (canvas.width * canvas.height);
            }
        } catch {
            // Face detection not available
        }
    }

    return {
        hasFace,
        faceSize,
        sharpness: calculateSharpness(imageData),
        colorfulness: calculateColorfulness(imageData),
        composition: calculateComposition(imageData, faceRegions),
        brightness: calculateBrightness(imageData),
    };
}

/**
 * Calculate overall score from signals.
 */
export function calculateOverallScore(
    signals: ThumbnailSignals,
    config: ThumbnailConfig
): number {
    let score = 0;

    // Sharpness is critical
    score += signals.sharpness * 0.3;

    // Face preference
    if (config.preferFaces && signals.hasFace) {
        score += 0.2;
        score += signals.faceSize * 0.1; // Larger faces better
    }

    // Colorfulness
    score += signals.colorfulness * 0.15;

    // Composition (rule of thirds)
    score += signals.composition * 0.15;

    // Brightness (prefer mid-range, not too dark or bright)
    const brightnessPenalty = Math.abs(signals.brightness - 0.5) * 2;
    score += (1 - brightnessPenalty) * 0.1;

    return Math.min(1, score);
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Extract thumbnail candidates from video.
 */
export async function extractThumbnailCandidates(
    video: HTMLVideoElement,
    config: ThumbnailConfig = DEFAULT_THUMBNAIL_CONFIG
): Promise<ThumbnailCandidate[]> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const duration = video.duration;
    const fps = 30; // Assumed
    const totalFrames = Math.floor(duration * fps);

    // Sample frames at regular intervals
    const sampleCount = config.numCandidates * 3; // Get more, filter later
    const interval = duration / (sampleCount + 1);

    const candidates: ThumbnailCandidate[] = [];

    for (let i = 1; i <= sampleCount; i++) {
        const time = interval * i;
        video.currentTime = time;

        // Wait for seek
        await new Promise<void>(resolve => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            video.addEventListener('seeked', onSeeked);
        });

        const signals = await scoreFrame(video, canvas, ctx, config);

        // Filter by minimum sharpness
        if (signals.sharpness < config.minSharpness) continue;

        const score = calculateOverallScore(signals, config);
        const dataUrl = extractFrameAsDataUrl(video, canvas, ctx);

        candidates.push({
            id: `thumb-${i}`,
            frame: Math.floor(time * fps),
            time,
            score,
            dataUrl,
            signals,
        });
    }

    // Sort by score and return top candidates
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, config.numCandidates);
}

/**
 * Extract single frame at specific time.
 */
export async function extractFrameAt(
    video: HTMLVideoElement,
    time: number
): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    video.currentTime = time;

    await new Promise<void>(resolve => {
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
        };
        video.addEventListener('seeked', onSeeked);
    });

    return extractFrameAsDataUrl(video, canvas, ctx);
}
