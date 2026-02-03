/**
 * Audio Analysis Service
 * Core audio processing utilities for video editing AI features.
 * 
 * Why: Foundation for silence removal, beat detection, and waveform visualization.
 * Uses Web Audio API for client-side analysis and FFmpeg for server-side processing.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TimeRange {
    startFrame: number;
    endFrame: number;
    startTime: number; // seconds
    endTime: number;
}

export interface SilenceGap extends TimeRange {
    durationMs: number;
}

export interface AudioAnalysisResult {
    duration: number; // seconds
    sampleRate: number;
    waveform: number[]; // Normalized 0-1 values, downsampled
    silenceGaps: SilenceGap[];
    rmsLevels: number[]; // Energy levels per segment
    peakAmplitude: number;
}

export interface SilenceConfig {
    /** Threshold in dB below which audio is considered silent (-60 to -20) */
    thresholdDb: number;
    /** Minimum duration in ms to count as silence (100-5000) */
    minDurationMs: number;
    /** Padding in ms to keep around cuts (0-500) */
    paddingMs: number;
}

export interface BeatAnalysis {
    bpm: number;
    beats: Beat[]; // Individual beat objects with time and strength
    downbeats: number[]; // Strong beats (1st beat of bar)
    confidence: number;
}

/** Individual beat detected in audio */
export interface Beat {
    frame: number;
    time: number;
    strength: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_SILENCE_CONFIG: SilenceConfig = {
    thresholdDb: -35,
    minDurationMs: 500,
    paddingMs: 100,
};

const WAVEFORM_SAMPLES = 1000; // Number of samples for visualization

// ============================================================================
// CLIENT-SIDE ANALYSIS (Web Audio API)
// ============================================================================

/**
 * Analyze audio file client-side using Web Audio API
 * @param audioUrl - URL to audio/video file
 * @param config - Silence detection configuration
 */
export async function analyzeAudioClient(
    audioUrl: string,
    config: SilenceConfig = DEFAULT_SILENCE_CONFIG,
    fps: number = 30
): Promise<AudioAnalysisResult> {
    const audioContext = new AudioContext();

    // Fetch and decode audio
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0); // Mono or left channel
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    // Generate downsampled waveform for visualization
    const waveform = generateWaveform(channelData, WAVEFORM_SAMPLES);

    // Calculate RMS levels per segment
    const segmentDuration = 0.1; // 100ms segments
    const rmsLevels = calculateRmsLevels(channelData, sampleRate, segmentDuration);

    // Detect silence gaps
    const silenceGaps = detectSilence(
        channelData,
        sampleRate,
        config,
        fps
    );

    // Find peak amplitude
    const peakAmplitude = Math.max(...channelData.map(Math.abs));

    await audioContext.close();

    return {
        duration,
        sampleRate,
        waveform,
        silenceGaps,
        rmsLevels,
        peakAmplitude,
    };
}

/**
 * Generate downsampled waveform for visualization
 */
function generateWaveform(channelData: Float32Array, samples: number): number[] {
    const blockSize = Math.floor(channelData.length / samples);
    const waveform: number[] = [];

    for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        const end = start + blockSize;

        // Get max absolute value in this block
        let max = 0;
        for (let j = start; j < end && j < channelData.length; j++) {
            const absValue = Math.abs(channelData[j]);
            if (absValue > max) max = absValue;
        }
        waveform.push(max);
    }

    return waveform;
}

/**
 * Calculate RMS (loudness) levels per time segment
 */
function calculateRmsLevels(
    channelData: Float32Array,
    sampleRate: number,
    segmentDuration: number
): number[] {
    const samplesPerSegment = Math.floor(sampleRate * segmentDuration);
    const numSegments = Math.ceil(channelData.length / samplesPerSegment);
    const rmsLevels: number[] = [];

    for (let i = 0; i < numSegments; i++) {
        const start = i * samplesPerSegment;
        const end = Math.min(start + samplesPerSegment, channelData.length);

        let sumSquares = 0;
        for (let j = start; j < end; j++) {
            sumSquares += channelData[j] * channelData[j];
        }

        const rms = Math.sqrt(sumSquares / (end - start));
        rmsLevels.push(rms);
    }

    return rmsLevels;
}

/**
 * Detect silence gaps in audio
 */
function detectSilence(
    channelData: Float32Array,
    sampleRate: number,
    config: SilenceConfig,
    fps: number
): SilenceGap[] {
    const silenceGaps: SilenceGap[] = [];

    // Convert dB threshold to amplitude
    const thresholdAmplitude = Math.pow(10, config.thresholdDb / 20);

    // Analyze in small chunks (10ms)
    const chunkDuration = 0.01; // 10ms
    const samplesPerChunk = Math.floor(sampleRate * chunkDuration);
    const numChunks = Math.ceil(channelData.length / samplesPerChunk);

    let silenceStart: number | null = null;

    for (let i = 0; i < numChunks; i++) {
        const start = i * samplesPerChunk;
        const end = Math.min(start + samplesPerChunk, channelData.length);

        // Calculate RMS for this chunk
        let sumSquares = 0;
        for (let j = start; j < end; j++) {
            sumSquares += channelData[j] * channelData[j];
        }
        const rms = Math.sqrt(sumSquares / (end - start));

        const isSilent = rms < thresholdAmplitude;
        const currentTime = (i * chunkDuration);

        if (isSilent && silenceStart === null) {
            // Start of silence
            silenceStart = currentTime;
        } else if (!isSilent && silenceStart !== null) {
            // End of silence
            const silenceEnd = currentTime;
            const durationMs = (silenceEnd - silenceStart) * 1000;

            if (durationMs >= config.minDurationMs) {
                silenceGaps.push({
                    startTime: silenceStart,
                    endTime: silenceEnd,
                    startFrame: Math.floor(silenceStart * fps),
                    endFrame: Math.floor(silenceEnd * fps),
                    durationMs,
                });
            }
            silenceStart = null;
        }
    }

    // Handle silence at end of audio
    if (silenceStart !== null) {
        const silenceEnd = channelData.length / sampleRate;
        const durationMs = (silenceEnd - silenceStart) * 1000;

        if (durationMs >= config.minDurationMs) {
            silenceGaps.push({
                startTime: silenceStart,
                endTime: silenceEnd,
                startFrame: Math.floor(silenceStart * fps),
                endFrame: Math.floor(silenceEnd * fps),
                durationMs,
            });
        }
    }

    return silenceGaps;
}

// ============================================================================
// BEAT DETECTION (Basic onset detection)
// ============================================================================

/**
 * Detect beats in audio using onset detection
 * Note: For production, consider using a library like music-tempo or essentia.js
 */
export async function detectBeats(
    audioUrl: string,
    fps: number = 30
): Promise<BeatAnalysis> {
    const audioContext = new AudioContext();

    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Calculate energy in short windows
    const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
    const hopSize = Math.floor(windowSize / 2);
    const numWindows = Math.floor((channelData.length - windowSize) / hopSize);

    const energies: number[] = [];
    for (let i = 0; i < numWindows; i++) {
        const start = i * hopSize;
        let energy = 0;
        for (let j = 0; j < windowSize; j++) {
            energy += channelData[start + j] * channelData[start + j];
        }
        energies.push(energy);
    }

    // Find onset peaks (beats)
    const beats: Beat[] = [];
    const threshold = calculateDynamicThreshold(energies);
    const maxEnergy = Math.max(...energies);

    for (let i = 1; i < energies.length - 1; i++) {
        // Local maximum above threshold
        if (energies[i] > energies[i - 1] &&
            energies[i] > energies[i + 1] &&
            energies[i] > threshold) {
            const timeInSeconds = (i * hopSize) / sampleRate;
            beats.push({
                frame: Math.round(timeInSeconds * fps),
                time: timeInSeconds,
                strength: maxEnergy > 0 ? energies[i] / maxEnergy : 0.5,
            });
        }
    }

    // Estimate BPM from beat intervals
    const bpm = estimateBpm(beats, fps);

    // Identify downbeats (every 4th beat for 4/4 time)
    const downbeats = beats.filter((_, i) => i % 4 === 0).map(b => b.frame);

    await audioContext.close();

    return {
        bpm,
        beats,
        downbeats,
        confidence: beats.length > 10 ? 0.8 : 0.5,
    };
}

/**
 * Calculate dynamic threshold using median + multiplier
 */
function calculateDynamicThreshold(energies: number[]): number {
    const sorted = [...energies].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return median * 2; // Threshold at 2x median
}

/**
 * Estimate BPM from beat positions
 */
function estimateBpm(beats: Beat[], fps: number): number {
    if (beats.length < 2) return 120; // Default BPM

    // Calculate intervals between beats
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
        const intervalFrames = beats[i].frame - beats[i - 1].frame;
        const intervalSeconds = intervalFrames / fps;
        if (intervalSeconds > 0.2 && intervalSeconds < 2) { // Reasonable beat range
            intervals.push(intervalSeconds);
        }
    }

    if (intervals.length === 0) return 120;

    // Average interval
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = 60 / avgInterval;

    // Clamp to reasonable range
    return Math.round(Math.max(60, Math.min(200, bpm)));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert amplitude to decibels
 */
export function amplitudeToDb(amplitude: number): number {
    return 20 * Math.log10(Math.max(amplitude, 0.0001));
}

/**
 * Convert decibels to amplitude
 */
export function dbToAmplitude(db: number): number {
    return Math.pow(10, db / 20);
}

/**
 * Apply padding to silence gaps (shrink them by padding amount)
 */
export function applySilencePadding(
    gaps: SilenceGap[],
    paddingMs: number,
    fps: number
): SilenceGap[] {
    const paddingSeconds = paddingMs / 1000;
    const paddingFrames = Math.round(paddingSeconds * fps);

    return gaps
        .map(gap => ({
            ...gap,
            startTime: gap.startTime + paddingSeconds,
            endTime: gap.endTime - paddingSeconds,
            startFrame: gap.startFrame + paddingFrames,
            endFrame: gap.endFrame - paddingFrames,
            durationMs: gap.durationMs - (paddingMs * 2),
        }))
        .filter(gap => gap.durationMs > 0);
}
