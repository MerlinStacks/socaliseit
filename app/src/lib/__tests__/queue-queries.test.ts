/**
 * Tests for queue-queries.ts — generateWeeklySchedule()
 * Why: This function generates posting schedule suggestions. Bugs here
 * can suggest past times or wrong slot counts, breaking the UX.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateWeeklySchedule } from '@/lib/queue-queries';

describe('generateWeeklySchedule', () => {
    beforeEach(() => {
        // Fix time to Wednesday 2026-03-25 14:00:00 UTC
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-25T14:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the correct number of slots for postsPerWeek=3', () => {
        const result = generateWeeklySchedule('org-1', 3, ['instagram']);
        expect(result).toHaveLength(3);
    });

    it('returns at most postsPerWeek suggestions', () => {
        const result = generateWeeklySchedule('org-1', 5, ['instagram', 'tiktok']);
        expect(result.length).toBeLessThanOrEqual(5);
    });

    it('never returns dates in the past', () => {
        const now = new Date();
        const result = generateWeeklySchedule('org-1', 10, ['instagram']);

        for (const suggestion of result) {
            expect(suggestion.date.getTime()).toBeGreaterThan(now.getTime());
        }
    });

    it('includes the preferred platforms in each suggestion', () => {
        const platforms = ['instagram', 'facebook'];
        const result = generateWeeklySchedule('org-1', 3, platforms);

        for (const suggestion of result) {
            expect(suggestion.platforms).toEqual(platforms);
        }
    });

    it('includes a human-readable reason for each slot', () => {
        const result = generateWeeklySchedule('org-1', 3, ['instagram']);

        for (const suggestion of result) {
            expect(suggestion.reason).toBeTruthy();
            expect(typeof suggestion.reason).toBe('string');
        }
    });

    it('returns empty array when postsPerWeek is 0', () => {
        const result = generateWeeklySchedule('org-1', 0, ['instagram']);
        expect(result).toHaveLength(0);
    });

    it('skips past slots on the current day', () => {
        // Current time is 14:00 UTC, so 9:00 and 12:00 today should be skipped
        const result = generateWeeklySchedule('org-1', 21, ['instagram']);

        const todaySlots = result.filter(s => {
            const d = s.date;
            return d.getDate() === 25 && d.getMonth() === 2 && d.getFullYear() === 2026;
        });

        // Only 19:30 today should be valid (9:00 and 12:00 are in the past)
        expect(todaySlots.length).toBe(1);
        expect(todaySlots[0].date.getHours()).toBe(19);
    });
});
