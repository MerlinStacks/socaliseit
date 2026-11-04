/**
 * Optimal Posting Times Engine
 * Ranks 30-minute posting slots by historical engagement — overall and, since
 * audiences behave differently on a Thursday than on a Sunday, per weekday.
 *
 * Why: The scheduler shows times for the date the user actually selected, so the
 * per-weekday ranking has to come from the same rules as the overall ranking.
 * Keeping both here means the API, the composer and the tests agree.
 */

import { getWallClockTime, getWeekdayInTimezone } from '@/lib/timezone-utils';

export interface TimeSuggestion {
    time: string;       // "HH:MM" format
    label: string;      // "7:30 PM"
    lift: number;       // % lift vs average engagement
    dayOfWeek?: number; // 0-6 (Sun-Sat) the ranking was derived from
}

/** Suggestions for one weekday. Returned in a fixed 7-item array, index 0 = Sunday. */
export interface WeekdaySuggestions {
    suggestions: TimeSuggestion[];
    dataPoints: number;
}

export type PlatformKey =
    | 'INSTAGRAM'
    | 'FACEBOOK'
    | 'META'
    | 'TIKTOK'
    | 'YOUTUBE'
    | 'PINTEREST'
    | 'GOOGLE_BUSINESS'
    | 'LINKEDIN'
    | 'BLUESKY'
    | 'THREADS'
    | 'MANUAL';

/** Post shape the ranking needs — a published instant plus its engagement. */
export interface RankedPost {
    publishedAt: Date | null;
    analytics: {
        engagementRate: number;
        likes: number;
        comments: number;
        impressions: number;
    } | null;
}

/** Lookback used for the overall ranking. */
export const OVERALL_LOOKBACK_DAYS = 90;

/**
 * Lookback used for the per-weekday ranking.
 * Why: one weekday carries only ~1/7 of the sample, so ranking it on the same
 * 90-day window would throw away most of the evidence.
 */
export const WEEKDAY_LOOKBACK_DAYS = 365;

/**
 * Below this many posts on a weekday the ranking is noise, so the bucket stays
 * empty and callers fall back to the overall ranking.
 */
export const MIN_POSTS_PER_WEEKDAY = 5;

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PLATFORM_FALLBACK_TIMES: Record<PlatformKey, Array<{ time: string; lift: number }>> = {
    INSTAGRAM: [
        { time: '11:00', lift: 18 },
        { time: '18:00', lift: 16 },
        { time: '20:00', lift: 12 },
    ],
    FACEBOOK: [
        { time: '09:00', lift: 14 },
        { time: '13:00', lift: 12 },
        { time: '19:00', lift: 10 },
    ],
    META: [
        { time: '09:00', lift: 14 },
        { time: '13:00', lift: 12 },
        { time: '19:00', lift: 10 },
    ],
    TIKTOK: [
        { time: '15:00', lift: 20 },
        { time: '19:00', lift: 18 },
        { time: '21:00', lift: 15 },
    ],
    YOUTUBE: [
        { time: '14:00', lift: 16 },
        { time: '17:00', lift: 14 },
        { time: '19:00', lift: 12 },
    ],
    PINTEREST: [
        { time: '20:00', lift: 18 },
        { time: '21:00', lift: 16 },
        { time: '12:00', lift: 10 },
    ],
    GOOGLE_BUSINESS: [
        { time: '08:00', lift: 14 },
        { time: '12:00', lift: 12 },
        { time: '17:00', lift: 10 },
    ],
    LINKEDIN: [
        { time: '08:00', lift: 18 },
        { time: '12:00', lift: 14 },
        { time: '17:00', lift: 10 },
    ],
    BLUESKY: [
        { time: '10:00', lift: 14 },
        { time: '15:00', lift: 12 },
        { time: '20:00', lift: 10 },
    ],
    THREADS: [
        { time: '09:00', lift: 16 },
        { time: '13:00', lift: 14 },
        { time: '20:00', lift: 12 },
    ],
    MANUAL: [
        { time: '09:00', lift: 10 },
        { time: '12:00', lift: 10 },
        { time: '19:00', lift: 10 },
    ],
};

/** Format 24-hour time to 12-hour label */
function formatTimeLabel(hour: number, minute: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const minuteStr = minute.toString().padStart(2, '0');
    return `${hour12}:${minuteStr} ${period}`;
}

/** Determine confidence based on number of posts with engagement data */
export function getConfidence(dataPoints: number): 'high' | 'medium' | 'low' {
    if (dataPoints >= 30) return 'high';
    if (dataPoints >= 10) return 'medium';
    return 'low';
}

function seededOffset(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return 5 + (Math.abs(hash) % 15);
}

function addMinutes(time: string, minutesToAdd: number): string {
    const [hour, minute] = time.split(':').map(Number);
    const total = (hour * 60 + minute + minutesToAdd) % (24 * 60);
    const adjustedHour = Math.floor(total / 60);
    const adjustedMinute = total % 60;
    return `${adjustedHour.toString().padStart(2, '0')}:${adjustedMinute.toString().padStart(2, '0')}`;
}

function withNaturalOffset(suggestion: TimeSuggestion, seed: string): TimeSuggestion {
    const time = addMinutes(suggestion.time, seededOffset(seed));
    const [hourStr, minuteStr] = time.split(':');
    const dayLabel = suggestion.dayOfWeek !== undefined ? `${WEEKDAY_NAMES[suggestion.dayOfWeek]} ` : '';

    return {
        ...suggestion,
        time,
        label: `${dayLabel}${formatTimeLabel(parseInt(hourStr, 10), parseInt(minuteStr, 10))}`,
    };
}

export function buildFallbackSuggestions(platform: PlatformKey | undefined, seedPrefix: string): TimeSuggestion[] {
    const fallbackTimes = PLATFORM_FALLBACK_TIMES[platform || 'MANUAL'] || PLATFORM_FALLBACK_TIMES.MANUAL;

    return fallbackTimes.map((slot, index) => withNaturalOffset({
        time: slot.time,
        label: slot.time,
        lift: slot.lift,
    }, `${seedPrefix}:${platform || 'MANUAL'}:${index}`));
}

interface SlotAccumulator {
    totalEngagement: number;
    count: number;
    /** Track which day-of-week contributes most posts to this slot */
    dayFrequency: Record<number, number>;
}

/**
 * Compute engagement score for a single post.
 * Why: Prefer the pre-computed engagementRate; fall back to
 * (likes + comments) / impressions when the platform doesn't
 * provide a rate directly.
 */
function computeEngagement(analytics: {
    engagementRate: number;
    likes: number;
    comments: number;
    impressions: number;
}): number {
    if (analytics.engagementRate > 0) return analytics.engagementRate;
    const interactions = analytics.likes + analytics.comments;
    if (analytics.impressions > 0) return (interactions / analytics.impressions) * 100;
    // Raw interaction count as last resort — not ideal but better than zero
    return interactions;
}

/**
 * Build ranked suggestions from a set of posts.
 * Shared between the org-wide, per-account and per-weekday code paths.
 * Why: lift is measured against the average of the posts passed in, so ranking a
 * weekday subset answers "when is best *on that day*", not overall.
 */
export function buildSuggestions(
    posts: RankedPost[],
    timezone: string,
    seedPrefix: string,
): TimeSuggestion[] {
    const slots = new Map<string, SlotAccumulator>();

    for (const post of posts) {
        if (!post.publishedAt || !post.analytics) continue;

        const { hour, minute: rawMinute } = getWallClockTime(post.publishedAt, timezone);
        const minute = rawMinute < 30 ? 0 : 30;
        const slotKey = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const dayOfWeek = getWeekdayInTimezone(post.publishedAt, timezone);
        const engagement = computeEngagement(post.analytics);

        const current = slots.get(slotKey) || { totalEngagement: 0, count: 0, dayFrequency: {} };
        current.totalEngagement += engagement;
        current.count += 1;
        current.dayFrequency[dayOfWeek] = (current.dayFrequency[dayOfWeek] || 0) + 1;
        slots.set(slotKey, current);
    }

    if (slots.size === 0) return [];

    // Average engagement across the slots we were given
    let totalEng = 0;
    let totalCount = 0;
    for (const slot of slots.values()) {
        totalEng += slot.totalEngagement;
        totalCount += slot.count;
    }
    const globalAvg = totalCount > 0 ? totalEng / totalCount : 0;

    // Rank by average engagement per slot
    const ranked = Array.from(slots.entries())
        .map(([time, slot]) => {
            const avgEng = slot.totalEngagement / slot.count;
            const lift = globalAvg > 0
                ? Math.round(((avgEng - globalAvg) / globalAvg) * 100)
                : 0;

            // Find dominant day of week for this slot
            let dominantDay: number | undefined;
            let maxDayCount = 0;
            for (const [day, count] of Object.entries(slot.dayFrequency)) {
                if (count > maxDayCount) {
                    maxDayCount = count;
                    dominantDay = parseInt(day, 10);
                }
            }

            return { time, avgEng, lift, count: slot.count, dominantDay };
        })
        .sort((a, b) => b.avgEng - a.avgEng)
        .slice(0, 3);

    return ranked
        .filter(slot => slot.lift >= 0) // Only positive-or-equal-to-average slots
        .map((slot, index) => {
            const [hourStr, minuteStr] = slot.time.split(':');
            const hour = parseInt(hourStr, 10);
            const minute = parseInt(minuteStr, 10);

            const dayLabel = slot.dominantDay !== undefined
                ? `${WEEKDAY_NAMES[slot.dominantDay]} `
                : '';

            return withNaturalOffset({
                time: slot.time,
                label: `${dayLabel}${formatTimeLabel(hour, minute)}`,
                lift: Math.min(slot.lift, 200), // Cap at 200% to avoid outlier spikes
                dayOfWeek: slot.dominantDay,
            }, `${seedPrefix}:${slot.time}:${index}`);
        });
}

/**
 * Rank each weekday separately so the scheduler can suggest times for the date
 * the user selected instead of the best day overall.
 *
 * Why: weekdays with too little history return no suggestions rather than a
 * noisy ranking — the caller then shows the overall ranking for that date.
 *
 * @returns Seven buckets indexed by day of week (0 = Sunday)
 */
export function buildSuggestionsByDay(
    posts: RankedPost[],
    timezone: string,
    seedPrefix: string,
): WeekdaySuggestions[] {
    const postsByWeekday: RankedPost[][] = Array.from({ length: 7 }, () => []);

    for (const post of posts) {
        if (!post.publishedAt || !post.analytics) continue;
        postsByWeekday[getWeekdayInTimezone(post.publishedAt, timezone)].push(post);
    }

    return postsByWeekday.map((dayPosts, dayOfWeek) => ({
        suggestions: dayPosts.length >= MIN_POSTS_PER_WEEKDAY
            ? buildSuggestions(dayPosts, timezone, `${seedPrefix}:day${dayOfWeek}`)
            : [],
        dataPoints: dayPosts.length,
    }));
}
