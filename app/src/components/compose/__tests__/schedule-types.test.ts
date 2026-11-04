/**
 * Schedule Types Tests
 * Covers how the scheduler picks suggestions for the date on screen.
 */

import { describe, it, expect } from 'vitest';
import { resolveSuggestionsForDay, type OptimalTimesSource } from '@/components/compose/schedule-types';

const source: OptimalTimesSource = {
    suggestions: [{ time: '13:00', label: '1:00 PM', lift: 30 }],
    dataPoints: 638,
    byDayOfWeek: Array.from({ length: 7 }, (_, day) => ({
        suggestions: day === 4 ? [{ time: '16:11', label: 'Thu 4:11 PM', lift: 200, dayOfWeek: 4 }] : [],
        dataPoints: day === 4 ? 71 : 12,
    })),
};

describe('resolveSuggestionsForDay', () => {
    it('shows the ranking of the selected weekday', () => {
        const resolved = resolveSuggestionsForDay(source, 4);

        expect(resolved.times).toEqual([{ time: '16:11', label: 'Thu 4:11 PM', lift: 200, dayOfWeek: 4 }]);
        expect(resolved.isDaySpecific).toBe(true);
        expect(resolved.dataPoints).toBe(71);
    });

    it('falls back to the overall ranking when the weekday has no history', () => {
        const resolved = resolveSuggestionsForDay(source, 1);

        expect(resolved.times).toEqual([{ time: '13:00', label: '1:00 PM', lift: 30 }]);
        expect(resolved.isDaySpecific).toBe(false);
        expect(resolved.dataPoints).toBe(638);
    });

    it('survives a response with no per-weekday data at all', () => {
        expect(resolveSuggestionsForDay(undefined, 3)).toEqual({
            times: [],
            dataPoints: 0,
            isDaySpecific: false,
        });
        expect(resolveSuggestionsForDay({ suggestions: [], dataPoints: 0 }, 3).times).toEqual([]);
    });
});
