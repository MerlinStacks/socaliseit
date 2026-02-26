/**
 * Dashboard Mobile Component
 * Mobile-optimized dashboard with stacked cards and swipeable sections
 * 
 * Why: Desktop 3-column grid is hard to navigate on mobile; 
 * this provides a single-column touch-friendly layout
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Calendar, Sparkles, Clock, FileText, Zap, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileCard, MobileStatCard, MobileListItem } from '@/components/mobile/mobile-card';
import { MobileHeader } from '@/components/mobile/bottom-nav';
import { triggerHaptic } from '@/hooks/use-haptic';
import { usePullToRefresh, PullIndicator } from '@/hooks/use-pull-to-refresh';
import { format } from 'date-fns';
import { PlatformActivityBanner, type PlatformActivity } from '@/components/dashboard/platform-activity-banner';
import { FailedPostsBanner } from '@/components/pwa/failed-posts-banner';
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
    }>;
    weekDays: Array<{ name: string; count: number }>;
    hasAccounts: boolean;
    hasPosts: boolean;
    platformActivity: PlatformActivity[];
    todoPosts: TodoPost[];
}

export function DashboardMobile({
    userName,
    stats,
    upcomingPosts,
    weekDays,
    hasAccounts,
    hasPosts,
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
                <Link href="/calendar">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => triggerHaptic('light')}
                        className="flex-shrink-0"
                    >
                        <Calendar className="h-4 w-4" />
                        Calendar
                    </Button>
                </Link>
                <Link href="/compose?ai=true">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => triggerHaptic('light')}
                        className="flex-shrink-0"
                    >
                        <Sparkles className="h-4 w-4" />
                        AI Generate
                    </Button>
                </Link>
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
                        <Link
                            href="/calendar"
                            className="text-xs text-[var(--accent-gold)] font-medium"
                            onClick={() => triggerHaptic('light')}
                        >
                            See All
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {todoPosts.slice(0, 5).map((post) => (
                            <Link key={post.id} href={`/compose?edit=${post.id}`}>
                                <MobileListItem
                                    onClick={() => triggerHaptic('light')}
                                    showChevron
                                >
                                    <div className="flex items-center gap-2">
                                        {post.pillarColor && (
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: post.pillarColor }} />
                                        )}
                                        <p className="text-sm font-medium truncate">
                                            {post.caption ? post.caption.slice(0, 40) + (post.caption.length > 40 ? '...' : '') : 'Needs Content'}
                                        </p>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                        {post.platform || 'No platform'}
                                        {post.scheduledAt && ` • ${format(new Date(post.scheduledAt), 'MMM d, h:mm a')}`}
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
                        <Link
                            href="/calendar"
                            className="text-xs text-[var(--accent-gold)] font-medium"
                            onClick={() => triggerHaptic('light')}
                        >
                            View All →
                        </Link>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {weekDays.map((day) => (
                            <div key={day.name} className="text-center">
                                <p className="mb-1.5 text-[10px] font-medium text-[var(--text-muted)]">
                                    {day.name}
                                </p>
                                <div
                                    className={`aspect-square rounded-lg flex items-center justify-center text-xs font-semibold ${day.count >= 3
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
                </MobileCard>
            </div>

            {/* Upcoming Posts */}
            <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Upcoming Posts</span>
                    {upcomingPosts.length > 0 && (
                        <Link
                            href="/calendar"
                            className="text-xs text-[var(--accent-gold)] font-medium"
                            onClick={() => triggerHaptic('light')}
                        >
                            See All
                        </Link>
                    )}
                </div>

                {upcomingPosts.length > 0 ? (
                    <div className="space-y-2">
                        {upcomingPosts.slice(0, 3).map((post) => (
                            <MobileListItem
                                key={post.id}
                                onClick={() => triggerHaptic('light')}
                                showChevron
                            >
                                <p className="text-sm font-medium truncate">
                                    {post.caption.slice(0, 40)}...
                                </p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                    {post.scheduledAt
                                        ? format(post.scheduledAt, 'MMM d, h:mm a')
                                        : 'Not scheduled'}
                                </p>
                            </MobileListItem>
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

            {/* Getting Started */}
            {(!hasAccounts || !hasPosts) && (
                <div className="px-4 py-3">
                    <MobileCard>
                        <div className="flex items-center gap-2 mb-3">
                            <Zap className="h-4 w-4 text-[var(--accent-gold)]" />
                            <span className="text-sm font-medium">Getting Started</span>
                        </div>
                        <div className="space-y-2">
                            {!hasAccounts && (
                                <Link href="/settings">
                                    <MobileListItem onClick={() => triggerHaptic('light')} showChevron>
                                        <p className="text-sm font-medium">Connect a social account</p>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            Link Instagram, TikTok, or other platforms
                                        </p>
                                    </MobileListItem>
                                </Link>
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
