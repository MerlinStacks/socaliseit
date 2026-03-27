/**
 * Dashboard Mobile Component
 * Mobile-optimized dashboard with stacked cards and swipeable sections
 * 
 * Why: Desktop 3-column grid is hard to navigate on mobile; 
 * this provides a single-column touch-friendly layout
 */

'use client';

import Link from 'next/link';
import { SPALink } from '@/components/ui/spa-link';
import { useRouter } from 'next/navigation';
import { Plus, Calendar, Clock, FileText, Zap, ListTodo, ArrowUpRight, ArrowDownRight, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileCard, MobileStatCard, MobileListItem } from '@/components/mobile/mobile-card';
import { MobileHeader } from '@/components/mobile/bottom-nav';
import { triggerHaptic } from '@/hooks/use-haptic';
import { usePullToRefresh, PullIndicator } from '@/hooks/use-pull-to-refresh';
import { format } from 'date-fns';
import { WeeklyHeatmap } from '@/components/dashboard/weekly-heatmap';
import { PlatformActivityBanner, type PlatformActivity } from '@/components/dashboard/platform-activity-banner';
import { FailedPostsBanner } from '@/components/pwa/failed-posts-banner';
import { PlatformIcon } from '@/components/compose/platform-icons';
import type { Platform } from '@/lib/platform-config';
import type { TodoPost } from './dashboard-client';

interface DashboardMobileProps {
    userName: string;
    stats: {
        connectedAccounts: number;
        platformList: string[];
        scheduledCount: number;
        totalPosts: number;
        publishedCount: number;
        draftCount: number;
    };
    upcomingPosts: Array<{
        id: string;
        caption: string;
        scheduledAt: Date | null;
        platform: string | null;
        thumbnailUrl: string | null;
    }>;
    scheduledDates: string[];
    hasAccounts: boolean;
    hasPosts: boolean;
    showGettingStarted: boolean;
    analytics: {
        publishedThisWeek: number;
        publishedChange: number;
        totalPublished: number;
        totalScheduled: number;
    };
    platformActivity: PlatformActivity[];
    todoPosts: TodoPost[];
}

export function DashboardMobile({
    userName,
    stats,
    upcomingPosts,
    scheduledDates,
    hasAccounts,
    hasPosts,
    showGettingStarted,
    analytics,
    platformActivity,
    todoPosts,
}: DashboardMobileProps) {
    const router = useRouter();

    const { containerRef, isRefreshing, pullProgress, pullDistance, canRefresh } = usePullToRefresh({
        onRefresh: async () => {
            router.refresh();
            // Small delay to let the server re-render before hiding indicator
            await new Promise(r => setTimeout(r, 800));
        },
    });

    return (
        <div ref={containerRef} className="flex flex-col min-h-screen bg-[var(--bg-primary)] relative">
            <PullIndicator progress={pullProgress} isRefreshing={isRefreshing} pullDistance={pullDistance} />
            {/* Header */}
            <div className="px-4 pt-4 pb-2">
                <h1 className="text-xl font-semibold">
                    Welcome back, {userName}!
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                    Here&apos;s what&apos;s happening
                </p>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
                <Link href="/compose">
                    <Button
                        size="sm"
                        onClick={() => triggerHaptic('medium')}
                        className="flex-shrink-0"
                    >
                        <Plus className="h-4 w-4" />
                        New Post
                    </Button>
                </Link>
                <SPALink href="/calendar">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => triggerHaptic('light')}
                        className="flex-shrink-0"
                    >
                        <Calendar className="h-4 w-4" />
                        Calendar
                    </Button>
                </SPALink>
            </div>

            {/* Failed Offline Posts Banner */}
            <FailedPostsBanner />

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-3 px-4 py-2">
                <MobileStatCard
                    label="Scheduled"
                    value={stats.scheduledCount}
                    icon={<Clock className="h-4 w-4 text-[var(--accent-pink)]" />}
                    iconBgColor="bg-[var(--accent-pink-light)]"
                    subtext="upcoming"
                />
                <MobileStatCard
                    label="Drafts"
                    value={stats.draftCount}
                    icon={<FileText className="h-4 w-4 text-[var(--text-muted)]" />}
                    iconBgColor="bg-[var(--bg-tertiary)]"
                    subtext="to do"
                />
            </div>

            {/* Content To Do */}
            {todoPosts.length > 0 && (
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <ListTodo className="h-4 w-4 text-[var(--accent-gold)]" />
                            <span className="text-sm font-medium">Content To Do</span>
                        </div>
                        <SPALink
                            href="/calendar"
                            className="text-xs text-[var(--accent-gold)] font-medium"
                            onClick={() => triggerHaptic('light')}
                        >
                            See All
                        </SPALink>
                    </div>
                    <div className="space-y-2">
                        {todoPosts.slice(0, 5).map((post) => (
                            <Link key={post.id} href={`/compose?edit=${post.id}`}>
                                <MobileListItem
                                    onClick={() => triggerHaptic('light')}
                                    showChevron
                                >
                                    <div className="flex items-center gap-2">
                                        <PlatformIcon platform={(post.platform || 'manual') as Platform} size={14} />
                                        {post.pillarColor && (
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: post.pillarColor }} />
                                        )}
                                        <p className="text-sm font-medium truncate">
                                            {post.caption ? post.caption.slice(0, 40) + (post.caption.length > 40 ? '...' : '') : 'Untitled draft'}
                                        </p>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                        {format(new Date(post.scheduledAt ?? post.createdAt), 'MMM d, h:mm a')}
                                    </p>
                                </MobileListItem>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Platform Activity Banner */}
            {platformActivity.length > 0 && (
                <div className="py-2">
                    <PlatformActivityBanner activity={platformActivity} />
                </div>
            )}

            {/* This Week Heatmap */}
            <div className="px-4 py-3">
                <MobileCard>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">This Week</span>
                        <SPALink
                            href="/calendar"
                            className="text-xs text-[var(--accent-gold)] font-medium"
                            onClick={() => triggerHaptic('light')}
                        >
                            View All →
                        </SPALink>
                    </div>
                    <WeeklyHeatmap scheduledDates={scheduledDates} variant="compact" />
                </MobileCard>
            </div>

            {/* Upcoming Posts */}
            <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Upcoming Posts</span>
                    {upcomingPosts.length > 0 && (
                        <SPALink
                            href="/calendar"
                            className="text-xs text-[var(--accent-gold)] font-medium"
                            onClick={() => triggerHaptic('light')}
                        >
                            See All
                        </SPALink>
                    )}
                </div>

                {upcomingPosts.length > 0 ? (
                    <div className="space-y-2">
                        {upcomingPosts.slice(0, 5).map((post) => (
                            <Link key={post.id} href={`/compose?edit=${post.id}`}>
                                <MobileListItem
                                    onClick={() => triggerHaptic('light')}
                                    showChevron
                                >
                                    <div className="flex items-center gap-2">
                                        <PlatformIcon platform={(post.platform || 'manual') as Platform} size={14} />
                                        <p className="text-sm font-medium truncate">
                                            {post.caption ? post.caption.slice(0, 40) + (post.caption.length > 40 ? '...' : '') : 'Untitled'}
                                        </p>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                        {post.scheduledAt
                                            ? format(post.scheduledAt, 'MMM d, h:mm a')
                                            : 'Not scheduled'}
                                    </p>
                                </MobileListItem>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <MobileCard className="text-center py-6">
                        <Calendar className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                        <p className="text-sm text-[var(--text-muted)] mb-3">
                            No scheduled posts
                        </p>
                        <Link href="/compose">
                            <Button size="sm" onClick={() => triggerHaptic('medium')}>
                                Create Post
                            </Button>
                        </Link>
                    </MobileCard>
                )}
            </div>

            {/* Analytics Summary */}
            <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-[var(--accent-gold)]" />
                        <span className="text-sm font-medium">Analytics</span>
                    </div>
                    <SPALink
                        href="/analytics"
                        className="text-xs text-[var(--accent-gold)] font-medium"
                        onClick={() => triggerHaptic('light')}
                    >
                        View All
                    </SPALink>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <MobileStatCard
                        label="This Week"
                        value={analytics.publishedThisWeek}
                        icon={<ArrowUpRight className="h-4 w-4 text-green-500" />}
                        iconBgColor="bg-green-500/10"
                        change={analytics.publishedChange !== 0 ? analytics.publishedChange : undefined}
                        subtext="published"
                    />
                    <MobileStatCard
                        label="Total Published"
                        value={analytics.totalPublished}
                        icon={<BarChart3 className="h-4 w-4 text-[var(--accent-gold)]" />}
                        iconBgColor="bg-[var(--accent-gold-light)]"
                        subtext="all time"
                    />
                </div>
            </div>

            {/* Getting Started */}
            {showGettingStarted && (
                <div className="px-4 py-3">
                    <MobileCard>
                        <div className="flex items-center gap-2 mb-3">
                            <Zap className="h-4 w-4 text-[var(--accent-gold)]" />
                            <span className="text-sm font-medium">Getting Started</span>
                        </div>
                        <div className="space-y-2">
                            {!hasAccounts && (
                                <SPALink href="/settings">
                                    <MobileListItem onClick={() => triggerHaptic('light')} showChevron>
                                        <p className="text-sm font-medium">Connect a social account</p>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            Link Instagram, TikTok, or other platforms
                                        </p>
                                    </MobileListItem>
                                </SPALink>
                            )}
                            {!hasPosts && (
                                <Link href="/compose">
                                    <MobileListItem onClick={() => triggerHaptic('light')} showChevron>
                                        <p className="text-sm font-medium">Create your first post</p>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            Write and schedule content
                                        </p>
                                    </MobileListItem>
                                </Link>
                            )}
                        </div>
                    </MobileCard>
                </div>
            )}

            {/* Bottom padding for nav */}
            <div className="h-4" />
        </div>
    );
}
