/**
 * Tests for schedule-actions.ts — parseDateTimeLocal()
 * Why: This function converts wall-clock date/time to UTC. Bugs here cause
 * posts to schedule at the wrong time, which has been the source of multiple
 * bug fixes (BUG-11, BUG-38, BUG-48).
 */

import { describe, it, expect } from 'vitest';
import { parseDateTimeLocal } from '@/lib/schedule-actions';

describe('parseDateTimeLocal', () => {
    it('parses a valid date and time into a Date object', () => {
        const result = parseDateTimeLocal('2026-03-25', '14:30');
        expect(result).toBeInstanceOf(Date);
        expect(result.getTime()).not.toBeNaN();
    });

    it('throws on empty date string', () => {
        expect(() => parseDateTimeLocal('', '14:30')).toThrow(
            'Invalid date or time input'
        );
    });

    it('throws on empty time string', () => {
        expect(() => parseDateTimeLocal('2026-03-25', '')).toThrow(
            'Invalid date or time input'
        );
    });

    it('throws on malformed date with non-numeric parts', () => {
        expect(() => parseDateTimeLocal('abc-def-ghi', '14:30')).toThrow(
            'Invalid date or time input'
        );
    });

    it('throws on malformed time with non-numeric parts', () => {
        expect(() => parseDateTimeLocal('2026-03-25', 'xx:yy')).toThrow(
            'Invalid date or time input'
        );
    });

    it('produces a valid ISO string', () => {
        const result = parseDateTimeLocal('2026-12-31', '23:59');
        // Should not throw
        const iso = result.toISOString();
        expect(iso).toContain('2026');
    });

    it('handles midnight correctly', () => {
        const result = parseDateTimeLocal('2026-01-01', '00:00');
        expect(result.getTime()).not.toBeNaN();
    });

    it('handles end-of-day correctly', () => {
        const result = parseDateTimeLocal('2026-06-15', '23:59');
        expect(result.getTime()).not.toBeNaN();
    });
});
