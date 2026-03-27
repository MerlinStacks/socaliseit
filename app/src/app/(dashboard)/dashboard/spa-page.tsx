'use client';

/**
 * Dashboard SPA page — client-side wrapper for SPA shell navigation.
 * 
 * Why: The SSR DashboardData component does 9 DB queries server-side
 * and passes desktopContent as React.ReactNode. For SPA mode we
 * fetch the same data via API and render DashboardClient directly.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SPALink } from '@/components/ui/spa-link';
import { Button } from '@/components/ui/button';
import { Plus, Calendar } from 'lucide-react';
import { DashboardClient } from './dashboard-client';
import { SkeletonCard } from '@/components/ui/skeleton';
import { PlatformActivityBanner } from '@/components/dashboard/platform-activity-banner';
import { format } from 'date-fns';
import { WeeklyHeatmap } from '@/components/dashboard/weekly-heatmap';
import {
    Clock, FileText, TrendingUp, Link as LinkIcon,
    AlertTriangle, RefreshCcw, ListTodo, Zap
} from 'lucide-react';

function DashboardDataSkeleton() {
    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="skeleton h-8 w-52 mb-2" />
                    <div className="skeleton h-4 w-72" />
                </div>
            </div>
            <div className="flex gap-3 mb-6">
                <div className="skeleton h-10 w-28 rounded-lg" />
                <div className="skeleton h-10 w-32 rounded-lg" />
                <div className="skeleton h-10 w-28 rounded-lg" />
            </div>
            <div className="skeleton h-16 w-full rounded-xl mb-6" />
            <div className="grid grid-cols-2 gap-5">
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <div className="grid grid-cols-3 gap-5 mt-6">
                <div className="col-span-2"><SkeletonCard className="h-48" /></div>
                <div><SkeletonCard className="h-48" /></div>
            </div>
        </div>
    );
}

export default function DashboardSPAPage() {
    const { data, isLoading } = useQuery({
        queryKey: ['dashboard-data'],
        queryFn: async () => {
            const res = await fetch('/api/dashboard/data');
            if (!res.ok) throw new Error('Failed to fetch dashboard data');
            return res.json();
        },
        staleTime: 2 * 60_000,
    });

    if (isLoading || !data) return <DashboardDataSkeleton />;

    // Build desktop content from API data (replicating server component output)
    const desktopContent = (
        <>
            {/* Platform Activity Banner */}
            {data.platformActivity.length > 0 && (
                <PlatformActivityBanner activity={data.platformActivity} />
            )}

            {/* Problem Posts Alert */}
            {data.problemPosts.length > 0 && (
                <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/20">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-red-400">Action Needed</h3>
                            <p className="text-sm text-[var(--text-muted)]">
                                {data.problemPosts.length} post{data.problemPosts.length > 1 ? 's' : ''} need{data.problemPosts.length === 1 ? 's' : ''} your attention
                            </p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {data.problemPosts.map((post: any) => {
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
                                        <p className="truncate text-sm font-medium">{post.caption?.slice(0, 50)}{post.caption?.length > 50 ? '...' : ''}</p>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {post.socialAccount?.platform || 'Unknown'} • {post.scheduledAt ? format(new Date(post.scheduledAt), 'MMM d, h:mm a') : 'No schedule'}
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
                    {data.scheduledPosts.length > 0 ? (
                        <div className="space-y-2">
                            {data.scheduledPosts.slice(0, 3).map((post: any) => (
                                <Link key={post.id} href={`/compose?edit=${post.id}`} className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3 hover:bg-[var(--bg-secondary)] transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm font-medium">{post.caption?.slice(0, 50)}{post.caption?.length > 50 ? '...' : ''}</p>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {post.scheduledAt ? format(new Date(post.scheduledAt), 'MMM d, h:mm a') : 'Not scheduled'}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-[var(--accent-gold-light)] px-2 py-0.5 text-xs font-medium text-[var(--accent-gold)]">
                                        Scheduled
                                    </span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <Calendar className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)] mb-3">No scheduled posts</p>
                            <Link href="/compose"><Button size="sm">Create Post</Button></Link>
                        </div>
                    )}
                </div>

                {/* Content To Do */}
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-[var(--text-secondary)]">Content To Do</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                            <ListTodo className="h-4 w-4 text-[var(--accent-gold)]" />
                        </div>
                    </div>
                    {data.todoPosts.length > 0 ? (
                        <div className="space-y-2">
                            {data.todoPosts.map((post: any) => (
                                <Link key={post.id} href={`/compose?edit=${post.id}`} className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3 hover:bg-[var(--bg-secondary)] transition-colors">
                                    {post.pillarColor && (
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: post.pillarColor }} />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm font-medium">
                                            {post.caption ? post.caption.slice(0, 50) + (post.caption.length > 50 ? '...' : '') : 'Needs Content'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-[var(--text-muted)]">{post.platform || 'No platform'}</span>
                                            <span className="text-[10px] text-[var(--text-muted)]">•</span>
                                            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                                                <Clock className="h-3 w-3" />
                                                {format(new Date(post.scheduledAt ?? post.createdAt), 'MMM d, h:mm a')}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">{post.status === 'scheduled' ? 'Placeholder' : 'Draft'}</span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <ListTodo className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                            <p className="text-sm text-[var(--text-secondary)] mb-3">No drafts yet</p>
                            <SPALink href="/calendar"><Button size="sm">Open Calendar</Button></SPALink>
                        </div>
                    )}
                </div>
            </div>

            {/* Weekly Heatmap + Getting Started */}
            <div className="grid grid-cols-3 gap-5 mt-6">
                <div className="col-span-2">
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm text-[var(--text-secondary)]">This Week</span>
                            <SPALink href="/calendar" className="text-sm font-medium text-[var(--accent-gold)] hover:underline">
                                View Calendar →
                            </SPALink>
                        </div>
                        <WeeklyHeatmap scheduledDates={data.scheduledDates ?? data.weekDays?.flatMap?.(() => []) ?? []} />
                    </div>
                </div>
                <div>
                    <GettingStarted hasAccounts={data.hasAccounts} hasPosts={data.hasPosts} />
                </div>
            </div>
        </>
    );

    return (
        <div className="p-4 md:p-8">
            <div className="hidden md:flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Welcome back, {data.userName}!</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Here&apos;s what&apos;s happening with your social media
                    </p>
                </div>
            </div>

            <div className="hidden md:flex gap-3 mb-6">
                <Link href="/compose"><Button><Plus className="h-4 w-4" />New Post</Button></Link>
                <SPALink href="/calendar"><Button variant="secondary"><Calendar className="h-4 w-4" />View Calendar</Button></SPALink>
            </div>

            <DashboardClient
                userName={data.userName}
                stats={data.stats}
                upcomingPosts={data.upcomingPosts}
                scheduledDates={data.scheduledDates ?? []}
                hasAccounts={data.hasAccounts}
                hasPosts={data.hasPosts}
                showGettingStarted={!(data.hasAccounts && data.hasPosts)}
                analytics={data.analytics ?? {
                    publishedThisWeek: 0,
                    publishedChange: 0,
                    totalPublished: data.stats?.publishedCount ?? 0,
                    totalScheduled: data.stats?.scheduledCount ?? 0,
                }}
                desktopContent={desktopContent}
                platformActivity={data.platformActivity}
                todoPosts={data.todoPosts}
            />
        </div>
    );
}

function GettingStarted({ hasAccounts, hasPosts }: { hasAccounts: boolean; hasPosts: boolean }) {
    const steps = [
        { title: 'Connect a social account', description: 'Link your Instagram, TikTok, or other platforms', href: '/settings', icon: LinkIcon, completed: hasAccounts },
        { title: 'Create your first post', description: 'Write and schedule content for your audience', href: '/compose', icon: FileText, completed: hasPosts },
        { title: 'Set up content pillars', description: 'Organize your content strategy', href: '/pillars', icon: TrendingUp, completed: false },
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
                    <p className="text-xs text-[var(--text-secondary)]">Keep creating amazing content</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {steps.map((step) => (
                        <SPALink key={step.title} href={step.href}
                            className={`flex gap-3 rounded-lg p-3 transition-colors ${step.completed ? 'bg-[var(--success-light)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]'}`}>
                            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${step.completed ? 'bg-[var(--success)] text-white' : 'bg-[var(--bg-secondary)]'}`}>
                                {step.completed ? (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                ) : (
                                    <step.icon className="h-4 w-4 text-[var(--accent-gold)]" />
                                )}
                            </div>
                            <div>
                                <p className={`text-sm font-medium ${step.completed ? 'text-[var(--success)]' : ''}`}>{step.title}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{step.description}</p>
                            </div>
                        </SPALink>
                    ))}
                </div>
            )}
        </div>
    );
}
