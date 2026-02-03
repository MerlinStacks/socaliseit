/**
 * Analytics Mobile Component
 * Mobile-optimized analytics with stacked stat cards and simplified charts
 * 
 * Why: Desktop analytics with 4-5 column grids is unusable on mobile;
 * this provides a scrollable card-based layout with touch-friendly controls
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    TrendingUp, TrendingDown, Users, Heart, MessageCircle,
    Share2, Eye, BarChart3, Clock, ChevronRight,
    Filter, Calendar as CalendarIcon, FileText
} from 'lucide-react';
import { MobileCard, MobileStatCard, MobileListItem } from '@/components/mobile/mobile-card';
import { MobileBottomSheet } from '@/components/mobile/mobile-bottom-sheet';
import { Button } from '@/components/ui/button';
import { triggerHaptic } from '@/hooks/use-haptic';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface EngagementMetrics {
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
    totalReach: number;
    avgEngagementRate: number;
    likesChange: number;
    commentsChange: number;
    sharesChange: number;
    reachChange: number;
}

interface TopPost {
    id: string;
    caption: string;
    thumbnail: string | null;
    platforms: string[];
    publishedAt: Date | null;
    metrics: { likes: number; comments: number; shares: number };
}

interface AnalyticsMobileProps {
    accountsCount: number;
    totalPosts: number;
    publishedPosts: number;
    scheduledPosts: number;
    postsChange: number;
    engagement: EngagementMetrics;
    hasEngagementData: boolean;
    timelineData: { day: string; count: number }[];
    topPosts: TopPost[];
    availablePlatforms: string[];
    currentPlatform: string | undefined;
    currentRange: string;
}

export function AnalyticsMobile({
    accountsCount,
    totalPosts,
    publishedPosts,
    scheduledPosts,
    postsChange,
    engagement,
    hasEngagementData,
    timelineData,
    topPosts,
    availablePlatforms,
    currentPlatform,
    currentRange,
}: AnalyticsMobileProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [showFilters, setShowFilters] = useState(false);

    // Pull to refresh
    const { containerRef, isRefreshing, pullProgress, pullDistance, canRefresh } = usePullToRefresh({
        onRefresh: async () => {
            router.refresh();
        },
    });

    /**
     * Apply filter and close sheet
     */
    const applyFilter = (platform: string | null, range: string) => {
        triggerHaptic('medium');
        const params = new URLSearchParams(searchParams.toString());

        if (platform) {
            params.set('platform', platform);
        } else {
            params.delete('platform');
        }
        params.set('range', range);

        router.push(`/analytics?${params.toString()}`);
        setShowFilters(false);
    };

    const maxPosts = Math.max(...timelineData.map(d => d.count), 1);

    return (
        <div
            ref={containerRef}
            className="flex flex-col min-h-screen bg-[var(--bg-primary)]"
        >
            {/* Header */}
            <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-secondary)]/95 backdrop-blur-lg">
                <div className="flex items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-semibold">Analytics</h1>
                    <button
                        onClick={() => {
                            triggerHaptic('light');
                            setShowFilters(true);
                        }}
                        className="flex items-center gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm"
                    >
                        <Filter className="h-4 w-4" />
                        <span>
                            {currentPlatform ? currentPlatform : 'All'} • {currentRange}
                        </span>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* Key Stats Grid - 2x2 */}
                <div className="grid grid-cols-2 gap-3">
                    <MobileStatCard
                        label="Accounts"
                        value={accountsCount}
                        icon={<Users className="h-4 w-4 text-[var(--accent-gold)]" />}
                        iconBgColor="bg-[var(--accent-gold-light)]"
                    />
                    <MobileStatCard
                        label="Total Posts"
                        value={totalPosts}
                        icon={<FileText className="h-4 w-4 text-[var(--accent-pink)]" />}
                        iconBgColor="bg-[var(--accent-pink-light)]"
                        change={postsChange}
                    />
                    <MobileStatCard
                        label="Published"
                        value={publishedPosts}
                        icon={<TrendingUp className="h-4 w-4 text-[var(--success)]" />}
                        iconBgColor="bg-[var(--success-light)]"
                    />
                    <MobileStatCard
                        label="Scheduled"
                        value={scheduledPosts}
                        icon={<Clock className="h-4 w-4 text-[var(--warning)]" />}
                        iconBgColor="bg-[var(--warning-light)]"
                    />
                </div>

                {/* Engagement Stats */}
                <MobileCard>
                    <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                        Engagement
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <EngagementStat
                            label="Likes"
                            value={engagement.totalLikes}
                            change={engagement.likesChange}
                            icon={<Heart className="h-4 w-4 text-pink-500" />}
                            hasData={hasEngagementData}
                        />
                        <EngagementStat
                            label="Comments"
                            value={engagement.totalComments}
                            change={engagement.commentsChange}
                            icon={<MessageCircle className="h-4 w-4 text-blue-500" />}
                            hasData={hasEngagementData}
                        />
                        <EngagementStat
                            label="Shares"
                            value={engagement.totalShares}
                            change={engagement.sharesChange}
                            icon={<Share2 className="h-4 w-4 text-green-500" />}
                            hasData={hasEngagementData}
                        />
                        <EngagementStat
                            label="Reach"
                            value={engagement.totalReach}
                            change={engagement.reachChange}
                            icon={<Eye className="h-4 w-4 text-purple-500" />}
                            hasData={hasEngagementData}
                        />
                    </div>

                    {/* Engagement Rate */}
                    <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-[var(--accent-gold)]" />
                            <span className="text-sm">Engagement Rate</span>
                        </div>
                        <span className="text-lg font-bold">
                            {engagement.avgEngagementRate.toFixed(2)}%
                        </span>
                    </div>
                </MobileCard>

                {/* Posts Activity Chart */}
                <MobileCard>
                    <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                        Posts Activity
                    </h3>
                    {totalPosts > 0 ? (
                        <div className="flex h-32 items-end justify-between gap-1.5">
                            {timelineData.map((item, i) => (
                                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                                    <div
                                        className="w-full rounded-t-md bg-gradient"
                                        style={{ height: `${Math.max((item.count / maxPosts) * 100, 8)}%` }}
                                    />
                                    <span className="text-[10px] text-[var(--text-muted)]">
                                        {item.day}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-32 items-center justify-center text-center">
                            <div>
                                <BarChart3 className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                                <p className="text-sm text-[var(--text-muted)]">No posts yet</p>
                            </div>
                        </div>
                    )}
                </MobileCard>

                {/* Recent Posts */}
                <MobileCard className="p-0">
                    <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                        <h3 className="font-medium">Recent Posts</h3>
                        <Link
                            href="/calendar"
                            className="text-sm text-[var(--accent-gold)]"
                        >
                            View all
                        </Link>
                    </div>

                    {topPosts.length > 0 ? (
                        <div className="divide-y divide-[var(--border)]">
                            {topPosts.slice(0, 5).map(post => (
                                <TopPostItem key={post.id} post={post} />
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center">
                            <CalendarIcon className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                            <p className="text-sm text-[var(--text-muted)] mb-3">No posts yet</p>
                            <Link href="/compose">
                                <Button size="sm">Create Post</Button>
                            </Link>
                        </div>
                    )}
                </MobileCard>
            </div>

            {/* Filters Bottom Sheet */}
            <MobileBottomSheet
                open={showFilters}
                onClose={() => setShowFilters(false)}
                title="Filters"
                snapPoints={[60]}
            >
                <div className="p-4 space-y-6">
                    {/* Date Range */}
                    <div>
                        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                            Date Range
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: '7 Days', value: '7d' },
                                { label: '30 Days', value: '30d' },
                                { label: '90 Days', value: '90d' },
                                { label: '1 Year', value: 'year' },
                            ].map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => applyFilter(currentPlatform || null, option.value)}
                                    className={cn(
                                        'rounded-xl py-3 text-sm font-medium transition-colors',
                                        currentRange === option.value
                                            ? 'bg-gradient text-white'
                                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Platform Filter */}
                    <div>
                        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                            Platform
                        </h4>
                        <div className="space-y-2">
                            <button
                                onClick={() => applyFilter(null, currentRange)}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-colors',
                                    !currentPlatform
                                        ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                        : 'bg-[var(--bg-secondary)]'
                                )}
                            >
                                All Platforms
                            </button>
                            {availablePlatforms.map(platform => (
                                <button
                                    key={platform}
                                    onClick={() => applyFilter(platform, currentRange)}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-xl px-4 py-3 capitalize transition-colors',
                                        currentPlatform === platform
                                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                            : 'bg-[var(--bg-secondary)]'
                                    )}
                                >
                                    {platform}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </MobileBottomSheet>
        </div>
    );
}

// ============================================================================
// Engagement Stat Item
// ============================================================================
interface EngagementStatProps {
    label: string;
    value: number;
    change: number;
    icon: React.ReactNode;
    hasData: boolean;
}

function EngagementStat({ label, value, change, icon, hasData }: EngagementStatProps) {
    return (
        <div className="flex items-start justify-between">
            <div>
                <div className="flex items-center gap-1.5 mb-1">
                    {icon}
                    <span className="text-xs text-[var(--text-muted)]">{label}</span>
                </div>
                <p className="text-lg font-bold">{value.toLocaleString()}</p>
            </div>
            {hasData && (
                <div className={cn(
                    'flex items-center gap-0.5 text-xs',
                    change >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'
                )}>
                    {change >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                    ) : (
                        <TrendingDown className="h-3 w-3" />
                    )}
                    <span>{change >= 0 ? '+' : ''}{Math.round(change)}%</span>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Top Post Item
// ============================================================================
interface TopPostItemProps {
    post: TopPost;
}

function TopPostItem({ post }: TopPostItemProps) {
    return (
        <div className="flex items-center gap-3 p-4">
            {post.thumbnail ? (
                <img
                    src={post.thumbnail}
                    alt=""
                    className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                />
            ) : (
                <div className="h-12 w-12 flex-shrink-0 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400" />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                    {post.caption.slice(0, 40)}{post.caption.length > 40 ? '...' : ''}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                    {post.platforms.join(', ')} •{' '}
                    {post.publishedAt ? format(new Date(post.publishedAt), 'MMM d') : 'Not published'}
                </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-0.5">
                    <Heart className="h-3 w-3" /> {post.metrics.likes}
                </span>
                <span className="flex items-center gap-0.5">
                    <MessageCircle className="h-3 w-3" /> {post.metrics.comments}
                </span>
            </div>
        </div>
    );
}
