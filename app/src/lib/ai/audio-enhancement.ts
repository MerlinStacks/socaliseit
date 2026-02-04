/**
 * Audio Enhancement Service
 * Noise reduction, auto-ducking, and voice enhancement.
 * 
 * Why: Professional audio is critical for engagement.
 * Combines multiple audio processing tools in one service.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NoiseReductionConfig {
    enabled: boolean;
    strength: number;        // 0-100
    type: 'voice' | 'music' | 'general';
}

export interface AutoDuckingConfig {
    enabled: boolean;
    speechTrackId: string;
    musicTrackId: string;
    duckLevel: number;       // How much to lower music (0-100, default 70)
    attackTime: number;      // ms to duck (default 200)
    releaseTime: number;     // ms to restore (default 500)
}

export interface VoiceEnhancementConfig {
    enabled: boolean;
    preset: 'podcast' | 'broadcast' | 'natural' | 'custom';
    deEsser: boolean;
    bassBoost: number;       // -12 to +12 dB
    trebleBoost: number;     // -12 to +12 dB
    compression: number;     // 0-100
}

export interface AudioEnhancementConfig {
    noiseReduction: NoiseReductionConfig;
    autoDucking: AutoDuckingConfig;
    voiceEnhancement: VoiceEnhancementConfig;
}

export interface VoicePreset {
    id: string;
    name: string;
    description: string;
    settings: Omit<VoiceEnhancementConfig, 'enabled' | 'preset'>;
}

// ============================================================================
// PRESETS
// ============================================================================

export const VOICE_PRESETS: VoicePreset[] = [
    {
        id: 'podcast',
        name: 'Podcast',
        description: 'Warm, intimate sound for spoken content',
        settings: {
            deEsser: true,
            bassBoost: 2,
            trebleBoost: 1,
            compression: 60,
        },
    },
    {
        id: 'broadcast',
        name: 'Broadcast',
        description: 'Clear, punchy sound for announcements',
        settings: {
            deEsser: true,
            bassBoost: 3,
            trebleBoost: 3,
            compression: 75,
        },
    },
    {
        id: 'natural',
        name: 'Natural',
        description: 'Minimal processing, clean sound',
        settings: {
            deEsser: false,
            bassBoost: 0,
            trebleBoost: 0,
            compression: 30,
        },
    },
];

export const DEFAULT_AUDIO_CONFIG: AudioEnhancementConfig = {
    noiseReduction: {
        enabled: false,
        strength: 50,
        type: 'voice',
    },
    autoDucking: {
        enabled: false,
        speechTrackId: '',
        musicTrackId: '',
        duckLevel: 70,
        attackTime: 200,
        releaseTime: 500,
    },
    voiceEnhancement: {
        enabled: false,
        preset: 'natural',
        ...VOICE_PRESETS[2].settings,
    },
};

// ============================================================================
// WEB AUDIO API PROCESSORS
// ============================================================================

/**
 * Create noise reduction audio processor.
 * Uses high-pass and low-pass filters to reduce hum/hiss.
 */
export function createNoiseReductionNode(
    audioContext: AudioContext,
    config: NoiseReductionConfig
): AudioNode {
    // Create filter chain
    const highPass = audioContext.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = config.type === 'voice' ? 80 : 40;
    highPass.Q.value = 0.7;

    const lowPass = audioContext.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = config.type === 'voice' ? 8000 : 16000;
    lowPass.Q.value = 0.7;

    // Notch filter for 50/60Hz hum
    const notch = audioContext.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.value = 60;
    notch.Q.value = 30;

    // Connect chain
    highPass.connect(lowPass);
    lowPass.connect(notch);

    return highPass;
}

/**
 * Create voice enhancement processor chain.
 */
export function createVoiceEnhancementNodes(
    audioContext: AudioContext,
    config: VoiceEnhancementConfig
): AudioNode {
    // Bass EQ
    const bassEQ = audioContext.createBiquadFilter();
    bassEQ.type = 'lowshelf';
    bassEQ.frequency.value = 200;
    bassEQ.gain.value = config.bassBoost;

    // Treble EQ
    const trebleEQ = audioContext.createBiquadFilter();
    trebleEQ.type = 'highshelf';
    trebleEQ.frequency.value = 4000;
    trebleEQ.gain.value = config.trebleBoost;

    // De-esser (notch at 6-8kHz)
    const deEsser = audioContext.createBiquadFilter();
    deEsser.type = 'peaking';
    deEsser.frequency.value = 7000;
    deEsser.Q.value = 2;
    deEsser.gain.value = config.deEsser ? -6 : 0;

    // Compressor
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 12;
    compressor.ratio.value = 4 + (config.compression / 100) * 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    // Connect chain
    bassEQ.connect(trebleEQ);
    trebleEQ.connect(deEsser);
    deEsser.connect(compressor);

    return bassEQ;
}

// ============================================================================
// AUTO-DUCKING
// ============================================================================

/**
 * Detect speech segments in audio.
 * Returns array of time ranges where speech is detected.
 */
export async function detectSpeechSegments(
    audioBuffer: AudioBuffer,
    threshold: number = 0.1
): Promise<Array<{ start: number; end: number }>> {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows

    const segments: Array<{ start: number; end: number }> = [];
    let inSpeech = false;
    let segmentStart = 0;

    for (let i = 0; i < channelData.length; i += windowSize) {
        // Calculate RMS energy for window
        let sum = 0;
        const windowEnd = Math.min(i + windowSize, channelData.length);
        for (let j = i; j < windowEnd; j++) {
            sum += channelData[j] * channelData[j];
        }
        const rms = Math.sqrt(sum / (windowEnd - i));

        const time = i / sampleRate;

        if (rms > threshold && !inSpeech) {
            inSpeech = true;
            segmentStart = time;
        } else if (rms <= threshold && inSpeech) {
            inSpeech = false;
            segments.push({ start: segmentStart, end: time });
        }
    }

    // Close final segment if still in speech
    if (inSpeech) {
        segments.push({
            start: segmentStart,
            end: channelData.length / sampleRate,
        });
    }

    return segments;
}

/**
 * Generate volume keyframes for auto-ducking.
 */
export function generateDuckingKeyframes(
    speechSegments: Array<{ start: number; end: number }>,
    config: AutoDuckingConfig,
    fps: number
): Array<{ frame: number; volume: number }> {
    const keyframes: Array<{ frame: number; volume: number }> = [];
    const duckVolume = 1 - (config.duckLevel / 100);
    const attackFrames = Math.ceil((config.attackTime / 1000) * fps);
    const releaseFrames = Math.ceil((config.releaseTime / 1000) * fps);

    for (const segment of speechSegments) {
        const startFrame = Math.floor(segment.start * fps);
        const endFrame = Math.floor(segment.end * fps);

        // Duck start
        keyframes.push({ frame: startFrame - attackFrames, volume: 1 });
        keyframes.push({ frame: startFrame, volume: duckVolume });

        // Duck end
        keyframes.push({ frame: endFrame, volume: duckVolume });
        keyframes.push({ frame: endFrame + releaseFrames, volume: 1 });
    }

    // Sort and deduplicate
    keyframes.sort((a, b) => a.frame - b.frame);
    return keyframes;
}

// ============================================================================
// FFMPEG FILTER GENERATION
// ============================================================================

/**
 * Generate FFmpeg filter for noise reduction.
 */
export function generateNoiseReductionFilter(config: NoiseReductionConfig): string {
    if (!config.enabled) return '';

    const filters: string[] = [];

    // High-pass filter to remove low rumble
    const highpassFreq = config.type === 'voice' ? 80 : 40;
    filters.push(`highpass=f=${highpassFreq}`);

    // Low-pass for high frequency hiss
    const lowpassFreq = config.type === 'voice' ? 8000 : 16000;
    filters.push(`lowpass=f=${lowpassFreq}`);

    // Noise gate based on strength
    const gateThreshold = -40 + (config.strength / 100) * 20;
    filters.push(`agate=threshold=${gateThreshold}dB`);

    // afftdn for advanced noise reduction
    const nfValue = (config.strength / 100) * 30;
    filters.push(`afftdn=nf=-${nfValue}`);

    return filters.join(',');
}

/**
 * Generate FFmpeg filter for voice enhancement.
 */
export function generateVoiceEnhancementFilter(config: VoiceEnhancementConfig): string {
    if (!config.enabled) return '';

    const filters: string[] = [];

    // EQ
    if (config.bassBoost !== 0) {
        filters.push(`bass=g=${config.bassBoost}`);
    }
    if (config.trebleBoost !== 0) {
        filters.push(`treble=g=${config.trebleBoost}`);
    }

    // De-esser
    if (config.deEsser) {
        filters.push('highpass=f=6000,lowpass=f=9000,volume=-6dB');
    }

    // Compression
    if (config.compression > 0) {
        const ratio = 2 + (config.compression / 100) * 6;
        filters.push(`acompressor=ratio=${ratio}:attack=5:release=50`);
    }

    return filters.join(',');
}

/**
 * Generate FFmpeg volume filter for auto-ducking.
 */
export function generateAutoDuckingFilter(
    keyframes: Array<{ frame: number; volume: number }>,
    fps: number
): string {
    if (keyframes.length === 0) return '';

    // Convert keyframes to FFmpeg volume expression
    const volumeExpr = keyframes.map((kf, i) => {
        const nextKf = keyframes[i + 1];
        if (!nextKf) return `${kf.volume}`;

        // Linear interpolation between keyframes
        const t = `(n-${kf.frame})/${nextKf.frame - kf.frame}`;
        return `if(between(n,${kf.frame},${nextKf.frame}),${kf.volume}+(${nextKf.volume}-${kf.volume})*${t},`;
    }).join('') + '1' + ')'.repeat(keyframes.length - 1);

    return `volume='${volumeExpr}'`;
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Generate combined FFmpeg audio filter.
 */
export function generateAudioEnhancementFilter(
    config: AudioEnhancementConfig,
    duckingKeyframes?: Array<{ frame: number; volume: number }>,
    fps: number = 30
): string {
    const filters: string[] = [];

    const noiseFilter = generateNoiseReductionFilter(config.noiseReduction);
    if (noiseFilter) filters.push(noiseFilter);

    const voiceFilter = generateVoiceEnhancementFilter(config.voiceEnhancement);
    if (voiceFilter) filters.push(voiceFilter);

    if (config.autoDucking.enabled && duckingKeyframes && duckingKeyframes.length > 0) {
        const duckFilter = generateAutoDuckingFilter(duckingKeyframes, fps);
        if (duckFilter) filters.push(duckFilter);
    }

    return filters.join(',');
}

/**
 * Get voice preset by ID.
 */
export function getVoicePresetById(id: string): VoicePreset | undefined {
    return VOICE_PRESETS.find(p => p.id === id);
}

/**
 * Get all voice presets.
 */
export function getVoicePresets(): VoicePreset[] {
    return VOICE_PRESETS;
}
