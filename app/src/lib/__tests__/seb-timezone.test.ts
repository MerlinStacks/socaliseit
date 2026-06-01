import { describe, expect, it } from 'vitest';
import { formatSebLocalDate, isSameSebLocalDate, normalizeSebTimezone } from '@/lib/ai/seb-advisor';

describe('Seb timezone helpers', () => {
    it('falls back to UTC for missing or invalid timezones', () => {
        expect(normalizeSebTimezone(null)).toBe('UTC');
        expect(normalizeSebTimezone('Not/AZone')).toBe('UTC');
    });

    it('formats UTC timestamps in the organization timezone', () => {
        const value = new Date('2026-05-28T23:30:00.000Z');

        expect(formatSebLocalDate(value, 'Australia/Sydney')).toContain('29 May 2026');
        expect(formatSebLocalDate(value, 'Europe/London')).toContain('29 May 2026');
        expect(formatSebLocalDate(value, 'America/New_York')).toContain('28 May 2026');
    });

    it('compares report recency by local day instead of rolling UTC day', () => {
        const latest = new Date('2026-05-28T23:30:00.000Z');
        const now = new Date('2026-05-29T01:00:00.000Z');

        expect(isSameSebLocalDate(latest, now, 'Australia/Sydney')).toBe(true);
        expect(isSameSebLocalDate(latest, now, 'America/New_York')).toBe(true);
        expect(isSameSebLocalDate(latest, now, 'UTC')).toBe(false);
    });
});
