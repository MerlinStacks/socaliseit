/**
 * Optimal Times Engine Tests
 * Covers the per-weekday ranking the scheduler relies on: buckets must line up
 * with the weekday of the date the user selected, in the user's timezone.
 */

import { describe, it, expect } from 'vitest';
import {
    MIN_POSTS_PER_WEEKDAY,
    WEEKDAY_LOOKBACK_DAYS,
    OVERALL_LOOKBACK_DAYS,
    buildFallbackSuggestions,
    buildSuggestions,
    buildSuggestionsByDay,
    type RankedPost,
} from '@/lib/optimal-times';
import { getWeekdayInTimezone } from '@/lib/timezone-utils';

const SYDNEY = 'Australia/Sydney';

/** Build `count` posts at the same UTC instant with the given engagement rate. */
function postsAt(publishedAt: string, count: number, engagementRate: number): RankedPost[] {
    return Array.from({ length: count }, () => ({
        publishedAt: new Date(publishedAt),
        analytics: { engagementRate, likes: 0, comments: 0, impressions: 0 },
    }));
}

/** Hour of a "HH:MM" suggestion time. */
function hourOf(time: string): number {
    return parseInt(time.split(':')[0], 10);
}

/**
 * Weekday instants in November 2026 (dates are arbitrary, weekdays are not).
 * 2026-11-02 is a Monday, so +1 day steps walk the week.
 */
const TUESDAY = '2026-11-03T20:00:00Z';
const WEDNESDAY = '2026-11-04T12:00:00Z';
const THURSDAY_EVENING = '2026-11-05T20:00:00Z';
const THURSDAY_MORNING = '2026-11-05T09:00:00Z';

describe('buildSuggestionsByDay', () => {
    const posts = [
        ...postsAt(THURSDAY_EVENING, 5, 10),   // Thu 20:00 — strong
        ...postsAt(THURSDAY_MORNING, 5, 2),    // Thu 09:00 — weak
        ...postsAt(WEDNESDAY, 5, 100),         // Wed 12:00 — much stronger overall
        ...postsAt(TUESDAY, 3, 8),             // Tue — below the minimum sample
    ];

    it('returns one bucket per weekday, indexed by day of week', () => {
        const buckets = buildSuggestionsByDay(posts, 'UTC', 'test');

        expect(buckets).toHaveLength(7);
        expect(buckets.map(b => b.dataPoints)).toEqual([0, 0, 3, 5, 10, 0, 0]);
    });

    it('ranks a weekday from that weekday only', () => {
        const buckets = buildSuggestionsByDay(posts, 'UTC', 'test');

        // Wednesday owns the 12:00 slot; Thursday's ranking must not borrow it,
        // even though Wednesday performs far better overall.
        expect(buckets[4].suggestions.map(s => hourOf(s.time))).toEqual([20]);
        expect(buckets[4].suggestions[0].dayOfWeek).toBe(4);
        expect(buckets[4].suggestions[0].label).toMatch(/^Thu /);

        expect(buckets[3].suggestions[0].dayOfWeek).toBe(3);
        expect(hourOf(buckets[3].suggestions[0].time)).toBe(12);
    });

    it('measures lift against the same weekday, not the whole sample', () => {
        const buckets = buildSuggestionsByDay(posts, 'UTC', 'test');
        const [best] = buckets[4].suggestions;

        // Within Thursdays: 10 vs an average of 6 -> +67%. Against the all-weekday
        // average (~37) the same slot would be negative and dropped entirely.
        expect(best.lift).toBe(67);
        expect(buildSuggestions(posts, 'UTC', 'test').some(s => s.dayOfWeek === 4)).toBe(false);
    });

    it('drops slots that underperform their own weekday', () => {
        const buckets = buildSuggestionsByDay(posts, 'UTC', 'test');

        expect(buckets[4].suggestions.some(s => hourOf(s.time) === 9)).toBe(false);
    });

    it('leaves thin weekdays empty so callers can fall back, keeping the count', () => {
        const buckets = buildSuggestionsByDay(posts, 'UTC', 'test');

        expect(buckets[2].suggestions).toEqual([]);
        expect(buckets[2].dataPoints).toBeLessThan(MIN_POSTS_PER_WEEKDAY);
        expect(buckets[0].suggestions).toEqual([]);
    });

    it('tags every bucket with the weekday it came from', () => {
        const buckets = buildSuggestionsByDay(posts, 'UTC', 'test');

        buckets.forEach((bucket, dayOfWeek) => {
            for (const suggestion of bucket.suggestions) {
                expect(suggestion.dayOfWeek).toBe(dayOfWeek);
            }
        });
    });
});

describe('weekday attribution across timezones', () => {
    /** 2026-11-05T23:30Z is Thursday night in UTC, Friday morning in Sydney. */
    const LATE_NIGHT_UTC = '2026-11-05T23:30:00Z';

    it('files a post under the weekday of the target timezone', () => {
        expect(getWeekdayInTimezone(new Date(LATE_NIGHT_UTC), 'UTC')).toBe(4);
        expect(getWeekdayInTimezone(new Date(LATE_NIGHT_UTC), SYDNEY)).toBe(5);
    });

    it('buckets and times suggestions in the selected timezone', () => {
        const posts = postsAt(LATE_NIGHT_UTC, 5, 12);

        const sydney = buildSuggestionsByDay(posts, SYDNEY, 'test');
        expect(sydney[5].dataPoints).toBe(5);
        expect(hourOf(sydney[5].suggestions[0].time)).toBe(10); // 10:30 local

        const utc = buildSuggestionsByDay(posts, 'UTC', 'test');
        expect(utc[5].dataPoints).toBe(0);
        expect(utc[4].dataPoints).toBe(5);
        expect(hourOf(utc[4].suggestions[0].time)).toBe(23);
    });
});

describe('ranking still works overall', () => {
    it('keeps the best slot across all weekdays first', () => {
        const posts = [
            ...postsAt(THURSDAY_EVENING, 5, 10),
            ...postsAt(WEDNESDAY, 5, 100),
        ];
        const suggestions = buildSuggestions(posts, 'UTC', 'test');

        expect(hourOf(suggestions[0].time)).toBe(12);
        expect(suggestions[0].label).toMatch(/^Wed /);
    });

    it('returns platform defaults that carry no weekday claim', () => {
        const fallback = buildFallbackSuggestions('INSTAGRAM', 'test');

        expect(fallback.length).toBeGreaterThan(0);
        expect(fallback.every(s => s.dayOfWeek === undefined)).toBe(true);
        expect(fallback.every(s => !/^[A-Z][a-z]{2} /.test(s.label))).toBe(true);
    });

    it('looks back further for weekdays than for the headline ranking', () => {
        expect(WEEKDAY_LOOKBACK_DAYS).toBeGreaterThan(OVERALL_LOOKBACK_DAYS);
    });
});
