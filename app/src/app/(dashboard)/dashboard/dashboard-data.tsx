/**
 * Dashboard data-fetching server component
 * Why: Extracted from page.tsx so it can be wrapped in <Suspense>.
 * This lets the page shell (header, quick-actions) render instantly
 * while expensive DB queries stream in.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, FileText, TrendingUp, Link as LinkIcon, Zap, AlertTriangle, RefreshCcw, ListTodo, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { startOfWeek, endOfWeek, addDays, subDays } from 'date-fns';
import { PlatformIcon } from '@/components/compose/platform-icons';
import type { Platform } from '@/lib/platform-config';
import { LocalDate } from '@/components/ui/local-date';
import { WeeklyHeatmap } from '@/components/dashboard/weekly-heatmap';
import { DashboardClient } from './dashboard-client';
import { PlatformActivityBanner, type PlatformActivity } from '@/components/dashboard/platform-activity-banner';
import { cachedQuery, dashboardTags, DASHBOARD_TTL } from '@/lib/cache';
import { db } from '@/lib/db';

interface DashboardDataProps {
    organizationId: string;
    userName: string;
}

/**
 * Server component that fetches all dashboard data.
 * Rendered inside <Suspense> so the page shell appears instantly.
 */
export async function DashboardData({ organizationId, userName }: DashboardDataProps) {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

    /**
     * Cached dashboard data fetch — 2-minute TTL, invalidated on post mutations.
     * Why: Repeat visits within 2 minutes serve cached data instead of 5 DB queries.
     */
    const fetchDashboardData = cachedQuery(
        async (orgId: string, weekStartISO: string, weekEndISO: string, nowISO: string, twoWeeksISO: string) => {
            const ws = new Date(weekStartISO);
            const we = new Date(weekEndISO);
            const now = new Date(nowISO);
            const twoWeeksFromNow = new Date(twoWeeksISO);

            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const fourteenDaysAgo = new Date(now);
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

            const [
                organization, socialAccounts, posts, scheduledPosts, problemPosts,
                statusCounts,
                platformActivityRows, postsThisWeek, actionItems, todoPosts,
                publishedThisWeek, publishedLastWeek,
            ] = await Promise.all([
                db.organization.findUnique({
                    where: { id: orgId },
                    select: { createdAt: true },
                }),
                db.socialAccount.findMany({
                    where: { organizationId: orgId, isActive: true },
                }),
                db.post.findMany({
                    where: { organizationId: orgId },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                }),
                db.post.findMany({
                    where: {
                        organizationId: orgId,
                        status: 'SCHEDULED',
                        scheduledAt: { gte: new Date() },
                    },
                    orderBy: { scheduledAt: 'asc' },
                    take: 5,
                    include: {
                        socialAccount: { select: { platform: true, name: true } },
                        media: { take: 1, include: { media: { select: { thumbnailUrl: true, url: true, mimeType: true } } } },
                    },
                }),
                db.post.findMany({
                    where: {
                        organizationId: orgId,
                        OR: [
                            { status: 'FAILED' },
                            { status: 'SCHEDULED', scheduledAt: { lt: new Date() } },
                            { status: 'PUBLISHING', scheduledAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }
                        ]
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    include: { socialAccount: { select: { platform: true, name: true } } }
                }),
                db.post.groupBy({
                    by: ['status'],
                    where: { organizationId: orgId },
                    _count: true,
                }),
                db.$queryRaw<Array<{
                    socialAccountId: string;
                    postType: string;
                    lastPublished: Date | null;
                    nextScheduled: Date | null;
                }>>`
                    SELECT "socialAccountId", "postType",
                           MAX(CASE WHEN "status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL
                               THEN "publishedAt" END) as "lastPublished",
                           MIN(CASE WHEN "status" = 'SCHEDULED' AND "scheduledAt" > NOW()
                               THEN "scheduledAt" END) as "nextScheduled"
                    FROM "Post"
                    WHERE "organizationId" = ${orgId}
                      AND "socialAccountId" IS NOT NULL
                    GROUP BY "socialAccountId", "postType"
                `,
                db.post.groupBy({
                    by: ['scheduledAt'],
                    where: {
                        organizationId: orgId,
                        scheduledAt: { gte: ws, lte: we },
                    },
                    _count: true,
                }),
                db.post.findMany({
                    where: {
                        organizationId: orgId,
                        status: 'DRAFT',
                        scheduledAt: { gte: now, lte: twoWeeksFromNow },
                        OR: [{ caption: '' }, { media: { none: {} } }]
                    },
                    orderBy: { scheduledAt: 'asc' },
                    include: { socialAccount: { select: { platform: true, name: true } } }
                }),
                // Todo posts: drafts AND quick-add placeholders, closest date first
                // Why: Quick Add always sets scheduledAt, creating SCHEDULED posts with
                // autoPublish:false — these are placeholders that need user action too.
                // Sorted by scheduledAt asc so nearest deadlines appear first.
                db.post.findMany({
                    where: {
                        organizationId: orgId,
                        OR: [
                            { status: 'DRAFT' },
                            // Why: Quick Add creates SCHEDULED placeholders with no caption.
                            // Exclude real manually-scheduled posts that have content.
                            { status: 'SCHEDULED', autoPublish: false, caption: '' },
                        ],
                    },
                    orderBy: { scheduledAt: 'asc' },
                    take: 5,
                    include: {
                        socialAccount: { select: { platform: true, name: true } },
                        pillar: { select: { name: true, color: true } },
                    },
                }),
                // Analytics: posts published in the last 7 days
                db.post.count({
                    where: {
                        organizationId: orgId,
                        status: 'PUBLISHED',
                        publishedAt: { gte: sevenDaysAgo },
                    },
                }),
                // Analytics: posts published in the previous 7 days (for comparison)
                db.post.count({
                    where: {
                        organizationId: orgId,
                        status: 'PUBLISHED',
                        publishedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
                    },
                }),
            ]);

            return {
                organization, socialAccounts, posts, scheduledPosts, problemPosts,
                statusCounts, platformActivityRows, postsThisWeek, actionItems, todoPosts,
                publishedThisWeek, publishedLastWeek,
            };
        },
        ['dashboard', organizationId],
        dashboardTags(organizationId),
        DASHBOARD_TTL,
    );

    const {
        organization, socialAccounts, posts, scheduledPosts, problemPosts,
        statusCounts, platformActivityRows, postsThisWeek, actionItems, todoPosts,
        publishedThisWeek, publishedLastWeek,
    } = await fetchDashboardData(
        organizationId,
        weekStart.toISOString(),
        weekEnd.toISOString(),
        new Date().toISOString(),
        addDays(new Date(), 14).toISOString()
    );

    // Derive counts from the single groupBy result
    const totalPostCount = statusCounts.reduce((sum, row) => sum + row._count, 0);
    const publishedCount = statusCounts.find(r => r.status === 'PUBLISHED')?._count ?? 0;
    const draftCount = statusCounts.find(r => r.status === 'DRAFT')?._count ?? 0;

    // Build a lookup: accountId -> { lastPostAt, lastStoryAt, nextPostAt, nextStoryAt }
    const activityMap = new Map<string, {
        lastPostAt: Date | null;
        lastStoryAt: Date | null;
        nextPostAt: Date | null;
        nextStoryAt: Date | null;
    }>();

    for (const row of platformActivityRows) {
        const entry = activityMap.get(row.socialAccountId) ?? { lastPostAt: null, lastStoryAt: null, nextPostAt: null, nextStoryAt: null };
        if (row.postType === 'STORY') {
            if (row.lastPublished && (!entry.lastStoryAt || new Date(row.lastPublished) > entry.lastStoryAt)) {
                entry.lastStoryAt = new Date(row.lastPublished);
            }
            if (row.nextScheduled && (!entry.nextStoryAt || new Date(row.nextScheduled) < entry.nextStoryAt)) {
                entry.nextStoryAt = new Date(row.nextScheduled);
            }
        } else {
            if (row.lastPublished && (!entry.lastPostAt || new Date(row.lastPublished) > entry.lastPostAt)) {
                entry.lastPostAt = new Date(row.lastPublished);
            }
            if (row.nextScheduled && (!entry.nextPostAt || new Date(row.nextScheduled) < entry.nextPostAt)) {
                entry.nextPostAt = new Date(row.nextScheduled);
            }
        }
        activityMap.set(row.socialAccountId, entry);
    }

    // Shape into PlatformActivity[] using connected accounts
    const platformActivityData: PlatformActivity[] = socialAccounts.map(
        (account: { id: string; platform: string; name: string }) => {
            const entry = activityMap.get(account.id);
            return {
                platform: account.platform.toLowerCase() as PlatformActivity['platform'],
                accountName: account.name,
                lastPostAt: entry?.lastPostAt?.toISOString() ?? null,
                lastStoryAt: entry?.lastStoryAt?.toISOString() ?? null,
                nextPostAt: entry?.nextPostAt?.toISOString() ?? null,
                nextStoryAt: entry?.nextStoryAt?.toISOString() ?? null,
            };
        }
    );

    // Why: Pass raw ISO strings to the client for timezone-aware grouping
    const scheduledDates = postsThisWeek
        .filter((p: { scheduledAt: Date | null }) => p.scheduledAt)
        .flatMap((p: { scheduledAt: Date | null; _count: number }) =>
            Array(p._count).fill(p.scheduledAt!.toISOString())
        );

    const hasAccounts = socialAccounts.length > 0;
    const hasPosts = posts.length > 0;

    // Hide Getting Started after 7 days
    const orgAgeDays = organization?.createdAt
        ? Math.floor((Date.now() - new Date(organization.createdAt).getTime()) / 86400000)
        : 999;
    const showGettingStarted = orgAgeDays < 7 && (!hasAccounts || !hasPosts);

    // Analytics summary
    const publishedChange = publishedLastWeek > 0
        ? Math.round(((publishedThisWeek - publishedLastWeek) / publishedLastWeek) * 100)
        : publishedThisWeek > 0 ? 100 : 0;
    const analyticsData = {
        publishedThisWeek,
        publishedChange,
        totalPublished: publishedCount,
        totalScheduled: statusCounts.find(r => r.status === 'SCHEDULED')?._count ?? 0,
    };

    // Prepare stats for mobile component
    const stats = {
        connectedAccounts: socialAccounts.length,
        platformList: socialAccounts.map((a: { platform: string }) => a.platform.toLowerCase()),
        scheduledCount: scheduledPosts.length,
        totalPosts: totalPostCount,
        publishedCount,
        draftCount,
    };

    // Prepare upcoming posts for mobile
    const upcomingPosts = scheduledPosts.map((post: { id: string; caption: string; scheduledAt: Date | null; socialAccount?: { platform: string; name: string } | null; media?: Array<{ media: { thumbnailUrl: string | null; url: string; mimeType: string } }> }) => ({
        id: post.id,
        caption: post.caption,
        scheduledAt: post.scheduledAt,
        platform: post.socialAccount?.platform?.toLowerCase() ?? null,
        thumbnailUrl: post.media?.[0]?.media?.thumbnailUrl || post.media?.[0]?.media?.url || null,
    }));

    // Desktop content (existing layout — header/quick-actions moved to page.tsx for instant render)
    const desktopContent = (
        <>

            {/* Platform Activity Banner */}
            {platformActivityData.length > 0 && (
                <PlatformActivityBanner activity={platformActivityData} />
            )}

            {/* Problem Posts Alert - Only show if there are issues */}
            {problemPosts.length > 0 && (
                <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/20">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-red-400">Action Needed</h3>
                            <p className="text-sm text-[var(--text-muted)]">
                                {problemPosts.length} post{problemPosts.length > 1 ? 's' : ''} need{problemPosts.length === 1 ? 's' : ''} your attention
                            </p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {problemPosts.map((post: { id: string; caption: string; status: string; scheduledAt: Date | null; socialAccount?: { platform: string; name: string } | null }) => {
                            const statusLabel = post.status === 'FAILED' ? 'Failed' :
                                post.status === 'SCHEDULED' ? 'Overdue' : 'Stuck';
                            const statusColor = post.status === 'FAILED' ? 'bg-red-500' :
                                post.status === 'SCHEDULED' ? 'bg-orange-500' : 'bg-yellow-500';
                            return (
                                <Link
                                    key={post.id}
                                    href={`/compose?edit=${post.id}`}
                                    className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3 hover:bg-[var(--bg-secondary)] transition-colors"
                                >
                                    <span className={`rounded-full ${statusColor} px-2 py-0.5 text-xs font-medium text-white`}>
                                        {statusLabel}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm font-medium">{post.caption.slice(0, 50)}{post.caption.length > 50 ? '...' : ''}</p>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {post.socialAccount?.platform || 'Unknown'} • {post.scheduledAt ? <LocalDate date={post.scheduledAt.toISOString()} /> : 'No schedule'}
                                        </p>
                                    </div>
                                    <RefreshCcw className="h-4 w-4 text-[var(--text-muted)]" />
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-2 gap-5">
                {/* Upcoming Posts */}
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-[var(--text-secondary)]">Upcoming Posts</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-pink-light)]">
                            <Clock className="h-4 w-4 text-[var(--accent-pink)]" />
                        </div>
                    </div>
                    {scheduledPosts.length > 0 ? (
                        <div className="space-y-2">
                            {scheduledPosts.slice(0, 5).map((post: { id: string; caption: string; scheduledAt: Date | null; socialAccount?: { platform: string; name: string } | null; media?: Array<{ media: { thumbnailUrl: string | null; url: string; mimeType: string } }> }) => (
                                <Link key={post.id} href={`/compose?edit=${post.id}`} className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3 hover:bg-[var(--bg-secondary)] transition-colors">
                                    {/* Thumbnail or platform icon */}
                                    {post.media?.[0]?.media?.thumbnailUrl || post.media?.[0]?.media?.url ? (
                                        <img
                                            src={post.media[0].media.thumbnailUrl || post.media[0].media.url}
                                            alt=""
                                            className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-secondary)] flex-shrink-0">
                                            <PlatformIcon platform={(post.socialAccount?.platform?.toLowerCase() || 'manual') as Platform} size={18} />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm font-medium">{post.caption.slice(0, 50)}{post.caption.length > 50 ? '...' : ''}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <PlatformIcon platform={(post.socialAccount?.platform?.toLowerCase() || 'manual') as Platform} size={12} />
                                            <span className="text-xs text-[var(--text-muted)]">
                                                {post.scheduledAt ? <LocalDate date={post.scheduledAt.toISOString()} /> : 'Not scheduled'}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <Calendar className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)] mb-3">No scheduled posts</p>
                            <p className="text-xs text-[var(--text-muted)] mb-3 flex items-center justify-center gap-1">
                                <span>💡</span> Tip: Tuesday and Thursday mornings tend to get the best reach.
                            </p>
                            <Link href="/compose">
                                <Button size="sm">Create Post</Button>
                            </Link>
                        </div>
                    )}
                </div>

                {/* Content To Do */}
                <ContentTodoList posts={todoPosts} />
            </div>

            {/* Two Column */}
            <div className="grid grid-cols-3 gap-5 mt-6">
                <div className="col-span-2 space-y-5">
                    {actionItems.length > 0 && <ContentActionItems items={actionItems} />}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm text-[var(--text-secondary)]">This Week</span>
                            <Link href="/calendar" className="text-sm font-medium text-[var(--accent-gold)] hover:underline">
                                View Calendar →
                            </Link>
                        </div>
                        <WeeklyHeatmap scheduledDates={scheduledDates} />
                    </div>
                </div>
                <div className="space-y-5">
                    {showGettingStarted && (
                        <GettingStarted
                            hasAccounts={hasAccounts}
                            hasPosts={hasPosts}
                        />
                    )}
                    <DashboardAnalytics analytics={analyticsData} />
                </div>
            </div>
        </>
    );

    // Shape todoPosts for mobile
    const todoPostsForMobile = todoPosts.map((post: {
        id: string; caption: string; postType: string; status: string; createdAt: Date;
        scheduledAt: Date | null;
        socialAccount?: { platform: string; name: string } | null;
        pillar?: { name: string; color: string } | null;
    }) => ({
        id: post.id,
        caption: post.caption,
        postType: post.postType,
        status: post.status.toLowerCase(),
        createdAt: post.createdAt,
        scheduledAt: post.scheduledAt,
        platform: post.socialAccount?.platform?.toLowerCase() ?? null,
        accountName: post.socialAccount?.name ?? null,
        pillarName: post.pillar?.name ?? null,
        pillarColor: post.pillar?.color ?? null,
    }));

    return (
        <DashboardClient
            userName={userName}
            stats={stats}
            upcomingPosts={upcomingPosts}
            scheduledDates={scheduledDates}
            hasAccounts={hasAccounts}
            hasPosts={hasPosts}
            showGettingStarted={showGettingStarted}
            analytics={analyticsData}
            desktopContent={desktopContent}
            platformActivity={platformActivityData}
            todoPosts={todoPostsForMobile}
        />
    );
}



/**
 * Analytics summary card for the dashboard sidebar.
 * Why: Gives users a quick pulse on their publishing activity
 * without needing to visit the full analytics page.
 */
function DashboardAnalytics({ analytics }: {
    analytics: {
        publishedThisWeek: number;
        publishedChange: number;
        totalPublished: number;
        totalScheduled: number;
    };
}) {
    const { publishedThisWeek, publishedChange, totalPublished, totalScheduled } = analytics;
    const changePositive = publishedChange > 0;
    const changeNeutral = publishedChange === 0;

    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--text-secondary)]">Analytics</span>
                <Link href="/analytics" className="text-xs font-medium text-[var(--accent-gold)] hover:underline">
                    View All
                </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-lg font-semibold">{publishedThisWeek}</p>
                        {!changeNeutral && (
                            <span className={`flex items-center text-xs font-medium ${changePositive ? 'text-green-500' : 'text-red-500'}`}>
                                {changePositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {Math.abs(publishedChange)}%
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">Published this week</p>
                </div>
                <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                    <p className="text-lg font-semibold mb-1">{totalScheduled}</p>
                    <p className="text-xs text-[var(--text-muted)]">Scheduled</p>
                </div>
                <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                    <p className="text-lg font-semibold mb-1">{totalPublished}</p>
                    <p className="text-xs text-[var(--text-muted)]">Total published</p>
                </div>
                <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <BarChart3 className="h-4 w-4 text-[var(--accent-gold)]" />
                        <p className="text-sm font-semibold">
                            {publishedThisWeek > 0 ? (publishedThisWeek / 7).toFixed(1) : '0'}
                        </p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">Posts/day avg</p>
                </div>
            </div>
        </div>
    );
}

interface GettingStartedProps {
    hasAccounts: boolean;
    hasPosts: boolean;
}

function GettingStarted({ hasAccounts, hasPosts }: GettingStartedProps) {
    const steps = [
        {
            title: 'Connect a social account',
            description: 'Link your Instagram, TikTok, or other platforms',
            href: '/settings',
            icon: LinkIcon,
            completed: hasAccounts,
        },
        {
            title: 'Create your first post',
            description: 'Write and schedule content for your audience',
            href: '/compose',
            icon: FileText,
            completed: hasPosts,
        },
        {
            title: 'Set up content pillars',
            description: 'Organize your content strategy',
            href: '/pillars',
            icon: TrendingUp,
            completed: false,
        },
    ];

    const completedCount = steps.filter(s => s.completed).length;
    const allComplete = completedCount === steps.length;

    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--text-secondary)]">Getting Started</span>
                <span className="text-xs text-[var(--text-muted)]">{completedCount}/{steps.length}</span>
            </div>
            {allComplete ? (
                <div className="text-center py-4">
                    <Zap className="h-8 w-8 mx-auto text-[var(--accent-gold)] mb-2" />
                    <p className="text-sm font-medium mb-1">You&apos;re all set!</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                        Keep creating amazing content
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {steps.map((step) => (
                        <Link
                            key={step.title}
                            href={step.href}
                            className={`flex gap-3 rounded-lg p-3 transition-colors ${step.completed
                                ? 'bg-[var(--success-light)]'
                                : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]'
                                }`}
                        >
                            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${step.completed
                                ? 'bg-[var(--success)] text-white'
                                : 'bg-[var(--bg-secondary)]'
                                }`}>
                                {step.completed ? (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <step.icon className="h-4 w-4 text-[var(--accent-gold)]" />
                                )}
                            </div>
                            <div>
                                <p className={`text-sm font-medium ${step.completed ? 'text-[var(--success)]' : ''}`}>
                                    {step.title}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">{step.description}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ContentTodoList({ posts }: { posts: any[] }) {
    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--text-secondary)]">Content To Do</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                    <ListTodo className="h-4 w-4 text-[var(--accent-gold)]" />
                </div>
            </div>
            {posts.length > 0 ? (
                <div className="space-y-2">
                    {posts.slice(0, 5).map((post) => {
                        const label = post.caption
                            ? post.caption.slice(0, 50) + (post.caption.length > 50 ? '...' : '')
                            : 'Untitled draft';
                        return (
                            <Link
                                key={post.id}
                                href={`/compose?edit=${post.id}`}
                                className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3 hover:bg-[var(--bg-secondary)] transition-colors"
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-secondary)] flex-shrink-0">
                                    <PlatformIcon platform={(post.socialAccount?.platform?.toLowerCase() || 'manual') as Platform} size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm font-medium">{label}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {post.pillar?.color && (
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: post.pillar.color }} />
                                        )}
                                        <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                                            <Clock className="h-3 w-3" />
                                            <LocalDate date={new Date(post.scheduledAt ?? post.createdAt).toISOString()} />
                                        </span>
                                    </div>
                                </div>
                                <span className="rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                                    {post.status === 'SCHEDULED' ? 'Placeholder' : 'Draft'}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-4">
                    <ListTodo className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                    <p className="text-sm text-[var(--text-secondary)] mb-3">No drafts yet</p>
                    <p className="text-xs text-[var(--text-muted)] mb-3 flex items-center justify-center gap-1">
                        <span>💡</span> Use Quick Add on the calendar to plan your content.
                    </p>
                    <Link href="/calendar">
                        <Button size="sm">Open Calendar</Button>
                    </Link>
                </div>
            )}
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ContentActionItems({ items }: { items: any[] }) {
    if (!items || items.length === 0) return null;

    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--accent-pink)]">Action Required</span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-pink)] text-[10px] font-bold text-white">
                        {items.length}
                    </span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">Placeholders missing content</span>
            </div>

            <div className="space-y-2">
                {items.slice(0, 5).map((item) => (
                    <Link
                        key={item.id}
                        href={`/compose?edit=${item.id}`}
                        className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 hover:border-[var(--accent-gold)] transition-colors"
                    >
                        <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                            <Calendar className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-[var(--text-secondary)]">
                                    {item.socialAccount?.platform || 'Multi-platform'}
                                </span>
                                <span className="text-[10px] text-[var(--text-muted)]">
                                    {item.scheduledAt ? <LocalDate date={new Date(item.scheduledAt).toISOString()} /> : 'No date'}
                                </span>
                            </div>
                            <p className="truncate text-sm font-medium mt-0.5">
                                {item.caption ? 'Missing Media' : item.media?.length ? 'Missing Caption' : 'Needs Content & Media'}
                            </p>
                        </div>
                        <div className="flex-shrink-0 rounded-full bg-[var(--accent-gold)] px-3 py-1 text-xs font-semibold text-white">
                            Fill In
                        </div>
                    </Link>
                ))}
            </div>

            {items.length > 5 && (
                <Link href="/calendar" className="mt-4 block text-center text-sm font-medium text-[var(--accent-gold)] hover:underline">
                    View all {items.length} in Calendar
                </Link>
            )}
        </div>
    );
}

