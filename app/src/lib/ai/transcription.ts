/**
 * Transcription Service
 * OpenAI Whisper integration for speech-to-text with word-level timestamps.
 * 
 * Why: Foundation for auto-captions, content analysis, and keyword extraction.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WordTimestamp {
    word: string;
    start: number; // seconds
    end: number;
}

export interface TranscriptionSegment {
    id: number;
    text: string;
    startTime: number; // seconds
    endTime: number;
    words: WordTimestamp[];
}

export interface TranscriptionResult {
    text: string;
    language: string;
    duration: number;
    segments: TranscriptionSegment[];
}

export interface TranscriptionOptions {
    /** Language code (e.g., 'en', 'es') or null for auto-detect */
    language?: string | null;
    /** Whether to include word-level timestamps */
    wordTimestamps?: boolean;
    /** Prompt to guide transcription style */
    prompt?: string;
}

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

export const DEFAULT_TRANSCRIPTION_OPTIONS: TranscriptionOptions = {
    language: null, // Auto-detect
    wordTimestamps: true,
    prompt: undefined,
};

// ============================================================================
// CLIENT-SIDE API CALL
// ============================================================================

/**
 * Transcribe audio/video file
 * @param file - Audio or video file
 * @param options - Transcription options
 * @returns Transcription result with segments and word timestamps
 */
export async function transcribeAudio(
    file: File,
    options: TranscriptionOptions = DEFAULT_TRANSCRIPTION_OPTIONS
): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('file', file);

    if (options.language) {
        formData.append('language', options.language);
    }
    if (options.wordTimestamps !== undefined) {
        formData.append('wordTimestamps', String(options.wordTimestamps));
    }
    if (options.prompt) {
        formData.append('prompt', options.prompt);
    }

    const response = await fetch('/api/video/transcribe', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Transcription failed');
    }

    return response.json();
}

/**
 * Transcribe from URL (for media already uploaded)
 */
export async function transcribeFromUrl(
    url: string,
    options: TranscriptionOptions = DEFAULT_TRANSCRIPTION_OPTIONS
): Promise<TranscriptionResult> {
    const response = await fetch('/api/video/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...options }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Transcription failed');
    }

    return response.json();
}

// ============================================================================
// SEGMENT UTILITIES
// ============================================================================

/**
 * Convert transcription segments to frame-based format
 */
export function segmentsToFrames(
    segments: TranscriptionSegment[],
    fps: number
): Array<TranscriptionSegment & { startFrame: number; endFrame: number }> {
    return segments.map(segment => ({
        ...segment,
        startFrame: Math.round(segment.startTime * fps),
        endFrame: Math.round(segment.endTime * fps),
    }));
}

/**
 * Split long segments into shorter chunks for captions
 * @param segments - Original segments
 * @param maxDuration - Maximum segment duration in seconds
 * @param maxWords - Maximum words per segment
 */
export function splitLongSegments(
    segments: TranscriptionSegment[],
    maxDuration: number = 4,
    maxWords: number = 10
): TranscriptionSegment[] {
    const result: TranscriptionSegment[] = [];
    let segmentId = 0;

    for (const segment of segments) {
        const words = segment.words;

        if (words.length === 0) {
            result.push({ ...segment, id: segmentId++ });
            continue;
        }

        let currentWords: WordTimestamp[] = [];
        let currentStart = words[0].start;

        for (const word of words) {
            currentWords.push(word);

            const duration = word.end - currentStart;
            const shouldSplit = duration >= maxDuration || currentWords.length >= maxWords;

            if (shouldSplit) {
                result.push({
                    id: segmentId++,
                    text: currentWords.map(w => w.word).join(' '),
                    startTime: currentStart,
                    endTime: word.end,
                    words: currentWords,
                });
                currentWords = [];
                currentStart = word.end;
            }
        }

        // Add remaining words
        if (currentWords.length > 0) {
            result.push({
                id: segmentId++,
                text: currentWords.map(w => w.word).join(' '),
                startTime: currentStart,
                endTime: currentWords[currentWords.length - 1].end,
                words: currentWords,
            });
        }
    }

    return result;
}

/**
 * Merge short segments together
 */
export function mergeShortSegments(
    segments: TranscriptionSegment[],
    minDuration: number = 1
): TranscriptionSegment[] {
    if (segments.length === 0) return [];

    const result: TranscriptionSegment[] = [];
    let current = { ...segments[0] };

    for (let i = 1; i < segments.length; i++) {
        const next = segments[i];
        const currentDuration = current.endTime - current.startTime;
        const gap = next.startTime - current.endTime;

        // Merge if current is too short and gap is small
        if (currentDuration < minDuration && gap < 0.5) {
            current = {
                ...current,
                text: current.text + ' ' + next.text,
                endTime: next.endTime,
                words: [...current.words, ...next.words],
            };
        } else {
            result.push(current);
            current = { ...next };
        }
    }

    result.push(current);
    return result;
}

/**
 * Extract keywords from transcription
 */
export function extractKeywords(segments: TranscriptionSegment[]): string[] {
    const fullText = segments.map(s => s.text).join(' ').toLowerCase();

    // Simple keyword extraction (remove common words)
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
        'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
        'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
        'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
        'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
        'very', 'just', 'now', 'here', 'there', 'then', 'also', 'back', 'um',
        'uh', 'like', 'yeah', 'okay', 'oh', 'well', 'right', 'going', 'gonna',
    ]);

    const words = fullText
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

    // Count frequency
    const frequency: Record<string, number> = {};
    for (const word of words) {
        frequency[word] = (frequency[word] || 0) + 1;
    }

    // Sort by frequency and return top keywords
    return Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([word]) => word);
}

// ============================================================================
// SRT/VTT EXPORT
// ============================================================================

/**
 * Export segments as SRT subtitle file
 */
export function exportToSrt(segments: TranscriptionSegment[]): string {
    return segments.map((segment, index) => {
        const startTime = formatSrtTime(segment.startTime);
        const endTime = formatSrtTime(segment.endTime);
        return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`;
    }).join('\n');
}

/**
 * Export segments as VTT subtitle file
 */
export function exportToVtt(segments: TranscriptionSegment[]): string {
    const vttSegments = segments.map(segment => {
        const startTime = formatVttTime(segment.startTime);
        const endTime = formatVttTime(segment.endTime);
        return `${startTime} --> ${endTime}\n${segment.text}`;
    }).join('\n\n');

    return `WEBVTT\n\n${vttSegments}`;
}

/**
 * Format time for SRT (HH:MM:SS,mmm)
 */
function formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);

    return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
}

/**
 * Format time for VTT (HH:MM:SS.mmm)
 */
function formatVttTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);

    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

/**
 * Pad number with leading zeros
 */
function pad(num: number, length: number = 2): string {
    return num.toString().padStart(length, '0');
}
