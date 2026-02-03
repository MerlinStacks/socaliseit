/**
 * Celebration System
 * Provides confetti animations for milestone achievements
 * Why: Visual feedback for publishing milestones increases user engagement
 */

'use client';

import { useCallback } from 'react';
import confetti from 'canvas-confetti';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Milestones we track for celebration triggers
 */
interface MilestoneStore {
    /** Total posts published by the user */
    publishedCount: number;
    /** Whether the user has published their first post */
    hasPublishedFirst: boolean;
    /** Increment publish count and set first publish flag */
    incrementPublished: () => void;
    /** Reset milestones (for testing) */
    reset: () => void;
}

/**
 * Persisted milestone store
 * Why: Track user achievements across sessions using localStorage
 */
export const useMilestones = create<MilestoneStore>()(
    persist(
        (set, get) => ({
            publishedCount: 0,
            hasPublishedFirst: false,
            incrementPublished: () => {
                const newCount = get().publishedCount + 1;
                set({
                    publishedCount: newCount,
                    hasPublishedFirst: true,
                });
            },
            reset: () => set({ publishedCount: 0, hasPublishedFirst: false }),
        }),
        { name: 'socialiseit-milestones' }
    )
);

/**
 * Brand colors for confetti particles
 */
const BRAND_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
const GOLD_COLORS = ['#FFD700', '#FFA500', '#F5DEB3'];

/**
 * Confetti celebration presets
 */
export const celebrations = {
    /**
     * First post published - spectacular celebration
     * Why: Make the first publish feel special and memorable
     */
    firstPost: () => {
        const duration = 3000;
        const end = Date.now() + duration;

        const frame = () => {
            // Left cannon
            confetti({
                particleCount: 3,
                angle: 60,
                spread: 55,
                origin: { x: 0, y: 0.8 },
                colors: BRAND_COLORS,
            });
            // Right cannon
            confetti({
                particleCount: 3,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.8 },
                colors: BRAND_COLORS,
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        };
        frame();
    },

    /**
     * Standard post published - subtle gold burst
     * Why: Acknowledge every success without being overwhelming
     */
    postPublished: () => {
        confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.7 },
            colors: GOLD_COLORS,
        });
    },

    /**
     * Milestone achieved (10, 50, 100 posts) - grand celebration
     * Why: Reward consistent usage and create memorable moments
     */
    milestone: () => {
        confetti({
            particleCount: 100,
            spread: 100,
            origin: { y: 0.6 },
            colors: BRAND_COLORS,
        });
    },
};

/** Milestone achievement thresholds */
const MILESTONE_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000];

/**
 * Hook to trigger celebrations based on publish events
 * Why: Encapsulates milestone tracking and celebration logic
 * 
 * @example
 * const { celebratePublish } = useCelebration();
 * // After successful publish:
 * celebratePublish();
 */
export function useCelebration() {
    const { publishedCount, hasPublishedFirst, incrementPublished } = useMilestones();

    /**
     * Trigger appropriate celebration based on milestone state
     * @returns The type of celebration triggered, or null for none
     */
    const celebratePublish = useCallback(() => {
        const wasFirst = !hasPublishedFirst;
        const newCount = publishedCount + 1;

        // Update the store
        incrementPublished();

        // Trigger appropriate celebration
        if (wasFirst) {
            celebrations.firstPost();
            return 'first';
        }

        if (MILESTONE_THRESHOLDS.includes(newCount)) {
            celebrations.milestone();
            return 'milestone';
        }

        // No celebration for regular posts
        return null;
    }, [publishedCount, hasPublishedFirst, incrementPublished]);

    return {
        celebratePublish,
        publishedCount,
        hasPublishedFirst,
    };
}
