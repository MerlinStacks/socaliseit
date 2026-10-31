// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarDateRange } from '../calendar-date-range';

afterEach(() => { vi.unstubAllEnvs(); });

describe('viewer-local calendar boundaries', () => {
    const days = [
        ['UTC', '2026-09-28', '2026-09-28T00:00:00.000Z', '2026-09-28T23:59:59.999Z'],
        ['Australia/Sydney', '2026-09-29', '2026-09-28T14:00:00.000Z', '2026-09-29T13:59:59.999Z'],
        ['America/Los_Angeles', '2026-09-28', '2026-09-28T07:00:00.000Z', '2026-09-29T06:59:59.999Z'],
        ['Asia/Kathmandu', '2026-09-28', '2026-09-27T18:15:00.000Z', '2026-09-28T18:14:59.999Z'],
        ['America/New_York', '2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T03:59:59.999Z'],
        ['America/New_York', '2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T04:59:59.999Z'],
        ['Australia/Sydney', '2026-10-04', '2026-10-03T14:00:00.000Z', '2026-10-04T12:59:59.999Z'],
        ['Australia/Sydney', '2026-04-05', '2026-04-04T13:00:00.000Z', '2026-04-05T13:59:59.999Z'],
    ];
    it.each(days)('uses the full local day in %s on %s, including DST', (timezone, day, expectedStart, expectedEnd) => {
        for (const serverTimezone of ['UTC', 'Australia/Sydney', 'America/Los_Angeles']) {
            vi.stubEnv('TZ', serverTimezone);
            const { start, end } = calendarDateRange(day, day, timezone);
            expect(start.toISOString()).toBe(expectedStart);
            expect(end.toISOString()).toBe(expectedEnd);
            expect(Object.getPrototypeOf(start)).toBe(Date.prototype);
        }
    });
    it('preserves browser-supplied ISO day boundaries instead of re-rounding them in server time', () => {
        vi.stubEnv('TZ', 'America/Los_Angeles');
        const { start, end } = calendarDateRange('2026-09-28T14:00:00.000Z', '2026-09-29T13:59:59.999Z', 'Australia/Sydney');
        expect(start.toISOString()).toBe('2026-09-28T14:00:00.000Z');
        expect(end.toISOString()).toBe('2026-09-29T13:59:59.999Z');
    });
    it('defaults to seven viewer-local days across a DST change', () => {
        const { start, end } = calendarDateRange(null, null, 'Australia/Sydney', new Date('2026-09-28T15:00:00Z'));
        expect(start.toISOString()).toBe('2026-09-28T14:00:00.000Z');
        expect(end.toISOString()).toBe('2026-10-05T12:59:59.999Z');
    });
    it.each([
        ['', '2026-09-28', 'UTC'],
        ['not-a-date', '2026-09-28', 'UTC'],
        ['2026-02-30', '2026-03-01', 'UTC'],
        ['2026-09-28', 'not-a-date', 'UTC'],
        ['2026-09-29', '2026-09-28', 'UTC'],
        ['2026-09-28', '2026-09-28', 'Not/A_Timezone'],
    ])('rejects invalid range inputs (%s, %s, %s)', (start, end, timezone) => {
        expect(() => calendarDateRange(start, end, timezone)).toThrow(RangeError);
    });
});
