/**
 * B-Roll Matching Service
 * Analyzes transcription/captions to suggest relevant B-roll footage from media library.
 * 
 * Why: Automates the tedious process of finding supplementary footage
 * by matching spoken content keywords to available media.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BrollSuggestion {
    /** Media library item ID */
    mediaId: string;
    /** URL to the media file */
    mediaUrl: string;
    /** Thumbnail URL for preview */
    thumbnailUrl?: string;
    /** Media type (video/image) */
    mediaType: 'video' | 'image';
    /** 0-1 score indicating how well this matches */
    relevanceScore: number;
    /** Keywords that triggered this match */
    matchedKeywords: string[];
    /** Suggested frame in timeline to insert */
    suggestedInsertFrame: number;
    /** Time window this B-roll would cover (seconds) */
    suggestedDuration: number;
    /** Original text segment this matches */
    matchedText: string;
}

export interface TranscriptionSegment {
    id: number;
    text: string;
    startTime: number;
    endTime: number;
}

export interface MediaLibraryItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
    type: 'video' | 'image';
    filename: string;
    tags?: string[];
    description?: string;
}

export interface BrollMatchingConfig {
    /** Minimum relevance score to include (0-1) */
    minRelevance: number;
    /** Maximum suggestions per segment */
    maxSuggestionsPerSegment: number;
    /** FPS for frame calculations */
    fps: number;
    /** Keywords to exclude from matching */
    excludeKeywords?: string[];
}

export const DEFAULT_BROLL_CONFIG: BrollMatchingConfig = {
    minRelevance: 0.3,
    maxSuggestionsPerSegment: 3,
    fps: 30,
    excludeKeywords: ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been'],
};

// ============================================================================
// KEYWORD EXTRACTION
// ============================================================================

/**
 * Common stop words to filter out
 */
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'i', 'you',
    'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom',
    'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does',
    'did', 'doing', 'would', 'could', 'might', 'must', 'shall', 'as',
    'if', 'because', 'until', 'while', 'both', 'either', 'neither',
    'also', 'even', 'still', 'already', 'always', 'never', 'ever',
    "i'm", "it's", "that's", "we're", "they're", "isn't", "aren't",
    "wasn't", "weren't", "haven't", "hasn't", "hadn't", "won't",
    "wouldn't", "don't", "doesn't", "didn't", "can't", "couldn't",
    "shouldn't", "mightn't", "mustn't", 'like', 'really', 'actually',
    'basically', 'literally', 'totally', 'absolutely', 'definitely',
]);

/**
 * Extract meaningful keywords from text.
 * Filters stop words and returns unique significant terms.
 */
export function extractKeywords(text: string, excludeList?: string[]): string[] {
    const excludeSet = new Set([
        ...STOP_WORDS,
        ...(excludeList || []).map(w => w.toLowerCase()),
    ]);

    // Tokenize and clean
    const words = text
        .toLowerCase()
        .replace(/[^\w\s'-]/g, ' ')
        .split(/\s+/)
        .filter(word =>
            word.length > 2 &&
            !excludeSet.has(word) &&
            !/^\d+$/.test(word) // Exclude pure numbers
        );

    // Return unique keywords
    return [...new Set(words)];
}

/**
 * Extract keywords with their importance score based on frequency.
 */
export function extractKeywordsWithScores(
    text: string,
    excludeList?: string[]
): Array<{ keyword: string; score: number }> {
    const keywords = extractKeywords(text, excludeList);
    const frequency: Record<string, number> = {};

    // Count occurrences
    const allWords = text.toLowerCase().split(/\s+/);
    for (const word of allWords) {
        if (keywords.includes(word)) {
            frequency[word] = (frequency[word] || 0) + 1;
        }
    }

    // Calculate scores based on frequency
    const maxFreq = Math.max(...Object.values(frequency), 1);

    return keywords.map(keyword => ({
        keyword,
        score: (frequency[keyword] || 1) / maxFreq,
    }));
}

// ============================================================================
// MATCHING ALGORITHM
// ============================================================================

/**
 * Calculate match score between keywords and a media item.
 */
function calculateMatchScore(
    keywords: string[],
    media: MediaLibraryItem
): { score: number; matchedKeywords: string[] } {
    const matchedKeywords: string[] = [];
    let totalScore = 0;

    // Search in filename
    const filenameLower = media.filename.toLowerCase();
    for (const keyword of keywords) {
        if (filenameLower.includes(keyword)) {
            matchedKeywords.push(keyword);
            totalScore += 0.5;
        }
    }

    // Search in tags (higher weight)
    if (media.tags) {
        const tagsLower = media.tags.map(t => t.toLowerCase());
        for (const keyword of keywords) {
            if (tagsLower.some(tag => tag.includes(keyword) || keyword.includes(tag))) {
                if (!matchedKeywords.includes(keyword)) {
                    matchedKeywords.push(keyword);
                }
                totalScore += 1.0;
            }
        }
    }

    // Search in description
    if (media.description) {
        const descLower = media.description.toLowerCase();
        for (const keyword of keywords) {
            if (descLower.includes(keyword)) {
                if (!matchedKeywords.includes(keyword)) {
                    matchedKeywords.push(keyword);
                }
                totalScore += 0.3;
            }
        }
    }

    // Normalize score
    const normalizedScore = Math.min(1, totalScore / Math.max(keywords.length, 1));

    return {
        score: normalizedScore,
        matchedKeywords,
    };
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Find B-roll suggestions for transcription segments.
 * Matches keywords from speech to media library content.
 */
export function findBrollSuggestions(
    segments: TranscriptionSegment[],
    mediaLibrary: MediaLibraryItem[],
    config: BrollMatchingConfig = DEFAULT_BROLL_CONFIG
): BrollSuggestion[] {
    const suggestions: BrollSuggestion[] = [];

    for (const segment of segments) {
        // Extract keywords from this segment
        const keywords = extractKeywords(segment.text, config.excludeKeywords);

        if (keywords.length === 0) continue;

        // Score each media item against keywords
        const scored: Array<{
            media: MediaLibraryItem;
            score: number;
            matchedKeywords: string[];
        }> = [];

        for (const media of mediaLibrary) {
            const { score, matchedKeywords } = calculateMatchScore(keywords, media);

            if (score >= config.minRelevance && matchedKeywords.length > 0) {
                scored.push({ media, score, matchedKeywords });
            }
        }

        // Sort by score and take top N
        scored.sort((a, b) => b.score - a.score);
        const topMatches = scored.slice(0, config.maxSuggestionsPerSegment);

        // Convert to suggestions
        for (const match of topMatches) {
            suggestions.push({
                mediaId: match.media.id,
                mediaUrl: match.media.url,
                thumbnailUrl: match.media.thumbnailUrl,
                mediaType: match.media.type,
                relevanceScore: match.score,
                matchedKeywords: match.matchedKeywords,
                suggestedInsertFrame: Math.floor(segment.startTime * config.fps),
                suggestedDuration: segment.endTime - segment.startTime,
                matchedText: segment.text,
            });
        }
    }

    // Remove duplicates (same media suggested for similar segments)
    const uniqueSuggestions = deduplicateSuggestions(suggestions);

    return uniqueSuggestions;
}

/**
 * Remove duplicate suggestions for the same media in close proximity.
 */
function deduplicateSuggestions(suggestions: BrollSuggestion[]): BrollSuggestion[] {
    const seen = new Map<string, BrollSuggestion>();
    const result: BrollSuggestion[] = [];

    for (const suggestion of suggestions) {
        const key = suggestion.mediaId;
        const existing = seen.get(key);

        if (!existing) {
            seen.set(key, suggestion);
            result.push(suggestion);
        } else {
            // Keep the one with higher score
            if (suggestion.relevanceScore > existing.relevanceScore) {
                const index = result.indexOf(existing);
                result[index] = suggestion;
                seen.set(key, suggestion);
            }
        }
    }

    return result;
}

/**
 * Fetch media library from API and find suggestions.
 * This is the main entry point for the UI.
 */
export async function suggestBrollFromTranscription(
    segments: TranscriptionSegment[],
    config: BrollMatchingConfig = DEFAULT_BROLL_CONFIG
): Promise<BrollSuggestion[]> {
    // Fetch media library
    const response = await fetch('/api/media');
    if (!response.ok) {
        throw new Error('Failed to fetch media library');
    }

    const mediaData = await response.json();
    const mediaLibrary: MediaLibraryItem[] = mediaData.items?.map((item: {
        id: string;
        url: string;
        thumbnailUrl?: string;
        type: string;
        filename?: string;
        name?: string;
        tags?: string[];
        description?: string;
    }) => ({
        id: item.id,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        type: item.type === 'video' ? 'video' : 'image',
        filename: item.filename || item.name || '',
        tags: item.tags || [],
        description: item.description || '',
    })) || [];

    return findBrollSuggestions(segments, mediaLibrary, config);
}
