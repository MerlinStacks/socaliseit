/**
 * Optimal Posting Times API Route
 * Calculates best posting times based on historical engagement performance.
 *
 * Why: Ranks slots by average engagement (not post frequency) so users
 * schedule content when their audience actually interacts, not just
 * when they happen to post most often.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { subDays } from 'date-fns';
import { getWallClockTime } from '@/lib/timezone-utils';
import { logger } from '@/lib/logger';

interface TimeSuggestion {
    time: string;       // "HH:MM" format
    label: string;      // "7:30 PM"
    lift: number;       // % lift vs average engagement
    dayOfWeek?: number; // 0-6 (Sun-Sat), included when a day is dominant
}

type PlatformKey =
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

interface OptimalTimesData {
    suggestions: TimeSuggestion[];
    dataPoints: number;
    confidence: 'high' | 'medium' | 'low';
}

interface OptimalTimesResponse extends OptimalTimesData {
    perAccount?: Record<string, OptimalTimesData>;
}

/** Format 24-hour time to 12-hour label */
function formatTimeLabel(hour: number, minute: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const minuteStr = minute.toString().padStart(2, '0');
    return `${hour12}:${minuteStr} ${period}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

/** Determine confidence based on number of posts with engagement data */
function getConfidence(dataPoints: number): 'high' | 'medium' | 'low' {
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
    const dayLabel = suggestion.dayOfWeek !== undefined ? `${DAY_NAMES[suggestion.dayOfWeek]} ` : '';

    return {
        ...suggestion,
        time,
        label: `${dayLabel}${formatTimeLabel(parseInt(hourStr, 10), parseInt(minuteStr, 10))}`,
    };
}

function buildFallbackSuggestions(platform: PlatformKey | undefined, seedPrefix: string): TimeSuggestion[] {
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
 * Shared between the org-wide and per-account code paths.
 */
function buildSuggestions(
    posts: Array<{
        publishedAt: Date | null;
        analytics: { engagementRate: number; likes: number; comments: number; impressions: number } | null;
    }>,
    timezone: string,
    seedPrefix: string,
): TimeSuggestion[] {
    const slots = new Map<string, SlotAccumulator>();

    for (const post of posts) {
        if (!post.publishedAt || !post.analytics) continue;

        const { hour, minute: rawMinute } = getWallClockTime(post.publishedAt, timezone);
        const minute = rawMinute < 30 ? 0 : 30;
        const slotKey = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const dayOfWeek = new Date(post.publishedAt).getDay();
        const engagement = computeEngagement(post.analytics);

        const current = slots.get(slotKey) || { totalEngagement: 0, count: 0, dayFrequency: {} };
        current.totalEngagement += engagement;
        current.count += 1;
        current.dayFrequency[dayOfWeek] = (current.dayFrequency[dayOfWeek] || 0) + 1;
        slots.set(slotKey, current);
    }

    if (slots.size === 0) return [];

    // Global average engagement across all slots
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
                ? `${DAY_NAMES[slot.dominantDay]} `
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
 * GET /api/analytics/optimal-times
 * Returns engagement-ranked optimal posting times.
 */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    // Resolve timezone: prefer client ?tz= param, fall back to org setting
    const clientTz = request.nextUrl.searchParams.get('tz');
    const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { timezone: true },
    });
    const timezone = clientTz || org?.timezone || 'UTC';

    // Get published posts from the last 90 days with analytics
    const ninetyDaysAgo = subDays(new Date(), 90);

    const [publishedPosts, accounts] = await Promise.all([
        db.post.findMany({
            where: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: ninetyDaysAgo },
                analytics: { isNot: null },
            },
            select: {
                id: true,
                publishedAt: true,
                socialAccountId: true,
                platform: true,
                analytics: {
                    select: {
                        engagementRate: true,
                        likes: true,
                        comments: true,
                        impressions: true,
                    },
                },
            },
        }),
        db.socialAccount.findMany({
            where: { organizationId, isActive: true },
            select: { id: true, platform: true },
        }),
    ]);

    const dataPoints = publishedPosts.length;
    const confidence = getConfidence(dataPoints);

    // Not enough data — return platform-aware defaults instead of a generic blank state.
    if (dataPoints < 5) {
        logger.debug({ organizationId, dataPoints }, 'Insufficient data for optimal times');
        return NextResponse.json({
            suggestions: buildFallbackSuggestions(undefined, `${organizationId}:org`),
            dataPoints,
            confidence: 'low',
            perAccount: Object.fromEntries(
                accounts.map(account => [
                    account.id,
                    {
                        suggestions: buildFallbackSuggestions(account.platform as PlatformKey, `${organizationId}:${account.id}`),
                        dataPoints: 0,
                        confidence: 'low' as const,
                    },
                ])
            ),
        } as OptimalTimesResponse);
    }

    // Org-wide suggestions
    const suggestions = buildSuggestions(publishedPosts, timezone, `${organizationId}:org`);

    // Fallback if no slots have positive lift
    if (suggestions.length === 0 && dataPoints >= 5) {
        suggestions.push(...buildFallbackSuggestions(undefined, `${organizationId}:org`));
    }

    // Per-account breakdown
    const postsByAccount: Record<string, typeof publishedPosts> = {};
    const postsByPlatform: Partial<Record<PlatformKey, typeof publishedPosts>> = {};
    for (const post of publishedPosts) {
        if (post.socialAccountId) {
            if (!postsByAccount[post.socialAccountId]) {
                postsByAccount[post.socialAccountId] = [];
            }
            postsByAccount[post.socialAccountId].push(post);
        }

        if (post.platform) {
            const platform = post.platform as PlatformKey;
            if (!postsByPlatform[platform]) {
                postsByPlatform[platform] = [];
            }
            postsByPlatform[platform]!.push(post);
        }
    }

    const perAccount: Record<string, OptimalTimesData> = {};

    for (const account of accounts) {
        const accountId = account.id;
        const platform = account.platform as PlatformKey;
        const accountPosts = postsByAccount[accountId] || [];
        const accDataPoints = accountPosts.length;
        const accConfidence = getConfidence(accDataPoints);

        if (accDataPoints < 5) {
            const platformPosts = postsByPlatform[platform] || [];
            const platformSuggestions = platformPosts.length >= 5
                ? buildSuggestions(platformPosts, timezone, `${organizationId}:${platform}`)
                : [];

            perAccount[accountId] = {
                suggestions: platformSuggestions.length > 0
                    ? platformSuggestions
                    : buildFallbackSuggestions(platform, `${organizationId}:${accountId}`),
                dataPoints: accDataPoints,
                confidence: 'low',
            };
            continue;
        }

        const accSuggestions = buildSuggestions(accountPosts, timezone, `${organizationId}:${accountId}`);

        if (accSuggestions.length === 0 && accDataPoints >= 5) {
            accSuggestions.push(...buildFallbackSuggestions(platform, `${organizationId}:${accountId}`));
        }

        perAccount[accountId] = {
            suggestions: accSuggestions,
            dataPoints: accDataPoints,
            confidence: accConfidence,
        };
    }

    return NextResponse.json({
        suggestions,
        dataPoints,
        confidence,
        perAccount,
    } as OptimalTimesResponse);
}
