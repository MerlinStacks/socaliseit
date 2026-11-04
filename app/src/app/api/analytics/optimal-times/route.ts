/**
 * Optimal Posting Times API Route
 * Calculates best posting times based on historical engagement performance,
 * overall and for every weekday of the week.
 *
 * Why: Ranks slots by average engagement (not post frequency) so users schedule
 * content when their audience actually interacts — and, for the scheduler, when
 * they interact on the specific date being scheduled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { subDays } from 'date-fns';
import { logger } from '@/lib/logger';
import {
    OVERALL_LOOKBACK_DAYS,
    WEEKDAY_LOOKBACK_DAYS,
    buildFallbackSuggestions,
    buildSuggestions,
    buildSuggestionsByDay,
    getConfidence,
    type PlatformKey,
    type TimeSuggestion,
    type WeekdaySuggestions,
} from '@/lib/optimal-times';

interface OptimalTimesData {
    suggestions: TimeSuggestion[];
    dataPoints: number;
    confidence: 'high' | 'medium' | 'low';
    /** Ranking per weekday (index 0 = Sunday) — what the scheduler shows for a date */
    byDayOfWeek?: WeekdaySuggestions[];
}

interface OptimalTimesResponse extends OptimalTimesData {
    perAccount?: Record<string, OptimalTimesData>;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string | null | undefined): Record<string, T[]> {
    const grouped: Record<string, T[]> = {};
    for (const item of items) {
        const key = keyOf(item);
        if (!key) continue;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
    }
    return grouped;
}

/**
 * GET /api/analytics/optimal-times
 * Returns engagement-ranked optimal posting times, overall and per weekday.
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

    // Get published posts with analytics.
    // Why: the wider window only feeds the per-weekday ranking — one weekday is a
    // seventh of the sample, so ranking it needs more history than the headline.
    const overallSince = subDays(new Date(), OVERALL_LOOKBACK_DAYS);
    const weekdaySince = subDays(new Date(), WEEKDAY_LOOKBACK_DAYS);

    const [allPosts, accounts] = await Promise.all([
        db.post.findMany({
            where: {
                organizationId,
                status: 'PUBLISHED',
                publishedAt: { gte: weekdaySince },
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

    // Headline ranking and data points keep the 90-day window they always had
    const publishedPosts = allPosts.filter(post => post.publishedAt && post.publishedAt >= overallSince);

    const dataPoints = publishedPosts.length;
    const confidence = getConfidence(dataPoints);

    // Not enough data — return platform-aware defaults instead of a generic blank state.
    if (dataPoints < 5) {
        logger.debug({ organizationId, dataPoints }, 'Insufficient data for optimal times');
        return NextResponse.json({
            // Why no byDayOfWeek: platform defaults say nothing about a weekday,
            // so every date shows the same defaults rather than invented per-day detail.
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

    const orgSeed = `${organizationId}:org`;

    // Org-wide suggestions: overall ranking from the recent window, per weekday
    // from the wider one
    const suggestions = buildSuggestions(publishedPosts, timezone, orgSeed);
    const byDayOfWeek = buildSuggestionsByDay(allPosts, timezone, orgSeed);

    // Fallback if no slots have positive lift
    if (suggestions.length === 0) {
        suggestions.push(...buildFallbackSuggestions(undefined, orgSeed));
    }

    const postsByAccount = groupBy(allPosts, post => post.socialAccountId);
    const postsByPlatform = groupBy(allPosts, post => post.platform);
    const recentByAccount = groupBy(publishedPosts, post => post.socialAccountId);
    const recentByPlatform = groupBy(publishedPosts, post => post.platform);

    const perAccount: Record<string, OptimalTimesData> = {};

    for (const account of accounts) {
        const accountId = account.id;
        const platform = account.platform as PlatformKey;
        const accountSeed = `${organizationId}:${accountId}`;
        const accountPosts = recentByAccount[accountId] || [];
        const accDataPoints = accountPosts.length;
        const accConfidence = getConfidence(accDataPoints);

        if (accDataPoints < 5) {
            const platformPosts = recentByPlatform[platform] || [];
            const platformSuggestions = platformPosts.length >= 5
                ? buildSuggestions(platformPosts, timezone, `${organizationId}:${platform}`)
                : [];

            // Weekday buckets follow the same source as the ranking they complement
            const daySource = platformSuggestions.length > 0
                ? postsByPlatform[platform] || []
                : postsByAccount[accountId] || [];
            const daySeed = platformSuggestions.length > 0 ? `${organizationId}:${platform}` : accountSeed;

            perAccount[accountId] = {
                suggestions: platformSuggestions.length > 0
                    ? platformSuggestions
                    : buildFallbackSuggestions(platform, accountSeed),
                dataPoints: accDataPoints,
                confidence: 'low',
                byDayOfWeek: buildSuggestionsByDay(daySource, timezone, daySeed),
            };
            continue;
        }

        const accSuggestions = buildSuggestions(accountPosts, timezone, accountSeed);

        if (accSuggestions.length === 0) {
            accSuggestions.push(...buildFallbackSuggestions(platform, accountSeed));
        }

        perAccount[accountId] = {
            suggestions: accSuggestions,
            dataPoints: accDataPoints,
            confidence: accConfidence,
            byDayOfWeek: buildSuggestionsByDay(postsByAccount[accountId] || [], timezone, accountSeed),
        };
    }

    return NextResponse.json({
        suggestions,
        dataPoints,
        confidence,
        byDayOfWeek,
        perAccount,
    } as OptimalTimesResponse);
}
