/**
 * Analytics page
 * Shows real metrics from database with contextual empty states
 * 
 * Features:
 * - Mobile-optimized layout with stacked cards
 * - Decomposed for 200-line standard compliance
 */

import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AnalyticsClient } from './analytics-client';
import { AnalyticsDesktop } from './AnalyticsDesktop';
import {
    fetchAnalyticsData,
    buildTimelineData,
    processEngagementData,
    transformTopPosts,
    calcChange
} from './analytics-data';

export default async function AnalyticsPage(props: {
    searchParams?: Promise<{ platform?: string; range?: string }>;
}) {
    const searchParams = await props.searchParams;
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;
    const { platform: platformFilter, range = '7d' } = searchParams || {};

    // Fetch all analytics data in parallel — these are independent queries
    const [data, timelineData] = await Promise.all([
        fetchAnalyticsData({ organizationId, platformFilter, range }),
        buildTimelineData(organizationId, platformFilter, range),
    ]);

    // Process engagement data
    const engagement = processEngagementData(data.engagementMetrics, data.previousEngagement);
    const topPosts = transformTopPosts(data.recentPublished);

    // Calculate derived values
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

    const myEngagementRate = data.myEngagementStats._avg.engagementRate || 0;
    const competitorAvgEngagement = data.competitors.length > 0
        ? data.competitors.reduce((acc, c) => acc + c.avgEngagement, 0) / data.competitors.length
        : 0;

    // Desktop content component
    const desktopContent = (
        <AnalyticsDesktop
            displayedAccountsCount={displayedAccounts.length}
            totalPosts={data.totalPosts}
            publishedPosts={data.publishedPosts}
            scheduledPosts={data.scheduledPosts}
            postsChange={postsChange}
            platformFilter={platformFilter}
            platformCounts={platformCounts}
            hasAccounts={hasAccounts}
            hasPosts={hasPosts}
            hasCompetitors={hasCompetitors}
            hasEngagementData={hasEngagementData}
            engagement={engagement}
            timelineData={timelineData}
            availablePlatforms={availablePlatforms}
            recentPublished={topPosts}
            myEngagementRate={myEngagementRate}
            competitorAvgEngagement={competitorAvgEngagement}
            competitors={data.competitors.map(c => ({
                id: c.id,
                username: c.username,
                displayName: c.displayName,
                platform: c.platform.toLowerCase(),
                avatar: c.avatar,
                avgEngagement: c.avgEngagement
            }))}
            socialAccountsCount={data.socialAccounts.length}
        />
    );

    return (
        <AnalyticsClient
            accountsCount={displayedAccounts.length}
            totalPosts={data.totalPosts}
            publishedPosts={data.publishedPosts}
            scheduledPosts={data.scheduledPosts}
            postsChange={postsChange}
            engagement={engagement}
            hasEngagementData={hasEngagementData}
            timelineData={timelineData}
            topPosts={topPosts}
            availablePlatforms={availablePlatforms}
            currentPlatform={platformFilter}
            currentRange={range}
            heatmapData={data.heatmapData}
            desktopContent={desktopContent}
        />
    );
}
