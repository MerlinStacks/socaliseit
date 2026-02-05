/**
 * Unicode-Aware Character Counter
 * 
 * Handles emoji and Unicode character counting correctly for platform limits.
 * Different platforms count characters differently:
 * - Twitter/X: Counts grapheme clusters (visual characters)
 * - Most others: Use UTF-16 code units (JavaScript default)
 * 
 * Why: Users see emoji as single characters but JavaScript's .length
 * counts them as 2+ characters due to UTF-16 surrogate pairs.
 */

import GraphemeSplitter from 'grapheme-splitter';

const splitter = new GraphemeSplitter();

/**
 * Count characters using platform-specific rules
 * 
 * @param text - The text to count
 * @param platform - Platform name for platform-specific counting rules
 * @returns Character count according to platform rules
 */
export function countCharacters(text: string, platform: string): number {
    // Twitter/X and Bluesky count grapheme clusters (visual characters)
    // This means emoji like 👨‍👩‍👧‍👦 count as 1, not 11
    if (platform === 'twitter' || platform === 'bluesky') {
        return splitter.countGraphemes(text);
    }

    // Most platforms use UTF-16 code unit counting (JavaScript default)
    return text.length;
}

/**
 * Get detailed character count information
 * Useful for showing users the difference between visual and encoded length
 * 
 * @param text - The text to analyze
 * @returns Object with visual (grapheme) count and encoded (UTF-16) count
 */
export function getCharacterCounts(text: string): { visual: number; encoded: number } {
    return {
        visual: splitter.countGraphemes(text),
        encoded: text.length,
    };
}

/**
 * Check if text contains complex emoji that affect character counting
 * 
 * @param text - The text to check
 * @returns true if text contains emoji that span multiple code units
 */
export function hasComplexEmoji(text: string): boolean {
    const visual = splitter.countGraphemes(text);
    const encoded = text.length;
    return visual !== encoded;
}

/**
 * Split text into an array of grapheme clusters (visual characters)
 * Useful for properly truncating text with emoji
 * 
 * @param text - The text to split
 * @returns Array of grapheme clusters
 */
export function splitIntoGraphemes(text: string): string[] {
    return splitter.splitGraphemes(text);
}

/**
 * Truncate text to a maximum number of visual characters
 * Properly handles emoji to avoid breaking multi-code-unit characters
 * 
 * @param text - The text to truncate
 * @param maxLength - Maximum number of visual characters
 * @param suffix - Suffix to add when truncated (default: '...')
 * @returns Truncated text
 */
export function truncateByGraphemes(
    text: string,
    maxLength: number,
    suffix: string = '...'
): string {
    const graphemes = splitter.splitGraphemes(text);

    if (graphemes.length <= maxLength) {
        return text;
    }

    // Account for suffix length in truncation
    const suffixGraphemes = splitter.countGraphemes(suffix);
    const targetLength = maxLength - suffixGraphemes;

    if (targetLength <= 0) {
        return suffix;
    }

    return graphemes.slice(0, targetLength).join('') + suffix;
}
