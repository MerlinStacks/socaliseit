/**
 * Dashboard home page
 * Shows real data from database or empty states for new users
 */

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, Sparkles, Clock, FileText, TrendingUp, Users, Link as LinkIcon, Zap, AlertTriangle, RefreshCcw } from 'lucide-react';
import { startOfWeek, endOfWeek, format, addDays } from 'date-fns';
import { DashboardClient } from './dashboard-client';
import { PlatformActivityBanner, type PlatformActivity } from '@/components/dashboard/platform-activity-banner';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;

    // Fetch real data from database
    const [socialAccounts, posts, scheduledPosts, problemPosts] = await Promise.all([
        db.socialAccount.findMany({
            where: { organizationId, isActive: true },
        }),
        db.post.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
            take: 10,
        }),
        db.post.findMany({
            where: {
                organizationId,
                status: 'SCHEDULED',
                scheduledAt: {
                    gte: new Date(),
                },
            },
            orderBy: { scheduledAt: 'asc' },
            take: 5,
        }),
        // Problem posts: failed, overdue scheduled, or stuck publishing
        db.post.findMany({
            where: {
                organizationId,
                OR: [
                    // Failed posts
                    { status: 'FAILED' },
                    // Overdue scheduled (past their time but not progressed)
                    { status: 'SCHEDULED', scheduledAt: { lt: new Date() } },
                    // Stuck publishing (> 10 minutes)
                    { status: 'PUBLISHING', scheduledAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { socialAccount: { select: { platform: true, name: true } } }
        }),
    ]);

    // ── Platform Activity: last published & next scheduled per account ──
    // Why: Powers the per-platform activity banner showing posting cadence
    const [lastPublished, nextScheduled] = await Promise.all([
        // Most recent published post per socialAccountId + postType pair
        db.$queryRaw<Array<{ socialAccountId: string; postType: string; latest: Date }>>`
            SELECT "socialAccountId", "postType", MAX("publishedAt") as latest
            FROM "Post"
            WHERE "organizationId" = ${organizationId}
              AND "status" = 'PUBLISHED'
              AND "socialAccountId" IS NOT NULL
              AND "publishedAt" IS NOT NULL
            GROUP BY "socialAccountId", "postType"
        `,
        // Next upcoming scheduled post per socialAccountId + postType pair
        db.$queryRaw<Array<{ socialAccountId: string; postType: string; earliest: Date }>>`
            SELECT "socialAccountId", "postType", MIN("scheduledAt") as earliest
            FROM "Post"
            WHERE "organizationId" = ${organizationId}
              AND "status" = 'SCHEDULED'
              AND "socialAccountId" IS NOT NULL
              AND "scheduledAt" > NOW()
            GROUP BY "socialAccountId", "postType"
        `,
    ]);

    // Build a lookup: accountId -> { lastPostAt, lastStoryAt, nextPostAt, nextStoryAt }
    const activityMap = new Map<string, {
        lastPostAt: Date | null;
        lastStoryAt: Date | null;
        nextPostAt: Date | null;
        nextStoryAt: Date | null;
    }>();

    for (const row of lastPublished) {
        const entry = activityMap.get(row.socialAccountId) ?? { lastPostAt: null, lastStoryAt: null, nextPostAt: null, nextStoryAt: null };
        if (row.postType === 'STORY') {
            if (!entry.lastStoryAt || new Date(row.latest) > entry.lastStoryAt) entry.lastStoryAt = new Date(row.latest);
        } else {
            if (!entry.lastPostAt || new Date(row.latest) > entry.lastPostAt) entry.lastPostAt = new Date(row.latest);
        }
        activityMap.set(row.socialAccountId, entry);
    }

    for (const row of nextScheduled) {
        const entry = activityMap.get(row.socialAccountId) ?? { lastPostAt: null, lastStoryAt: null, nextPostAt: null, nextStoryAt: null };
        if (row.postType === 'STORY') {
            if (!entry.nextStoryAt || new Date(row.earliest) < entry.nextStoryAt) entry.nextStoryAt = new Date(row.earliest);
        } else {
            if (!entry.nextPostAt || new Date(row.earliest) < entry.nextPostAt) entry.nextPostAt = new Date(row.earliest);
        }
        activityMap.set(row.socialAccountId, entry);
    }

    // Shape into PlatformActivity[] using connected accounts
    const platformActivity: PlatformActivity[] = socialAccounts.map(
        (account: { id: string; platform: string; name: string }) => {
            const entry = activityMap.get(account.id);
            return {
                platform: account.platform.toLowerCase() as Platform,
                accountName: account.name,
                lastPostAt: entry?.lastPostAt?.toISOString() ?? null,
                lastStoryAt: entry?.lastStoryAt?.toISOString() ?? null,
                nextPostAt: entry?.nextPostAt?.toISOString() ?? null,
                nextStoryAt: entry?.nextStoryAt?.toISOString() ?? null,
            };
        }
    );

    // Calculate posts per day this week
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

    const postsThisWeek = await db.post.groupBy({
        by: ['scheduledAt'],
        where: {
            organizationId,
            scheduledAt: {
                gte: weekStart,
                lte: weekEnd,
            },
        },
        _count: true,
    });

    // Build weekly data
    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        const dayPosts = postsThisWeek.filter((p: { scheduledAt: Date | null; _count: number }) =>
            p.scheduledAt && format(p.scheduledAt, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
        );
        return {
            name: format(date, 'EEE'),
            count: dayPosts.reduce((sum: number, p: { _count: number }) => sum + p._count, 0),
        };
    });

    const hasAccounts = socialAccounts.length > 0;
    const hasPosts = posts.length > 0;
    const userName = session.user.name?.split(' ')[0] || 'there';

    // Prepare stats for mobile component
    const stats = {
        connectedAccounts: socialAccounts.length,
        platformList: socialAccounts.map((a: { platform: string }) => a.platform.toLowerCase()),
        scheduledCount: scheduledPosts.length,
        totalPosts: posts.length,
        publishedCount: posts.filter((p: { status: string }) => p.status === 'PUBLISHED').length,
        draftCount: posts.filter((p: { status: string }) => p.status === 'DRAFT').length,
    };

    // Prepare upcoming posts for mobile
    const upcomingPosts = scheduledPosts.map((post: { id: string; caption: string; scheduledAt: Date | null }) => ({
        id: post.id,
        caption: post.caption,
        scheduledAt: post.scheduledAt,
    }));

    // Desktop content (existing layout)
    const desktopContent = (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Welcome back, {userName}!</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Here&apos;s what&apos;s happening with your social media
                    </p>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3 mb-6">
                <Link href="/compose">
                    <Button>
                        <Plus className="h-4 w-4" />
                        New Post
                    </Button>
                </Link>
                <Link href="/calendar">
                    <Button variant="secondary">
                        <Calendar className="h-4 w-4" />
                        View Calendar
                    </Button>
                </Link>
                <Link href="/compose?ai=true">
                    <Button variant="secondary">
                        <Sparkles className="h-4 w-4" />
                        AI Generate
                    </Button>
                </Link>
            </div>

            {/* Platform Activity Banner */}
            {platformActivity.length > 0 && (
                <PlatformActivityBanner activity={platformActivity} />
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
                                            {post.socialAccount?.platform || 'Unknown'} • {post.scheduledAt ? format(post.scheduledAt, 'MMM d, h:mm a') : 'No schedule'}
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
            <div className="grid grid-cols-3 gap-5">
                {/* Connected Accounts */}
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-[var(--text-secondary)]">Connected Accounts</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                            <Users className="h-4 w-4 text-[var(--accent-gold)]" />
                        </div>
                    </div>
                    {hasAccounts ? (
                        <>
                            <p className="text-3xl font-bold mb-2">{socialAccounts.length}</p>
                            <p className="text-sm text-[var(--text-secondary)]">
                                {socialAccounts.map((a: { platform: string }) => a.platform.toLowerCase()).join(', ')}
                            </p>
                        </>
                    ) : (
                        <div className="text-center py-4">
                            <LinkIcon className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)] mb-3">No accounts connected</p>
                            <Link href="/settings">
                                <Button size="sm">Connect Account</Button>
                            </Link>
                        </div>
                    )}
                </div>

                {/* Scheduled Posts */}
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-[var(--text-secondary)]">Upcoming Posts</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-pink-light)]">
                            <Clock className="h-4 w-4 text-[var(--accent-pink)]" />
                        </div>
                    </div>
                    {scheduledPosts.length > 0 ? (
                        <div className="space-y-2">
                            {scheduledPosts.slice(0, 3).map((post: { id: string; caption: string; scheduledAt: Date | null }) => (
                                <div key={post.id} className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm font-medium">{post.caption.slice(0, 50)}...</p>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {post.scheduledAt ? format(post.scheduledAt, 'MMM d, h:mm a') : 'Not scheduled'}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-[var(--accent-gold-light)] px-2 py-0.5 text-xs font-medium text-[var(--accent-gold)]">
                                        Scheduled
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <Calendar className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)] mb-3">No scheduled posts</p>
                            <Link href="/compose">
                                <Button size="sm">Create Post</Button>
                            </Link>
                        </div>
                    )}
                </div>

                {/* Total Posts */}
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-[var(--text-secondary)]">Total Posts</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--success-light)]">
                            <FileText className="h-4 w-4 text-[var(--success)]" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold mb-2">{posts.length}</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                        {posts.filter((p: { status: string }) => p.status === 'PUBLISHED').length} published, {posts.filter((p: { status: string }) => p.status === 'DRAFT').length} drafts
                    </p>
                </div>
            </div>

            {/* Two Column */}
            <div className="grid grid-cols-3 gap-5 mt-6">
                <div className="col-span-2">
                    <WeeklyHeatmap days={weekDays} />
                </div>
                <div>
                    <GettingStarted
                        hasAccounts={hasAccounts}
                        hasPosts={hasPosts}
                    />
                </div>
            </div>
        </div>
    );

    return (
        <DashboardClient
            userName={userName}
            stats={stats}
            upcomingPosts={upcomingPosts}
            weekDays={weekDays}
            hasAccounts={hasAccounts}
            hasPosts={hasPosts}
            desktopContent={desktopContent}
            platformActivity={platformActivity}
        />
    );
}

interface WeeklyHeatmapProps {
    days: { name: string; count: number }[];
}

function WeeklyHeatmap({ days }: WeeklyHeatmapProps) {
    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--text-secondary)]">This Week</span>
                <Link href="/calendar" className="text-sm font-medium text-[var(--accent-gold)] hover:underline">
                    View Calendar →
                </Link>
            </div>
            <div className="grid grid-cols-7 gap-3">
                {days.map((day) => (
                    <div key={day.name} className="text-center">
                        <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">{day.name}</p>
                        <div
                            className={`aspect-square rounded-lg flex items-center justify-center text-sm font-semibold ${day.count >= 3
                                ? 'bg-[var(--accent-gold)] text-white'
                                : day.count >= 1
                                    ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                                }`}
                        >
                            {day.count}
                        </div>
                    </div>
                ))}
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
