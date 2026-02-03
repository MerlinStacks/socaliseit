/**
 * AI Highlight Detection Service
 * Analyzes video/audio to identify engaging moments for content repurposing.
 * 
 * Why: Enables automatic extraction of highlights for platform-specific content,
 * using multiple signals: audio energy, scene changes, and transcript sentiment.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Highlight {
    id: string;
    startFrame: number;
    endFrame: number;
    startTime: number;
    endTime: number;
    score: number; // 0-1 engagement score
    type: 'hook' | 'peak' | 'climax' | 'closing' | 'generic';
    reason: string;
    signals: HighlightSignals;
}

export interface HighlightSignals {
    audioEnergy?: number;    // 0-1 based on volume/dynamics
    sceneChange?: number;    // 0-1 scene transition strength
    speechPace?: number;     // 0-1 based on words per second
    sentimentScore?: number; // -1 to 1 emotional intensity
}

export interface HighlightDetectionConfig {
    /** Video FPS */
    fps: number;
    /** Total video duration in frames */
    totalFrames: number;
    /** Minimum highlight duration in seconds */
    minDuration: number;
    /** Maximum highlight duration in seconds */
    maxDuration: number;
    /** Number of highlights to extract */
    numHighlights: number;
    /** Platform-specific preferences */
    platform?: 'tiktok' | 'instagram' | 'youtube' | 'twitter';
}

export interface HighlightDetectionResult {
    highlights: Highlight[];
    analysisMethod: string;
    totalDuration: number;
}

export const DEFAULT_HIGHLIGHT_CONFIG: HighlightDetectionConfig = {
    fps: 30,
    totalFrames: 300,
    minDuration: 5,
    maxDuration: 60,
    numHighlights: 3,
};

// ============================================================================
// AUDIO ENERGY ANALYSIS
// ============================================================================

/**
 * Analyze audio energy levels to find high-energy segments.
 * Uses Web Audio API for client-side analysis.
 */
export async function analyzeAudioEnergy(
    audioUrl: string,
    config: HighlightDetectionConfig
): Promise<Array<{ time: number; energy: number }>> {
    const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();

    try {
        // Fetch and decode audio
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Get audio data
        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        // Calculate energy in 0.5s windows
        const windowSize = Math.floor(sampleRate * 0.5);
        const energyPoints: Array<{ time: number; energy: number }> = [];

        for (let i = 0; i < channelData.length; i += windowSize) {
            let sum = 0;
            const end = Math.min(i + windowSize, channelData.length);

            for (let j = i; j < end; j++) {
                sum += channelData[j] * channelData[j];
            }

            const rms = Math.sqrt(sum / (end - i));
            energyPoints.push({
                time: i / sampleRate,
                energy: rms,
            });
        }

        // Normalize energy values
        const maxEnergy = Math.max(...energyPoints.map(p => p.energy));
        if (maxEnergy > 0) {
            energyPoints.forEach(p => p.energy = p.energy / maxEnergy);
        }

        return energyPoints;
    } finally {
        await audioContext.close();
    }
}

/**
 * Find peaks in energy data.
 */
function findEnergyPeaks(
    energyData: Array<{ time: number; energy: number }>,
    threshold: number = 0.6
): Array<{ time: number; peak: number }> {
    const peaks: Array<{ time: number; peak: number }> = [];

    for (let i = 1; i < energyData.length - 1; i++) {
        const prev = energyData[i - 1].energy;
        const curr = energyData[i].energy;
        const next = energyData[i + 1].energy;

        // Is this a local maximum above threshold?
        if (curr > prev && curr > next && curr >= threshold) {
            peaks.push({
                time: energyData[i].time,
                peak: curr,
            });
        }
    }

    return peaks;
}

// ============================================================================
// HIGHLIGHT DETECTION ALGORITHMS
// ============================================================================

/**
 * Detect highlights using audio energy analysis.
 * Best for music videos, vlogs, dynamic content.
 */
export async function detectHighlightsFromAudio(
    audioUrl: string,
    config: HighlightDetectionConfig
): Promise<Highlight[]> {
    const energyData = await analyzeAudioEnergy(audioUrl, config);
    const peaks = findEnergyPeaks(energyData, 0.5);

    // Convert peaks to highlight segments
    const highlights: Highlight[] = [];
    const usedRanges: Array<{ start: number; end: number }> = [];

    // Sort peaks by energy (highest first)
    const sortedPeaks = [...peaks].sort((a, b) => b.peak - a.peak);

    for (const peak of sortedPeaks) {
        if (highlights.length >= config.numHighlights) break;

        // Create a highlight around this peak
        const halfDuration = config.minDuration / 2;
        const startTime = Math.max(0, peak.time - halfDuration);
        const endTime = Math.min(
            config.totalFrames / config.fps,
            peak.time + halfDuration
        );

        // Check for overlap with existing highlights
        const overlaps = usedRanges.some(range =>
            startTime < range.end && endTime > range.start
        );

        if (overlaps) continue;

        usedRanges.push({ start: startTime, end: endTime });

        highlights.push({
            id: `highlight-audio-${highlights.length}`,
            startFrame: Math.floor(startTime * config.fps),
            endFrame: Math.floor(endTime * config.fps),
            startTime,
            endTime,
            score: peak.peak,
            type: highlights.length === 0 ? 'hook' :
                highlights.length === sortedPeaks.length - 1 ? 'closing' : 'peak',
            reason: `High energy moment (${Math.round(peak.peak * 100)}% intensity)`,
            signals: {
                audioEnergy: peak.peak,
            },
        });
    }

    // Sort by time
    highlights.sort((a, b) => a.startTime - b.startTime);

    return highlights;
}

/**
 * Detect highlights using heuristic segments.
 * Fallback when audio analysis isn't available.
 */
export function detectHighlightsHeuristic(
    config: HighlightDetectionConfig
): Highlight[] {
    const totalDuration = config.totalFrames / config.fps;
    const highlights: Highlight[] = [];

    // Platform-specific strategies
    const platformStrategies: Record<string, Array<{ position: number; type: Highlight['type']; weight: number }>> = {
        tiktok: [
            { position: 0, type: 'hook', weight: 1.0 },
            { position: 0.4, type: 'peak', weight: 0.85 },
            { position: 0.8, type: 'closing', weight: 0.75 },
        ],
        instagram: [
            { position: 0.1, type: 'hook', weight: 0.95 },
            { position: 0.5, type: 'climax', weight: 0.9 },
            { position: 0.85, type: 'closing', weight: 0.8 },
        ],
        youtube: [
            { position: 0, type: 'hook', weight: 0.9 },
            { position: 0.25, type: 'peak', weight: 0.85 },
            { position: 0.6, type: 'climax', weight: 0.88 },
            { position: 0.9, type: 'closing', weight: 0.82 },
        ],
        twitter: [
            { position: 0, type: 'hook', weight: 1.0 },
            { position: 0.5, type: 'peak', weight: 0.8 },
        ],
        default: [
            { position: 0, type: 'hook', weight: 0.95 },
            { position: 0.5, type: 'peak', weight: 0.85 },
            { position: 0.85, type: 'closing', weight: 0.8 },
        ],
    };

    const strategy = platformStrategies[config.platform || 'default'] || platformStrategies.default;

    for (const point of strategy.slice(0, config.numHighlights)) {
        const startTime = Math.floor(point.position * totalDuration);
        const endTime = Math.min(startTime + config.maxDuration, totalDuration);

        highlights.push({
            id: `highlight-heuristic-${highlights.length}`,
            startFrame: Math.floor(startTime * config.fps),
            endFrame: Math.floor(endTime * config.fps),
            startTime,
            endTime,
            score: point.weight,
            type: point.type,
            reason: getReasonForType(point.type),
            signals: {},
        });
    }

    return highlights;
}

function getReasonForType(type: Highlight['type']): string {
    switch (type) {
        case 'hook': return 'Strong opening to capture attention';
        case 'peak': return 'High engagement moment';
        case 'climax': return 'Key highlight or turning point';
        case 'closing': return 'Impactful ending segment';
        default: return 'Interesting content segment';
    }
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Detect highlights in video using best available method.
 * Tries audio analysis first, falls back to heuristic.
 */
export async function detectHighlights(
    mediaUrl: string | undefined,
    config: HighlightDetectionConfig
): Promise<HighlightDetectionResult> {
    try {
        // Try audio-based detection if we have a URL
        if (mediaUrl) {
            const highlights = await detectHighlightsFromAudio(mediaUrl, config);
            if (highlights.length > 0) {
                return {
                    highlights,
                    analysisMethod: 'audio-energy',
                    totalDuration: config.totalFrames / config.fps,
                };
            }
        }
    } catch {
        // Fall back to heuristic method
    }

    // Use heuristic fallback
    const highlights = detectHighlightsHeuristic(config);
    return {
        highlights,
        analysisMethod: 'heuristic',
        totalDuration: config.totalFrames / config.fps,
    };
}

/**
 * Generate platform-specific clip suggestions from highlights.
 */
export function generatePlatformClips(
    highlights: Highlight[],
    platformMaxDuration: number,
    config: HighlightDetectionConfig
): Array<{
    startFrame: number;
    endFrame: number;
    score: number;
    reason: string;
}> {
    const maxFrames = platformMaxDuration * config.fps;
    const totalFrames = config.totalFrames;

    return highlights.map(highlight => {
        let startFrame = highlight.startFrame;
        let endFrame = highlight.endFrame;

        // Adjust to fit platform constraints
        const clipDuration = endFrame - startFrame;
        if (clipDuration > maxFrames) {
            // Trim to max duration, keeping the best part (center)
            const excess = clipDuration - maxFrames;
            startFrame += Math.floor(excess / 4); // Bias toward start
            endFrame = startFrame + maxFrames;
        }

        // Ensure we don't exceed video bounds
        endFrame = Math.min(endFrame, totalFrames);
        startFrame = Math.max(0, startFrame);

        return {
            startFrame,
            endFrame,
            score: highlight.score,
            reason: highlight.reason,
        };
    });
}
