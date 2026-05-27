'use client';

/**
 * Analytics SPA page — client-side wrapper for SPA shell navigation.
 * 
 * Why: The SSR AnalyticsDataComponent runs 8+ parallel DB queries on the server.
 * This client page fetches the same data via API route and renders the same
 * AnalyticsClient/AnalyticsDesktop components.
 */

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { AnalyticsClient } from './analytics-client';
import { AnalyticsDesktop } from './AnalyticsDesktop';
import AnalyticsLoading from './loading';

export default function AnalyticsSPAPage() {
    const searchParams = useSearchParams();
    const platformFilter = searchParams.get('platform') ?? undefined;
    const range = searchParams.get('range') ?? '7d';

    const { data, isLoading } = useQuery({
        queryKey: ['analytics-data', platformFilter, range],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (platformFilter) params.set('platform', platformFilter);
            params.set('range', range);
            const res = await fetch(`/api/analytics/data?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch analytics');
            return res.json();
        },
        staleTime: 5 * 60_000,
    });

    if (isLoading || !data) return <AnalyticsLoading />;

    const desktopContent = (
        <AnalyticsDesktop
            displayedAccountsCount={data.displayedAccountsCount}
            totalPosts={data.totalPosts}
            publishedPosts={data.publishedPosts}
            scheduledPosts={data.scheduledPosts}
            postsChange={data.postsChange}
            platformFilter={data.platformFilter}
            platformCounts={data.platformCounts}
            hasAccounts={data.hasAccounts}
            hasPosts={data.hasPosts}
            hasCompetitors={data.hasCompetitors}
            hasEngagementData={data.hasEngagementData}
            engagement={data.engagement}
            timelineData={data.timelineData}
            availablePlatforms={data.availablePlatforms}
            recentPublished={data.topPosts}
            myEngagementRate={data.myEngagementRate}
            competitorAvgEngagement={data.competitorAvgEngagement}
            competitors={data.competitors}
            socialAccountsCount={data.socialAccountsCount}
            heatmapData={data.heatmapData}
            engagementTimeline={data.engagementTimeline}
            contentTypeData={data.contentTypeData}
            accountGrowthData={data.accountGrowthData}
            insights={data.insights}
            demographicsData={data.demographicsData}
            hashtagData={data.hashtagData}
            periodComparison={data.periodComparison}
            googleBusinessPerformance={data.googleBusinessPerformance || { impressions: 0, searchImpressions: 0, mapsImpressions: 0, websiteClicks: 0, calls: 0, directionRequests: 0, conversations: 0, locations: 0 }}
            currentRange={data.currentRange}
            videoPerformance={data.videoPerformance || { totalVideoViews: 0, totalWatchTimeSeconds: 0, avgWatchPercentage: 0, totalReplays: 0, avgSkipRate: 0, videoCount: 0 }}
            platformBreakdown={data.platformBreakdown || []}
            topPerformingPosts={data.topPerformingPosts || []}
        />
    );

    return (
        <AnalyticsClient
            accountsCount={data.displayedAccountsCount}
            totalPosts={data.totalPosts}
            publishedPosts={data.publishedPosts}
            scheduledPosts={data.scheduledPosts}
            postsChange={data.postsChange}
            engagement={data.engagement}
            hasEngagementData={data.hasEngagementData}
            timelineData={data.timelineData}
            topPosts={data.topPosts}
            availablePlatforms={data.availablePlatforms}
            currentPlatform={data.platformFilter}
            currentRange={data.currentRange}
            heatmapData={data.heatmapData}
            googleBusinessPerformance={data.googleBusinessPerformance || { impressions: 0, searchImpressions: 0, mapsImpressions: 0, websiteClicks: 0, calls: 0, directionRequests: 0, conversations: 0, locations: 0 }}
            desktopContent={desktopContent}
        />
    );
}
