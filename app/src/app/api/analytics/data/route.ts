/**
 * Analytics Data API Route
 * Why: The SPA shell fetches this endpoint for client-side analytics rendering.
 * Mirrors the data shape produced by analytics-data-component.tsx (server component).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
    fetchAnalyticsData,
    buildTimelineData,
    buildEngagementTimeline,
    fetchContentTypeBreakdown,
    fetchAccountGrowth,
    fetchAudienceDemographics,
    fetchHashtagPerformance,
    fetchPeriodComparison,
    fetchGoogleBusinessPerformance,
    processEngagementData,
    transformTopPosts,
    calcChange
} from '@/app/(dashboard)/analytics/analytics-data';
import {
    fetchVideoPerformance,
    fetchPlatformBreakdown,
    fetchTopPerformingPosts,
} from '@/app/(dashboard)/analytics/analytics-data-video';
import { generateInsights } from '@/app/(dashboard)/analytics/ai-insights';
import { getEngagementHeatmap } from '@/app/actions/analytics';

/** GET /api/analytics/data */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const platformFilter = searchParams.get('platform') || undefined;
    const range = searchParams.get('range') || '7d';

    try {
        const [
            data, timelineData, engagementTimeline, contentTypeData,
            accountGrowthData, demographicsData, hashtagData, periodComparison,
            googleBusinessPerformance, videoPerformance, platformBreakdown, topPerformingPosts, heatmapData,
        ] = await Promise.all([
            fetchAnalyticsData({ organizationId, platformFilter, range }),
            buildTimelineData(organizationId, platformFilter, range),
            buildEngagementTimeline(organizationId, platformFilter, range),
            fetchContentTypeBreakdown(organizationId, platformFilter, range),
            fetchAccountGrowth(organizationId, platformFilter, range),
            fetchAudienceDemographics(organizationId, platformFilter),
            fetchHashtagPerformance(organizationId, platformFilter, range),
            fetchPeriodComparison(organizationId, platformFilter, range),
            fetchGoogleBusinessPerformance(organizationId, range),
            fetchVideoPerformance(organizationId, platformFilter, range),
            fetchPlatformBreakdown(organizationId, platformFilter, range),
            fetchTopPerformingPosts(organizationId, platformFilter, range),
            getEngagementHeatmap(organizationId, platformFilter),
        ]);

        const engagement = processEngagementData(data.engagementMetrics, data.previousEngagement);
        const topPosts = transformTopPosts(data.recentPublished);
        const availablePlatforms = Array.from(new Set(data.socialAccounts.map(a => a.platform.toLowerCase())));
        const platformCounts = data.socialAccounts.reduce((acc, account) => {
            const p = account.platform.toLowerCase();
            acc[p] = (acc[p] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const displayedAccounts = platformFilter
            ? data.socialAccounts.filter(a => a.platform === data.platformEnum)
            : data.socialAccounts;

        const postsChange = calcChange(data.postsInPeriod, data.previousPeriodPosts);

        const hasAccounts = data.socialAccounts.length > 0;
        const hasPosts = data.totalPosts > 0;
        const hasCompetitors = data.competitors.length > 0;
        const hasEngagementData = engagement.totalLikes > 0 || engagement.totalComments > 0 ||
            engagement.totalShares > 0 || engagement.totalReach > 0;

        const myEngagementRate = engagement.avgEngagementRate;
        const competitorAvgEngagement = data.competitors.length > 0
            ? data.competitors.reduce((acc, c) => acc + c.avgEngagement, 0) / data.competitors.length
            : 0;

        const insights = generateInsights({
            engagement,
            contentTypeData,
            accountGrowth: accountGrowthData,
            heatmapData,
            totalPosts: data.postsInPeriod,
            postsChange,
        });

        return NextResponse.json({
            displayedAccountsCount: displayedAccounts.length,
            totalPosts: data.totalPosts,
            publishedPosts: data.publishedPosts,
            scheduledPosts: data.scheduledPosts,
            postsChange,
            platformFilter: platformFilter || null,
            platformCounts,
            hasAccounts,
            hasPosts,
            hasCompetitors,
            hasEngagementData,
            engagement,
            timelineData,
            availablePlatforms,
            topPosts,
            myEngagementRate,
            competitorAvgEngagement,
            competitors: data.competitors.map(c => ({
                id: c.id,
                username: c.username,
                displayName: c.displayName,
                platform: c.platform.toLowerCase(),
                avatar: c.avatar,
                avgEngagement: c.avgEngagement,
            })),
            socialAccountsCount: data.socialAccounts.length,
            heatmapData,
            engagementTimeline,
            contentTypeData,
            accountGrowthData,
            insights,
            demographicsData,
            hashtagData,
            periodComparison,
            googleBusinessPerformance,
            videoPerformance,
            platformBreakdown,
            topPerformingPosts,
            currentRange: range,
        }, {
            headers: {
                'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
            },
        });
    } catch (error) {
        logger.error({ error, organizationId }, 'Failed to fetch analytics data');
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
}
