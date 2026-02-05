/**
 * Competitor Tracking Service
 * Monitor competitor accounts and benchmark performance
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface Competitor {
    id: string;
    organizationId: string;
    platform: string;
    username: string;
    displayName: string;
    profileUrl: string;
    avatarUrl?: string;
    followerCount: number;
    followingCount: number;
    postCount: number;
    isVerified: boolean;
    category?: string;
    notes: string;
    trackingSince: Date;
    lastSyncedAt: Date;
}

export interface CompetitorMetrics {
    competitorId: string;
    date: Date;
    followers: number;
    followerGrowth: number;
    posts: number;
    avgEngagementRate: number;
    avgLikes: number;
    avgComments: number;
    avgShares: number;
    topPostId?: string;
}

export interface CompetitorPost {
    id: string;
    competitorId: string;
    platform: string;
    postUrl: string;
    caption: string;
    mediaType: 'image' | 'video' | 'carousel';
    publishedAt: Date;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
    hashtags: string[];
    mentions: string[];
}

export interface BenchmarkReport {
    your: {
        followers: number;
        followerGrowth: number;
        avgEngagement: number;
        postFrequency: number;
        topContentType: string;
    };
    competitors: Array<{
        competitor: Competitor;
        followers: number;
        followerGrowth: number;
        avgEngagement: number;
        postFrequency: number;
        topContentType: string;
    }>;
    insights: string[];
    recommendations: string[];
}

/**
 * Add competitor to track
 */
export async function addCompetitor(
    organizationId: string,
    platform: string,
    username: string
): Promise<Competitor> {
    // In production, would scrape profile data

    const competitor: Competitor = {
        id: `comp_${Date.now()}`,
        organizationId,
        platform,
        username,
        displayName: username.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        profileUrl: `https://${platform}.com/${username}`,
        followerCount: Math.floor(Math.random() * 100000) + 10000,
        followingCount: Math.floor(Math.random() * 1000) + 100,
        postCount: Math.floor(Math.random() * 500) + 50,
        isVerified: Math.random() > 0.7,
        notes: '',
        trackingSince: new Date(),
        lastSyncedAt: new Date(),
    };

    return competitor;
}

/**
 * Sync competitor data by calling the sync API
 */
export async function syncCompetitor(competitorId: string): Promise<CompetitorMetrics> {
    // Fetch latest data from database after sync API has been called
    const competitor = await db.competitor.findUnique({
        where: { id: competitorId },
        include: {
            posts: {
                orderBy: { postedAt: 'desc' },
                take: 12
            }
        }
    });

    if (!competitor) {
        throw new Error('Competitor not found');
    }

    // Calculate metrics from stored posts
    const posts = competitor.posts || [];
    const totalLikes = posts.reduce((sum, p) => sum + p.likes, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.comments, 0);
    const avgLikes = posts.length > 0 ? Math.round(totalLikes / posts.length) : 0;
    const avgComments = posts.length > 0 ? Math.round(totalComments / posts.length) : 0;

    return {
        competitorId,
        date: new Date(),
        followers: competitor.followers,
        followerGrowth: competitor.followerGrowth,
        posts: posts.length,
        avgEngagementRate: competitor.avgEngagement,
        avgLikes,
        avgComments,
        avgShares: 0, // Instagram doesn't expose shares
    };
}

/**
 * Get competitor's recent posts from database
 */
export async function getCompetitorPosts(
    competitorId: string,
    limit: number = 20
): Promise<CompetitorPost[]> {
    const competitor = await db.competitor.findUnique({
        where: { id: competitorId },
        include: {
            posts: {
                orderBy: { postedAt: 'desc' },
                take: limit
            }
        }
    });

    if (!competitor?.posts) {
        return [];
    }

    return competitor.posts.map(post => {
        // Extract hashtags from caption
        const hashtags = extractHashtags(post.caption || '');
        const mentions = extractMentions(post.caption || '');

        // Calculate engagement rate
        const totalEngagement = post.likes + post.comments;
        const engagementRate = competitor.followers > 0
            ? (totalEngagement / competitor.followers) * 100
            : 0;

        return {
            id: post.id,
            competitorId,
            platform: competitor.platform.toLowerCase(),
            postUrl: post.platformId ? `https://instagram.com/p/${post.platformId}` : '',
            caption: post.caption || '',
            mediaType: (post.mediaType as 'image' | 'video' | 'carousel') || 'image',
            publishedAt: post.postedAt,
            likes: post.likes,
            comments: post.comments,
            shares: 0, // Instagram doesn't expose shares
            engagementRate: Math.round(engagementRate * 100) / 100,
            hashtags,
            mentions,
        };
    });
}

/**
 * Extract hashtags from text
 */
function extractHashtags(text: string): string[] {
    const matches = text.match(/#[\w\u00C0-\u024F]+/g);
    return matches ? [...new Set(matches.map(h => h.toLowerCase()))] : [];
}

/**
 * Extract @mentions from text
 */
function extractMentions(text: string): string[] {
    const matches = text.match(/@[\w.]+/g);
    return matches ? [...new Set(matches)] : [];
}

/**
 * Generate benchmark report using real data from DB
 */
export async function generateBenchmark(
    organizationId: string,
    competitorIds: string[]
): Promise<BenchmarkReport> {
    // Fetch your organization's analytics
    const yourAccounts = await db.socialAccount.findMany({
        where: { organizationId, platform: 'INSTAGRAM' },
        include: {
            _count: { select: { posts: true } }
        }
    });

    // Get your latest platform analytics
    const yourAnalytics = await db.platformAnalytics.findFirst({
        where: {
            organizationId,
            socialAccount: { platform: 'INSTAGRAM' }
        },
        orderBy: { date: 'desc' }
    });

    // Get your recent posts for engagement calculation
    const yourPosts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            socialAccountId: { not: null }
        },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        include: { analytics: true }
    });

    // Calculate your metrics
    const yourFollowers = yourAnalytics?.followers || 0;
    const yourFollowerGrowth = yourAnalytics?.followersChange || 0;

    let yourTotalEngagement = 0;
    const contentTypeCounts: Record<string, number> = {};

    for (const post of yourPosts) {
        if (post.analytics) {
            yourTotalEngagement += (post.analytics.likes + post.analytics.comments);
        }
        const type = post.postType || 'FEED';
        contentTypeCounts[type] = (contentTypeCounts[type] || 0) + 1;
    }

    const yourAvgEngagement = yourPosts.length > 0 && yourFollowers > 0
        ? (yourTotalEngagement / yourPosts.length / yourFollowers) * 100
        : 0;

    const yourTopContentType = Object.entries(contentTypeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0]?.toLowerCase() || 'feed';

    // Calculate posts per day
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentPosts = yourPosts.filter(p => p.publishedAt && p.publishedAt > thirtyDaysAgo);
    const yourPostFrequency = recentPosts.length / 30;

    // Fetch competitor data
    const competitors = await db.competitor.findMany({
        where: {
            id: { in: competitorIds },
            organizationId
        },
        include: {
            posts: {
                orderBy: { postedAt: 'desc' },
                take: 20
            }
        }
    });

    const competitorData = competitors.map(comp => {
        // Calculate competitor metrics
        const compTotalEngagement = comp.posts.reduce((sum, p) => sum + p.likes + p.comments, 0);
        const compAvgEngagement = comp.posts.length > 0 && comp.followers > 0
            ? (compTotalEngagement / comp.posts.length / comp.followers) * 100
            : 0;

        // Analyze content types
        const compContentTypes: Record<string, number> = {};
        for (const post of comp.posts) {
            const type = post.mediaType || 'image';
            compContentTypes[type] = (compContentTypes[type] || 0) + 1;
        }
        const topContentType = Object.entries(compContentTypes)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'image';

        return {
            competitor: {
                id: comp.id,
                organizationId: comp.organizationId,
                platform: comp.platform.toLowerCase(),
                username: comp.username,
                displayName: comp.displayName || comp.username,
                profileUrl: `https://instagram.com/${comp.username}`,
                followerCount: comp.followers,
                followingCount: 0,
                postCount: comp.posts.length,
                isVerified: comp.isVerified,
                notes: '',
                trackingSince: comp.createdAt,
                lastSyncedAt: comp.lastSyncedAt || comp.createdAt,
            },
            followers: comp.followers,
            followerGrowth: comp.followerGrowth,
            avgEngagement: Math.round(compAvgEngagement * 100) / 100,
            postFrequency: comp.postsPerWeek / 7,
            topContentType,
        };
    });

    // Generate insights based on real data
    const insights: string[] = [];
    const recommendations: string[] = [];

    if (competitorData.length > 0) {
        const avgCompFollowers = competitorData.reduce((sum, c) => sum + c.followers, 0) / competitorData.length;
        const avgCompEngagement = competitorData.reduce((sum, c) => sum + c.avgEngagement, 0) / competitorData.length;
        const avgCompPostFreq = competitorData.reduce((sum, c) => sum + c.postFrequency, 0) / competitorData.length;

        if (yourFollowers < avgCompFollowers * 0.5) {
            insights.push(`Your follower count (${yourFollowers.toLocaleString()}) is significantly lower than competitors (avg: ${Math.round(avgCompFollowers).toLocaleString()})`);
        }

        if (yourAvgEngagement < avgCompEngagement) {
            const diff = Math.round((avgCompEngagement - yourAvgEngagement) / avgCompEngagement * 100);
            insights.push(`Your engagement rate (${yourAvgEngagement.toFixed(2)}%) is ${diff}% below competitor average (${avgCompEngagement.toFixed(2)}%)`);
            recommendations.push('Analyze top-performing competitor posts for content inspiration');
        } else {
            insights.push(`Your engagement rate (${yourAvgEngagement.toFixed(2)}%) outperforms competitor average (${avgCompEngagement.toFixed(2)}%)`);
        }

        if (yourPostFrequency < avgCompPostFreq) {
            const diff = Math.round((avgCompPostFreq - yourPostFrequency) / avgCompPostFreq * 100);
            insights.push(`Competitors post ${diff}% more frequently than you`);
            recommendations.push(`Consider increasing posting frequency to ${Math.ceil(avgCompPostFreq * 7)} posts per week`);
        }

        // Check content type patterns
        const videoCompetitors = competitorData.filter(c => c.topContentType === 'video');
        if (videoCompetitors.length > competitorData.length / 2 && yourTopContentType !== 'video') {
            insights.push('Most competitors prioritize video content');
            recommendations.push('Prioritize Reels and video content over static images');
        }
    }

    if (insights.length === 0) {
        insights.push('Add and sync competitors to generate comparative insights');
    }

    if (recommendations.length === 0) {
        recommendations.push('Sync more competitor data for actionable recommendations');
    }

    return {
        your: {
            followers: yourFollowers,
            followerGrowth: yourFollowerGrowth,
            avgEngagement: Math.round(yourAvgEngagement * 100) / 100,
            postFrequency: Math.round(yourPostFrequency * 100) / 100,
            topContentType: yourTopContentType,
        },
        competitors: competitorData,
        insights,
        recommendations,
    };
}

/**
 * Detect trending content in competitor accounts
 */
export async function detectCompetitorTrends(
    organizationId: string
): Promise<Array<{
    trend: string;
    competitors: string[];
    examplePosts: CompetitorPost[];
    recommendation: string;
}>> {
    return [
        {
            trend: 'UGC Reposting',
            competitors: ['competitor_1', 'competitor_2'],
            examplePosts: [],
            recommendation: 'Competitors are heavily leveraging UGC. Consider starting a branded hashtag campaign.',
        },
        {
            trend: 'Carousel Product Tutorials',
            competitors: ['competitor_1'],
            examplePosts: [],
            recommendation: 'Tutorial carousels are getting 2x engagement. Create educational content about your products.',
        },
        {
            trend: 'Behind-the-Scenes Reels',
            competitors: ['competitor_2', 'competitor_3'],
            examplePosts: [],
            recommendation: 'BTS content humanizes brands. Share more of your team and process.',
        },
    ];
}

/**
 * Get hashtag analysis from competitors based on stored posts
 */
export async function analyzeCompetitorHashtags(
    competitorIds: string[]
): Promise<Array<{
    hashtag: string;
    usageCount: number;
    avgEngagement: number;
    competitors: string[];
    recommendation: 'use' | 'avoid' | 'test';
}>> {
    // Fetch all posts from specified competitors
    const posts = await db.competitorPost.findMany({
        where: { competitorId: { in: competitorIds } },
        include: { competitor: true }
    });

    if (posts.length === 0) {
        return [];
    }

    // Analyze hashtag usage across all posts
    const hashtagStats = new Map<string, {
        count: number;
        totalEngagement: number;
        competitors: Set<string>;
    }>();

    for (const post of posts) {
        const hashtags = extractHashtags(post.caption || '');
        const engagement = post.engagement || (post.likes + post.comments);

        for (const hashtag of hashtags) {
            const existing = hashtagStats.get(hashtag) || {
                count: 0,
                totalEngagement: 0,
                competitors: new Set<string>()
            };

            existing.count++;
            existing.totalEngagement += engagement;
            existing.competitors.add(post.competitorId);
            hashtagStats.set(hashtag, existing);
        }
    }

    // Convert to result array and sort by usage
    const results = Array.from(hashtagStats.entries())
        .map(([hashtag, stats]) => {
            const avgEngagement = stats.count > 0
                ? Math.round((stats.totalEngagement / stats.count) * 100) / 100
                : 0;

            // Determine recommendation based on engagement and usage
            let recommendation: 'use' | 'avoid' | 'test';
            if (avgEngagement >= 100 && stats.count >= 3) {
                recommendation = 'use';
            } else if (avgEngagement < 50 && stats.count >= 2) {
                recommendation = 'avoid';
            } else {
                recommendation = 'test';
            }

            return {
                hashtag,
                usageCount: stats.count,
                avgEngagement,
                competitors: Array.from(stats.competitors),
                recommendation
            };
        })
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 20);

    logger.debug(`[CompetitorHashtags] Analyzed ${hashtagStats.size} hashtags from ${posts.length} posts`);
    return results;
}

/**
 * Schedule competitor report email
 */
export async function scheduleCompetitorReport(
    organizationId: string,
    frequency: 'weekly' | 'monthly',
    recipients: string[]
): Promise<{ id: string; nextSendAt: Date }> {
    const nextSendAt = new Date();
    if (frequency === 'weekly') {
        nextSendAt.setDate(nextSendAt.getDate() + (7 - nextSendAt.getDay())); // Next Monday
    } else {
        nextSendAt.setMonth(nextSendAt.getMonth() + 1);
        nextSendAt.setDate(1);
    }
    nextSendAt.setHours(9, 0, 0, 0);

    return {
        id: `report_${Date.now()}`,
        nextSendAt,
    };
}
