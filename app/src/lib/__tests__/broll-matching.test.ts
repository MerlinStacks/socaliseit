/**
 * B-Roll Matching Service Tests
 * Tests for keyword extraction and media library matching.
 */

import { describe, it, expect } from 'vitest';
import {
    extractKeywords,
    extractKeywordsWithScores,
    findBrollSuggestions,
    type TranscriptionSegment,
    type MediaLibraryItem,
} from '../ai/broll-matching';

describe('broll-matching', () => {
    describe('extractKeywords', () => {
        it('should extract meaningful keywords from text', () => {
            const text = 'Today we explore the beautiful mountains and valleys';
            const keywords = extractKeywords(text);

            expect(keywords).toContain('today');
            expect(keywords).toContain('explore');
            expect(keywords).toContain('beautiful');
            expect(keywords).toContain('mountains');
            expect(keywords).toContain('valleys');
        });

        it('should filter out stop words', () => {
            const text = 'The quick brown fox jumps over the lazy dog';
            const keywords = extractKeywords(text);

            // 'the' is a stop word
            expect(keywords).not.toContain('the');
            expect(keywords).toContain('quick');
            expect(keywords).toContain('brown');
            expect(keywords).toContain('fox');
            expect(keywords).toContain('jumps');
            expect(keywords).toContain('lazy');
            expect(keywords).toContain('dog');
        });

        it('should filter words shorter than 3 characters', () => {
            const text = 'I am in a new car today';
            const keywords = extractKeywords(text);

            expect(keywords).not.toContain('am');
            expect(keywords).not.toContain('in');
            expect(keywords).toContain('new');
            expect(keywords).toContain('car');
            expect(keywords).toContain('today');
        });

        it('should filter out pure numbers', () => {
            const text = 'There are 500 sheep and 1000 cows';
            const keywords = extractKeywords(text);

            expect(keywords).not.toContain('500');
            expect(keywords).not.toContain('1000');
            expect(keywords).toContain('sheep');
            expect(keywords).toContain('cows');
        });

        it('should return unique keywords', () => {
            const text = 'mountain mountain mountain peak peak';
            const keywords = extractKeywords(text);

            const mountainCount = keywords.filter(k => k === 'mountain').length;
            const peakCount = keywords.filter(k => k === 'peak').length;

            expect(mountainCount).toBe(1);
            expect(peakCount).toBe(1);
        });

        it('should respect custom exclude list', () => {
            const text = 'Today we explore the beautiful mountains';
            const excludeList = ['explore', 'beautiful'];
            const keywords = extractKeywords(text, excludeList);

            expect(keywords).not.toContain('explore');
            expect(keywords).not.toContain('beautiful');
            expect(keywords).toContain('today');
            expect(keywords).toContain('mountains');
        });

        it('should handle empty text', () => {
            const keywords = extractKeywords('');
            expect(keywords).toHaveLength(0);
        });

        it('should handle text with only stop words', () => {
            const text = 'the a an is are was were';
            const keywords = extractKeywords(text);
            expect(keywords).toHaveLength(0);
        });
    });

    describe('extractKeywordsWithScores', () => {
        it('should return keywords with frequency-based scores', () => {
            const text = 'mountain climbing mountain peak mountain valley';
            const result = extractKeywordsWithScores(text);

            const mountainEntry = result.find(r => r.keyword === 'mountain');
            const peakEntry = result.find(r => r.keyword === 'peak');

            expect(mountainEntry).toBeDefined();
            expect(peakEntry).toBeDefined();
            // 'mountain' appears 3 times, should have higher score
            expect(mountainEntry!.score).toBeGreaterThan(peakEntry!.score);
        });

        it('should normalize scores between 0 and 1', () => {
            const text = 'testing testing testing one two three';
            const result = extractKeywordsWithScores(text);

            for (const entry of result) {
                expect(entry.score).toBeGreaterThanOrEqual(0);
                expect(entry.score).toBeLessThanOrEqual(1);
            }
        });

        it('should assign max score to most frequent keyword', () => {
            const text = 'mountain mountain mountain peak';
            const result = extractKeywordsWithScores(text);

            const mountainEntry = result.find(r => r.keyword === 'mountain');
            expect(mountainEntry!.score).toBe(1);
        });
    });

    describe('findBrollSuggestions', () => {
        const mockSegments: TranscriptionSegment[] = [
            { id: 0, text: 'Look at the beautiful mountain landscape', startTime: 0, endTime: 5 },
            { id: 1, text: 'Now we explore the ocean waves', startTime: 5, endTime: 10 },
        ];

        const mockMediaLibrary: MediaLibraryItem[] = [
            {
                id: 'media-1',
                url: '/media/mountain-view.mp4',
                type: 'video',
                filename: 'mountain-view.mp4',
                tags: ['nature', 'mountain', 'landscape'],
                description: 'Beautiful mountain scenery',
            },
            {
                id: 'media-2',
                url: '/media/ocean-sunset.mp4',
                type: 'video',
                filename: 'ocean-sunset.mp4',
                tags: ['nature', 'ocean', 'waves'],
                description: 'Ocean waves at sunset',
            },
            {
                id: 'media-3',
                url: '/media/city-timelapse.mp4',
                type: 'video',
                filename: 'city-timelapse.mp4',
                tags: ['urban', 'city', 'timelapse'],
                description: 'City traffic timelapse',
            },
        ];

        it('should match segments to relevant media', () => {
            const suggestions = findBrollSuggestions(mockSegments, mockMediaLibrary);

            expect(suggestions.length).toBeGreaterThan(0);

            // Should find mountain-related media for first segment
            const mountainMatches = suggestions.filter(s => s.mediaId === 'media-1');
            expect(mountainMatches.length).toBeGreaterThan(0);
        });

        it('should include matched keywords in suggestions', () => {
            const suggestions = findBrollSuggestions(mockSegments, mockMediaLibrary);

            for (const suggestion of suggestions) {
                expect(suggestion.matchedKeywords.length).toBeGreaterThan(0);
            }
        });

        it('should calculate relevance scores', () => {
            const suggestions = findBrollSuggestions(mockSegments, mockMediaLibrary);

            for (const suggestion of suggestions) {
                expect(suggestion.relevanceScore).toBeGreaterThanOrEqual(0);
                expect(suggestion.relevanceScore).toBeLessThanOrEqual(1);
            }
        });

        it('should calculate correct suggested insert frames', () => {
            const fps = 30;
            const suggestions = findBrollSuggestions(mockSegments, mockMediaLibrary, {
                minRelevance: 0.3,
                maxSuggestionsPerSegment: 3,
                fps,
            });

            for (const suggestion of suggestions) {
                // Insert frame should be at segment start time
                const segmentStartFrame = Math.floor(
                    mockSegments.find(s => s.text === suggestion.matchedText)!.startTime * fps
                );
                expect(suggestion.suggestedInsertFrame).toBe(segmentStartFrame);
            }
        });

        it('should respect maxSuggestionsPerSegment config', () => {
            const suggestions = findBrollSuggestions(mockSegments, mockMediaLibrary, {
                minRelevance: 0.1, // Low threshold to get many matches
                maxSuggestionsPerSegment: 1,
                fps: 30,
            });

            // With 2 segments and max 1 per segment, should have at most 2
            expect(suggestions.length).toBeLessThanOrEqual(2);
        });

        it('should filter suggestions below minimum relevance', () => {
            const suggestions = findBrollSuggestions(mockSegments, mockMediaLibrary, {
                minRelevance: 0.99, // Very high threshold
                maxSuggestionsPerSegment: 3,
                fps: 30,
            });

            // Should have very few or no matches
            for (const suggestion of suggestions) {
                expect(suggestion.relevanceScore).toBeGreaterThanOrEqual(0.99);
            }
        });

        it('should handle empty segments', () => {
            const suggestions = findBrollSuggestions([], mockMediaLibrary);
            expect(suggestions).toHaveLength(0);
        });

        it('should handle empty media library', () => {
            const suggestions = findBrollSuggestions(mockSegments, []);
            expect(suggestions).toHaveLength(0);
        });

        it('should deduplicate suggestions for same media', () => {
            const duplicateSegments: TranscriptionSegment[] = [
                { id: 0, text: 'mountain peak mountain', startTime: 0, endTime: 3 },
                { id: 1, text: 'another mountain view', startTime: 3, endTime: 6 },
            ];

            const suggestions = findBrollSuggestions(duplicateSegments, mockMediaLibrary);

            // Count occurrences of each media ID
            const mediaIdCounts = new Map<string, number>();
            for (const s of suggestions) {
                mediaIdCounts.set(s.mediaId, (mediaIdCounts.get(s.mediaId) || 0) + 1);
            }

            // Each media ID should appear at most once (deduplicated)
            for (const count of mediaIdCounts.values()) {
                expect(count).toBe(1);
            }
        });
    });
});
