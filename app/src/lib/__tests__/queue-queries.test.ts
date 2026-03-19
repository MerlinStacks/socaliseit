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
        // Current time is 14:00 UTC — some today slots are in the past
        const now = new Date();
        const result = generateWeeklySchedule('org-1', 21, ['instagram']);

        // All returned dates must be strictly after `now`
        const pastSlots = result.filter(s => s.date.getTime() <= now.getTime());
        expect(pastSlots).toHaveLength(0);

        // And we should have fewer than 21 because some today-slots were skipped
        expect(result.length).toBeLessThanOrEqual(21);
        expect(result.length).toBeGreaterThan(0);
    });
});
