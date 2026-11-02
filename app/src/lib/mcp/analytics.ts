/**
 * Analytics reads shared by the MCP server and Seb's chat tools.
 * Why: Reuse the dashboard's own aggregation helpers (and their correctness
 * guards) so an MCP client or Seb sees exactly the numbers the app shows,
 * instead of a second implementation that can drift. Read-only: nothing here
 * triggers a platform analytics sync, which would consume provider API quota.
 * Callers authorise first: MCP checks key scopes and grants, Seb checks the
 * member's analytics.view permission.
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import {
    fetchAnalyticsData,
    processEngagementData,
    calcChange,
    fetchAccountGrowth,
} from '@/app/(dashboard)/analytics/analytics-data';
import { fetchTopPerformingPosts } from '@/app/(dashboard)/analytics/analytics-data-video';
import { ACCOUNT_REPORT_NOTE } from '@/lib/analytics/account-reporting';
import { getPublishingStatus } from '@/lib/publishing-status';

export const analyticsInput = z.strictObject({
    range: z.enum(['7d', '30d', '90d', 'year']).default('30d')
        .describe('Reporting window. Previous-period comparisons use the equally long window immediately before it.'),
    platform: z.enum(['instagram', 'facebook', 'meta', 'tiktok', 'youtube', 'pinterest', 'google_business', 'linkedin', 'threads', 'bluesky']).optional()
        .describe('Restrict to one platform. Omit for all connected platforms combined.'),
});

const FRESHNESS_NOTE = 'Metrics are the values stored by the last analytics sync. No sync is triggered here; check syncedAt before reporting recent dates as complete.';

/** Per-post metrics live on PostAnalytics (no organizationId), so scope through the post relation. */
async function dataFreshness(organizationId: string) {
    const [postMetrics, accountMetrics] = await Promise.all([
        db.postAnalytics.aggregate({ _max: { syncedAt: true }, where: { post: { organizationId } } }),
        db.platformAnalytics.aggregate({ _max: { syncedAt: true }, where: { organizationId } }),
    ]);
    return {
        postMetricsSyncedAt: postMetrics._max.syncedAt ?? null,
        accountMetricsSyncedAt: accountMetrics._max.syncedAt ?? null,
        note: FRESHNESS_NOTE,
    };
}

export async function analyticsSummary(organizationId: string, raw: unknown) {
    const { range, platform } = analyticsInput.parse(raw);

    const [data, freshness] = await Promise.all([
        fetchAnalyticsData({ organizationId, platformFilter: platform, range }),
        dataFreshness(organizationId),
    ]);
    const engagement = processEngagementData(data.engagementMetrics, data.previousEngagement);

    return {
        range,
        platform: platform ?? 'all',
        period: {
            start: data.dateRange.start, end: data.dateRange.end,
            previousStart: data.dateRange.prevStart,
        },
        posts: {
            created: data.postsInPeriod,
            published: data.publishedPosts,
            scheduled: data.scheduledPosts,
            createdChangePercent: calcChange(data.postsInPeriod, data.previousPeriodPosts),
        },
        engagement: {
            likes: engagement.totalLikes, comments: engagement.totalComments,
            shares: engagement.totalShares, saves: engagement.totalSaves,
            clicks: engagement.totalClicks, videoViews: engagement.totalVideoViews,
            reach: engagement.totalReach, impressions: engagement.totalImpressions,
            engagementRatePercent: engagement.avgEngagementRate,
            changePercent: {
                likes: engagement.likesChange, comments: engagement.commentsChange,
                shares: engagement.sharesChange, saves: engagement.savesChange,
                clicks: engagement.clicksChange, videoViews: engagement.videoViewsChange,
                reach: engagement.reachChange, impressions: engagement.impressionsChange,
            },
        },
        // Only meaningful when the workspace has connected accounts; otherwise totals are legitimately zero.
        connectedAccounts: data.socialAccounts.length,
        hasData: data.hasData,
        ...freshness,
        metricNote: ACCOUNT_REPORT_NOTE,
    };
}

export async function accountGrowth(organizationId: string, raw: unknown) {
    const { range, platform } = analyticsInput.parse(raw);
    const growth = await fetchAccountGrowth(organizationId, platform, range);
    return {
        range,
        totals: {
            followers: growth.totalFollowers,
            followerChange: growth.totalFollowerChange,
            profileViews: growth.totalProfileViews,
            websiteClicks: growth.totalWebsiteClicks,
        },
        // Daily series are omitted: they are large and rarely needed by a text client.
        accounts: growth.accounts.slice(0, 50).map(account => ({
            accountId: account.id, name: account.name, platform: account.platform,
            followers: account.currentFollowers, followerChange: account.followerChange,
        })),
        truncated: growth.accounts.length > 50,
        metricNote: ACCOUNT_REPORT_NOTE,
    };
}

export async function topPosts(organizationId: string, raw: unknown) {
    const { range, platform } = analyticsInput.parse(raw);
    const posts = await fetchTopPerformingPosts(organizationId, platform, range);
    return {
        range,
        platform: platform ?? 'all',
        // Ranked by engagement rate, matching the dashboard's top-performing view.
        posts: posts.map(post => ({
            postId: post.id, platform: post.platform, publishedAt: post.publishedAt,
            engagementRatePercent: post.engagementRate, likes: post.likes,
            comments: post.comments, shares: post.shares, videoViews: post.videoViews,
            caption: post.caption.slice(0, 280),
        })),
        note: 'Posts with no synced metrics yet are absent, not zero.',
    };
}

const postAnalyticsInput = z.strictObject({ postId: z.string().min(1).max(100) });

export async function getPostAnalytics(organizationId: string, raw: unknown) {
    const { postId } = postAnalyticsInput.parse(raw);
    const post = await db.post.findFirst({
        where: { id: postId, organizationId },
        select: {
            id: true, status: true, platformPostId: true, publishedAt: true, platform: true,
            socialAccount: { select: { name: true, platform: true } },
            analytics: true,
            errors: { orderBy: { occurredAt: 'desc' }, take: 1, select: { errorCode: true } },
        },
    });
    if (!post) return { error: 'Post not found', status: 404 };
    const { analytics, errors, socialAccount, ...rest } = post;
    return {
        ...rest,
        platform: rest.platform?.toLowerCase() ?? null,
        socialAccount: socialAccount ? { ...socialAccount, platform: socialAccount.platform.toLowerCase() } : null,
        metrics: analytics ? {
            impressions: analytics.impressions, reach: analytics.reach, likes: analytics.likes,
            comments: analytics.comments, shares: analytics.shares, saves: analytics.saves,
            clicks: analytics.clicks, videoViews: analytics.videoViews,
            videoWatchTimeSeconds: analytics.videoWatchTime,
            averageWatchPercent: analytics.avgWatchPercentage,
            engagementRatePercent: analytics.engagementRate,
            syncedAt: analytics.syncedAt,
        } : null,
        // The post's publishing state explains an empty metric row (never published / still syncing).
        publishing: getPublishingStatus(rest, errors[0]?.errorCode),
        ...(analytics ? {} : { note: 'No metrics stored for this post yet. It may not be published, or its metrics have not synced.' }),
    };
}
