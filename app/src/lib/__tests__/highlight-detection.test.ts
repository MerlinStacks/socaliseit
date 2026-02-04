/**
 * Highlight Detection Service Tests
 * Tests for the AI-powered highlight extraction logic.
 */

import { describe, it, expect } from 'vitest';
import {
    detectHighlightsHeuristic,
    generatePlatformClips,
    type Highlight,
    type HighlightDetectionConfig,
} from '../ai/highlight-detection';

describe('highlight-detection', () => {
    const DEFAULT_CONFIG: HighlightDetectionConfig = {
        fps: 30,
        totalFrames: 3600, // 2 minutes
        minDuration: 5,
        maxDuration: 60,
        numHighlights: 3,
    };

    describe('detectHighlightsHeuristic', () => {
        it('should return the requested number of highlights', () => {
            const config = { ...DEFAULT_CONFIG, numHighlights: 3 };
            const result = detectHighlightsHeuristic(config);

            expect(result).toHaveLength(3);
        });

        it('should limit highlights to available strategy points', () => {
            const config = { ...DEFAULT_CONFIG, numHighlights: 10 };
            const result = detectHighlightsHeuristic(config);

            // Default strategy has 3 points, so max 3 highlights
            expect(result.length).toBeLessThanOrEqual(3);
        });

        it('should generate valid highlight objects', () => {
            const result = detectHighlightsHeuristic(DEFAULT_CONFIG);

            for (const highlight of result) {
                expect(highlight.id).toBeDefined();
                expect(highlight.startFrame).toBeGreaterThanOrEqual(0);
                expect(highlight.endFrame).toBeGreaterThan(highlight.startFrame);
                expect(highlight.startTime).toBeGreaterThanOrEqual(0);
                expect(highlight.endTime).toBeGreaterThan(highlight.startTime);
                expect(highlight.score).toBeGreaterThanOrEqual(0);
                expect(highlight.score).toBeLessThanOrEqual(1);
                expect(['hook', 'peak', 'climax', 'closing', 'generic']).toContain(highlight.type);
                expect(highlight.reason).toBeDefined();
            }
        });

        it('should use platform-specific strategies for TikTok', () => {
            const config = { ...DEFAULT_CONFIG, platform: 'tiktok' as const };
            const result = detectHighlightsHeuristic(config);

            // First highlight should be a "hook" at position 0
            expect(result[0].type).toBe('hook');
            expect(result[0].startTime).toBe(0);
        });

        it('should use platform-specific strategies for YouTube', () => {
            const config = { ...DEFAULT_CONFIG, platform: 'youtube' as const, numHighlights: 4 };
            const result = detectHighlightsHeuristic(config);

            // YouTube strategy has 4 points
            expect(result.length).toBeLessThanOrEqual(4);
        });

        it('should include reasons for each highlight type', () => {
            const config = { ...DEFAULT_CONFIG, numHighlights: 3 };
            const result = detectHighlightsHeuristic(config);

            for (const highlight of result) {
                expect(highlight.reason.length).toBeGreaterThan(0);
            }
        });
    });

    describe('generatePlatformClips', () => {
        const mockHighlights: Highlight[] = [
            {
                id: 'h1',
                startFrame: 0,
                endFrame: 1800, // 60 seconds at 30fps
                startTime: 0,
                endTime: 60,
                score: 0.9,
                type: 'hook',
                reason: 'Test hook',
                signals: { audioEnergy: 0.8 },
            },
            {
                id: 'h2',
                startFrame: 2400,
                endFrame: 3600, // 40 seconds
                startTime: 80,
                endTime: 120,
                score: 0.85,
                type: 'peak',
                reason: 'Test peak',
                signals: { audioEnergy: 0.9 },
            },
        ];

        it('should generate clips for each highlight', () => {
            const clips = generatePlatformClips(mockHighlights, 60, DEFAULT_CONFIG);

            expect(clips).toHaveLength(2);
        });

        it('should trim clips to platform max duration', () => {
            const platformMaxDuration = 30; // 30 second max
            const clips = generatePlatformClips(mockHighlights, platformMaxDuration, DEFAULT_CONFIG);

            for (const clip of clips) {
                const durationFrames = clip.endFrame - clip.startFrame;
                const durationSeconds = durationFrames / DEFAULT_CONFIG.fps;
                expect(durationSeconds).toBeLessThanOrEqual(platformMaxDuration);
            }
        });

        it('should preserve scores and reasons', () => {
            const clips = generatePlatformClips(mockHighlights, 60, DEFAULT_CONFIG);

            expect(clips[0].score).toBe(0.9);
            expect(clips[0].reason).toBe('Test hook');
            expect(clips[1].score).toBe(0.85);
            expect(clips[1].reason).toBe('Test peak');
        });

        it('should ensure clips stay within video bounds', () => {
            const clips = generatePlatformClips(mockHighlights, 60, DEFAULT_CONFIG);

            for (const clip of clips) {
                expect(clip.startFrame).toBeGreaterThanOrEqual(0);
                expect(clip.endFrame).toBeLessThanOrEqual(DEFAULT_CONFIG.totalFrames);
            }
        });

        it('should handle empty highlights array', () => {
            const clips = generatePlatformClips([], 60, DEFAULT_CONFIG);

            expect(clips).toHaveLength(0);
        });
    });
});
