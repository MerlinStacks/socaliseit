/**
 * Analytics page
 * Shows real metrics from database with contextual empty states
 */

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    TrendingUp, TrendingDown, Users, Heart, MessageCircle,
    Share2, Eye, BarChart3, Calendar, FileText, Link as LinkIcon,
    ArrowUpRight, Clock, Trophy, Target
} from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { AnalyticsControls } from '@/components/analytics/analytics-controls';
import { Platform } from '@/generated/prisma/client';

export default async function AnalyticsPage(props: {
    searchParams?: Promise<{ platform?: string; range?: string }>;
}) {
    const searchParams = await props.searchParams;
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        redirect('/login');
    }

    const workspaceId = session.user.currentWorkspaceId;
    const { platform: platformFilter, range = '7d' } = searchParams || {};

    // Date range calculation
    const end = new Date();
    let start = subDays(end, 7);
    let prevStart = subDays(start, 7);

    if (range === '30d') {
        start = subDays(end, 30);
        prevStart = subDays(start, 30);
    } else if (range === '90d') {
        start = subDays(end, 90);
        prevStart = subDays(start, 90);
    } else if (range === 'year') {
        start = subDays(end, 365);
        prevStart = subDays(start, 365);
    }

    // Platform filter
    const platformEnum = platformFilter ? platformFilter.toUpperCase() as Platform : undefined;
    const platformWhere = platformEnum ? { platforms: { some: { socialAccount: { platform: platformEnum } } } } : {};

    // Common WHERE clause for Posts
    const whereBase = {
        workspaceId,
        ...platformWhere,
    };

    // Fetch real data from database
    const [
        socialAccounts,
        totalPosts,
        publishedPosts,
        scheduledPosts,
        recentPublished,
        postsInPeriod,
        previousPeriodPosts,
        competitors,
        myEngagementStats
    ] = await Promise.all([
        // Connected social accounts
        db.socialAccount.findMany({
            where: { workspaceId, isActive: true },
            select: { id: true, platform: true, name: true, username: true },
        }),

        // Total posts count
        db.post.count({ where: whereBase }),

        // Published posts count
        db.post.count({ where: { ...whereBase, status: 'PUBLISHED' } }),

        // Scheduled posts count
        db.post.count({ where: { ...whereBase, status: 'SCHEDULED' } }),

        // Recent published posts (for top posts section)
        db.post.findMany({
            where: {
                ...whereBase,
                status: 'PUBLISHED',
            },
            include: {
                platforms: {
                    include: {
                        socialAccount: true,
                        analytics: true
                    },
                },
                media: {
                    include: { media: true },
                    take: 1,
                },
            },
            orderBy: { publishedAt: 'desc' },
            take: 5,
        }),

        // Posts in current period
        db.post.count({
            where: {
                ...whereBase,
                createdAt: { gte: start, lte: end },
            },
        }),

        // Posts in previous period
        db.post.count({
            where: {
                ...whereBase,
                createdAt: {
                    gte: prevStart,
                    lt: start,
                },
            },
        }),

        // Competitors
        db.competitor.findMany({
            where: {
                workspaceId,
                ...(platformEnum ? { platform: platformEnum } : {})
            },
            orderBy: { followers: 'desc' },
            take: 5
        }),

        // My Engagement Stats (Avg Engagement Rate)
        db.postAnalytics.aggregate({
            _avg: { engagementRate: true },
            where: {
                postPlatform: {
                    socialAccount: {
                        workspaceId,
                        ...(platformEnum ? { platform: platformEnum } : {})
                    }
                }
            }
        })
    ]);

    // Build timeline data
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 12 : 12;
    const timelineData = await Promise.all(
        Array.from({ length: Math.min(days, 14) }, async (_, i) => {
            const dayStart = startOfDay(subDays(end, Math.min(days, 14) - 1 - i));
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const count = await db.post.count({
                where: {
                    ...whereBase,
                    OR: [
                        { publishedAt: { gte: dayStart, lt: dayEnd } },
                        { scheduledAt: { gte: dayStart, lt: dayEnd } },
                    ],
                },
            });

            return {
                day: format(dayStart, range === 'year' ? 'MMM' : 'EEE'),
                count,
            };
        })
    );

    // Calculate max for scaling
    const maxPosts = Math.max(...timelineData.map(d => d.count), 1);

    // Platform breakdown available
    const availablePlatforms = Array.from(new Set(socialAccounts.map(a => a.platform.toLowerCase())));

    // Platform breakdown counts
    const platformCounts = socialAccounts.reduce((acc, account) => {
        const p = account.platform.toLowerCase();
        acc[p] = (acc[p] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Filtered accounts for display count
    const displayedAccounts = platformFilter
        ? socialAccounts.filter(a => a.platform === platformEnum)
        : socialAccounts;

    // Calculate change percentage
    const postsChange = previousPeriodPosts > 0
        ? ((postsInPeriod - previousPeriodPosts) / previousPeriodPosts) * 100
        : postsInPeriod > 0 ? 100 : 0;

    const hasAccounts = socialAccounts.length > 0;
    const hasPosts = totalPosts > 0;
    const hasCompetitors = competitors.length > 0;

    const myEngagementRate = myEngagementStats._avg.engagementRate || 0;
    const competitorAvgEngagement = competitors.length > 0
        ? competitors.reduce((acc, c) => acc + c.avgEngagement, 0) / competitors.length
        : 0;

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <h1 className="text-2xl font-semibold">Analytics</h1>
                <AnalyticsControls platforms={availablePlatforms} />
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-5">
                    {/* Connected Accounts */}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-[var(--text-secondary)]">
                                {platformFilter ? 'Filtered Accounts' : 'Connected Accounts'}
                            </span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                                <Users className="h-4 w-4 text-[var(--accent-gold)]" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold">
                            {displayedAccounts.length}
                        </p>
                        <div className="mt-2 text-sm text-[var(--text-muted)]">
                            {hasAccounts
                                ? (platformFilter ? platformFilter : Object.keys(platformCounts).join(', '))
                                : 'No platforms connected'}
                        </div>
                    </div>

                    {/* Total Posts */}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-[var(--text-secondary)]">Total Posts</span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-pink-light)]">
                                <FileText className="h-4 w-4 text-[var(--accent-pink)]" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold">{totalPosts}</p>
                        <div className="mt-2 flex items-center gap-1 text-sm">
                            {postsChange >= 0 ? (
                                <TrendingUp className="h-4 w-4 text-[var(--success)]" />
                            ) : (
                                <TrendingDown className="h-4 w-4 text-[var(--error)]" />
                            )}
                            <span className={postsChange >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}>
                                {postsChange >= 0 ? '+' : ''}{Math.round(postsChange)}%
                            </span>
                            <span className="text-[var(--text-muted)]">vs last period</span>
                        </div>
                    </div>

                    {/* Published */}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-[var(--text-secondary)]">Published</span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--success-light)]">
                                <ArrowUpRight className="h-4 w-4 text-[var(--success)]" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold">{publishedPosts}</p>
                        <div className="mt-2 text-sm text-[var(--text-muted)]">
                            {Math.round((publishedPosts / Math.max(totalPosts, 1)) * 100)}% of total
                        </div>
                    </div>

                    {/* Scheduled */}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-[var(--text-secondary)]">Scheduled</span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--warning-light)]">
                                <Clock className="h-4 w-4 text-[var(--warning)]" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold">{scheduledPosts}</p>
                        <div className="mt-2 text-sm text-[var(--text-muted)]">
                            Queued for publishing
                        </div>
                    </div>
                </div>

                {/* Charts Row */}
                <div className="mt-6 grid grid-cols-2 gap-5">
                    {/* Posts Activity Chart */}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="font-semibold">Posts Activity</h3>
                                <p className="text-sm text-[var(--text-muted)]">Posts per day</p>
                            </div>
                        </div>

                        {hasPosts ? (
                            <div className="flex h-48 items-end justify-between gap-2">
                                {timelineData.map((item, i) => (
                                    <div key={i} className="flex flex-1 flex-col items-center gap-2">
                                        <div
                                            className="w-full rounded-t-md bg-gradient"
                                            style={{ height: `${Math.max((item.count / maxPosts) * 100, 5)}%` }}
                                        />
                                        <span className="text-xs text-[var(--text-muted)]">{item.day}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex h-48 items-center justify-center">
                                <div className="text-center">
                                    <BarChart3 className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                                    <p className="text-sm text-[var(--text-secondary)]">No posts yet</p>
                                    <Link href="/compose">
                                        <Button size="sm" className="mt-3">Create First Post</Button>
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Platform Distribution */}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="font-semibold">Platform Distribution</h3>
                                <p className="text-sm text-[var(--text-muted)]">Connected accounts by platform</p>
                            </div>
                        </div>

                        {hasAccounts ? (
                            <div className="space-y-4">
                                {Object.entries(platformCounts).map(([platform, count]) => {
                                    const percentage = Math.round((count / socialAccounts.length) * 100);
                                    const colors: Record<string, string> = {
                                        instagram: 'bg-pink-500',
                                        tiktok: 'bg-gray-900',
                                        youtube: 'bg-red-500',
                                        facebook: 'bg-blue-500',
                                        pinterest: 'bg-red-600',
                                        linkedin: 'bg-blue-700',
                                        bluesky: 'bg-sky-500',
                                    };

                                    return (
                                        <div key={platform} className={platformFilter && platform !== platformFilter ? 'opacity-30' : ''}>
                                            <div className="mb-1 flex items-center justify-between text-sm">
                                                <span className="capitalize">{platform}</span>
                                                <span className="font-medium">{count} account{count !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                                                <div
                                                    className={`h-full rounded-full ${colors[platform] || 'bg-gray-500'}`}
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex h-48 items-center justify-center">
                                <div className="text-center">
                                    <LinkIcon className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                                    <p className="text-sm text-[var(--text-secondary)]">No accounts connected</p>
                                    <Link href="/settings">
                                        <Button size="sm" className="mt-3">Connect Account</Button>
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Performance Comparison Section */}
                <div className="mt-6 grid grid-cols-3 gap-5">
                    {/* Comparison Chart */}
                    <div className="card col-span-2 p-5">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="font-semibold">Performance Benchmark</h3>
                                <p className="text-sm text-[var(--text-muted)]">Avg Engagement Rate vs Competitors</p>
                            </div>
                            <Link href="/competitors">
                                <Button variant="ghost" size="sm">Manage Competitors</Button>
                            </Link>
                        </div>

                        {hasCompetitors ? (
                            <div className="space-y-6">
                                {/* My Performance */}
                                <div>
                                    <div className="mb-2 flex justify-between text-sm">
                                        <span className="font-medium">You</span>
                                        <span className="font-bold text-[var(--accent-gold)]">{myEngagementRate.toFixed(2)}%</span>
                                    </div>
                                    <div className="h-4 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                                        <div
                                            className="h-full rounded-full bg-[var(--accent-gold)]"
                                            style={{ width: `${Math.min(myEngagementRate * 20, 100)}%` }} // Scaling for visual
                                        />
                                    </div>
                                </div>

                                {/* Competitor Avg */}
                                <div>
                                    <div className="mb-2 flex justify-between text-sm">
                                        <span className="font-medium text-[var(--text-secondary)]">Competitor Average</span>
                                        <span className="font-bold">{competitorAvgEngagement.toFixed(2)}%</span>
                                    </div>
                                    <div className="h-4 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                                        <div
                                            className="h-full rounded-full bg-[var(--text-secondary)]"
                                            style={{ width: `${Math.min(competitorAvgEngagement * 20, 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="pt-2 text-xs text-[var(--text-muted)] border-t border-[var(--border)]">
                                    Comparing your average post engagement rate against the average of tracked competitors.
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-32 items-center justify-center text-center">
                                <div>
                                    <Trophy className="mx-auto h-8 w-8 text-[var(--text-muted)] mb-2" />
                                    <p className="text-sm text-[var(--text-muted)]">Add competitors to enable benchmarking</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Top Competitors List */}
                    <div className="card p-0">
                        <div className="p-5 border-b border-[var(--border)]">
                            <h3 className="font-semibold">Top Competitors</h3>
                        </div>
                        {hasCompetitors ? (
                            <div className="divide-y divide-[var(--border)]">
                                {competitors.map(comp => (
                                    <div key={comp.id} className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                                                {comp.avatar ? (
                                                    <img src={comp.avatar} alt={comp.username} className="h-8 w-8 rounded-full" />
                                                ) : (
                                                    <span className="text-xs">{comp.username.charAt(0).toUpperCase()}</span>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{comp.displayName || comp.username}</p>
                                                <p className="text-xs text-[var(--text-muted)] capitalize">{comp.platform}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold">{comp.avgEngagement}%</p>
                                            <p className="text-xs text-[var(--text-muted)]">Eng. Rate</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center">
                                <Target className="mx-auto h-8 w-8 text-[var(--text-muted)] mb-2" />
                                <p className="text-sm text-[var(--text-secondary)]">No competitors</p>
                                <Link href="/competitors">
                                    <Button size="sm" variant="secondary" className="mt-2 text-xs">Add One</Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Engagement Notice */}
                <div className="mt-6 card p-5 border-l-4 border-l-[var(--accent-gold)]">
                    <div className="flex items-start gap-3">
                        <Eye className="h-5 w-5 text-[var(--accent-gold)] flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-medium mb-1">Engagement Metrics Coming Soon</h4>
                            <p className="text-sm text-[var(--text-secondary)]">
                                Detailed engagement metrics (likes, comments, shares, reach) will be available once platform API sync is configured.
                                This requires connecting your accounts with analytics permissions.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Top Posts */}
                <div className="mt-6">
                    <div className="card">
                        <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
                            <h3 className="font-semibold">Recent Published Posts</h3>
                            <Link href="/calendar" className="text-sm font-medium text-[var(--accent-gold)] hover:underline">
                                View all
                            </Link>
                        </div>

                        {recentPublished.length > 0 ? (
                            <div className="divide-y divide-[var(--border)]">
                                {recentPublished.map((post) => {
                                    // Aggregate metrics
                                    const metrics = post.platforms.reduce((acc, pp) => ({
                                        likes: acc.likes + (pp.analytics?.likes || 0),
                                        comments: acc.comments + (pp.analytics?.comments || 0),
                                        shares: acc.shares + (pp.analytics?.shares || 0)
                                    }), { likes: 0, comments: 0, shares: 0 });

                                    return (
                                        <div key={post.id} className="flex items-center gap-4 p-5">
                                            {post.media[0]?.media?.thumbnailUrl || post.media[0]?.media?.url ? (
                                                <img
                                                    src={post.media[0].media.thumbnailUrl || post.media[0].media.url}
                                                    alt=""
                                                    className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                                                />
                                            ) : (
                                                <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate font-medium">
                                                    {post.caption.slice(0, 60)}{post.caption.length > 60 ? '...' : ''}
                                                </p>
                                                <p className="text-sm text-[var(--text-muted)]">
                                                    {post.platforms.map(p => p.socialAccount?.platform?.toLowerCase()).join(', ') || 'Unknown'} •
                                                    {post.publishedAt
                                                        ? ` Published ${format(post.publishedAt, 'MMM d, h:mm a')}`
                                                        : ' Not yet published'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                                                <div className="flex items-center gap-1" title="Likes">
                                                    <Heart className="h-4 w-4" />
                                                    <span>{metrics.likes}</span>
                                                </div>
                                                <div className="flex items-center gap-1" title="Comments">
                                                    <MessageCircle className="h-4 w-4" />
                                                    <span>{metrics.comments}</span>
                                                </div>
                                                <div className="flex items-center gap-1" title="Shares">
                                                    <Share2 className="h-4 w-4" />
                                                    <span>{metrics.shares}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-8 text-center">
                                <Calendar className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                                <p className="text-[var(--text-secondary)] mb-3">No published posts yet</p>
                                <Link href="/compose">
                                    <Button>Create Your First Post</Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
