import { afterEach, describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';
import { formatDisplayDate, formatDisplayDistance, parseDisplayDate, resolveDisplayDate } from '../display-date';

const valid = '2026-09-14T10:30:00.000Z';
const invalidDates = ['malformed', '', '   ', null, undefined, new Date(NaN), NaN, Infinity, {}, true];

afterEach(() => vi.useRealTimers());

describe('safe display dates', () => {
    it.each(invalidDates)('uses a neutral placeholder for invalid input %s', value => {
        expect(parseDisplayDate(value)).toBeNull();
        expect(formatDisplayDate(value, 'MMM d, h:mm a')).toBe('—');
        expect(formatDisplayDistance(value)).toBe('—');
    });

    it.each(invalidDates)('uses a validated fallback for invalid input %s', value => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-14T11:30:00Z'));
        expect(resolveDisplayDate(value, valid)?.toISOString()).toBe(valid);
        expect(formatDisplayDate(value, 'MMM d, h:mm a', valid)).toBe(format(new Date(valid), 'MMM d, h:mm a'));
        expect(formatDisplayDistance(value, valid)).toBe('about 1 hour ago');
    });

    it('validates the fallback too and handles missing arguments', () => {
        expect(resolveDisplayDate(undefined)).toBeNull();
        expect(formatDisplayDate('bad', 'yyyy-MM-dd', 'also bad')).toBe('—');
        expect(formatDisplayDistance(null, '')).toBe('—');
    });

    it('preserves valid strings, Dates, and numeric timestamps, including epoch zero', () => {
        for (const value of [valid, new Date(valid), Date.parse(valid)]) {
            expect(parseDisplayDate(value)?.toISOString()).toBe(valid);
            expect(resolveDisplayDate(value, '2020-01-01')?.toISOString()).toBe(valid);
            expect(formatDisplayDate(value, 'MMM d, h:mm a')).toBe(format(new Date(valid), 'MMM d, h:mm a'));
        }
        expect(parseDisplayDate(0)?.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });

    it('preserves relative formatting for future dates', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-14T09:30:00Z'));
        expect(formatDisplayDistance(valid)).toBe('in about 1 hour');
    });
});
