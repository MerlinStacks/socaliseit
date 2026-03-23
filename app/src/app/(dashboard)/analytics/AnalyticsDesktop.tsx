/**
 * Analytics Desktop Content Component
 * Compact, scannable analytics dashboard with tight spacing.
 */

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { SPALink } from '@/components/ui/spa-link';
import { Button } from '@/components/ui/button';
import {
    Users, Heart, MessageCircle,
    Share2, Eye, BarChart3,
    MousePointer, Bookmark, Megaphone,
    Globe, MousePointerClick, Play,
    TrendingUp, TrendingDown
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { AnalyticsControls } from '@/components/analytics/analytics-controls';
import { EngagementTrendChart } from '@/components/analytics/engagement-trend-chart';
import { ContentTypeChart } from '@/components/analytics/content-type-chart';
import { BestTimeCard, deriveBestSlots } from '@/components/analytics/best-time-card';
import { EngagementHeatmapDesktop } from '@/components/analytics/engagement-heatmap-desktop';
import { FollowerGrowthChart } from '@/components/analytics/follower-growth-chart';
import { AiAdvisorCard } from '@/components/analytics/ai-advisor-card';
import { AudienceDemographics } from '@/components/analytics/audience-demographics';
import { HashtagPerformance } from '@/components/analytics/hashtag-performance';
import { GoalTracker } from '@/components/analytics/goal-tracker';
import { PeriodComparison } from '@/components/analytics/period-comparison';
import { VideoPerformanceCard, type VideoPerformanceData } from '@/components/analytics/video-performance-card';
import { PlatformBreakdownCard, type PlatformBreakdownEntry } from '@/components/analytics/platform-breakdown-card';
import type { TopPerformingPost } from './analytics-data-video';
import { ExportModal } from '@/components/reports/export-modal';
import type {
    EngagementData, TimelinePoint, TopPost,
    EngagementTimelinePoint, ContentTypeStats, AccountGrowthData,
    AudienceDemographicsData, HashtagPerformanceEntry, PeriodComparisonData
} from './analytics-data';
import type { Insight } from './ai-insights';
import { cn } from '@/lib/utils';

// ============================================================================
// Per-Platform Metric Visibility
// ============================================================================

/**
 * Why: Each platform API only returns certain metrics. Showing zero-value tiles
 * for unsupported metrics (e.g. "Website Clicks" on YouTube) is misleading.
 * This map controls which KPI cards and stat pills render per platform.
 */
const PLATFORM_METRICS: Record<string, Set<string>> = {
    // Why: `profileViews` deprecated Jan 2025 (no replacement). `saves` is post-level only, not account.
    instagram: new Set(['followers', 'websiteClicks', 'engagementRate', 'likes', 'comments', 'shares', 'reach', 'impressions', 'clicks', 'videoViews']),
    // Why: `websiteClicks` not wired in API. `reach` returns 0. `profileViews` maps to `page_views_total`.
    facebook: new Set(['followers', 'profileViews', 'engagementRate', 'likes', 'comments', 'shares', 'impressions']),
    // Why: Only subscribers + viewCount + per-video likes/comments are available.
    youtube: new Set(['followers', 'impressions', 'likes', 'comments', 'videoViews']),
    // Why: Display API only returns followers, likes_count, video_count.
    tiktok: new Set(['followers', 'likes', 'comments', 'shares', 'videoViews']),
    // Why: Pinterest provides IMPRESSION, SAVE, PIN_CLICK, OUTBOUND_CLICK, ENGAGEMENT.
    pinterest: new Set(['followers', 'impressions', 'engagementRate', 'websiteClicks', 'saves', 'clicks']),
    // Why: Threads API returns views, likes, replies, reposts, quotes.
    threads: new Set(['likes', 'comments', 'shares', 'reach', 'impressions']),
    // Why: Bluesky AT Protocol exposes likes, reposts, replies.
    bluesky: new Set(['likes', 'comments', 'shares', 'impressions']),
};

/** Check if a metric should be visible for the current platform filter. */
function showMetric(platformFilter: string | undefined, metric: string): boolean {
    if (!platformFilter) return true; // "All" — show everything
    const allowed = PLATFORM_METRICS[platformFilter.toLowerCase()];
    return allowed ? allowed.has(metric) : true;
}

// ============================================================================
// Types
// ============================================================================

interface AnalyticsDesktopProps {
    displayedAccountsCount: number;
    totalPosts: number;
    publishedPosts: number;
    scheduledPosts: number;
    postsChange: number;
    platformFilter?: string;
    platformCounts: Record<string, number>;
    hasAccounts: boolean;
    hasPosts: boolean;
    hasCompetitors: boolean;
    hasEngagementData: boolean;
    engagement: EngagementData;
    timelineData: TimelinePoint[];
    availablePlatforms: string[];
    recentPublished: TopPost[];
    myEngagementRate: number;
    competitorAvgEngagement: number;
    competitors: Array<{
        id: string;
        username: string;
        displayName: string | null;
        platform: string;
        avatar: string | null;
        avgEngagement: number;
    }>;
    socialAccountsCount: number;
    heatmapData: Array<{ day: number; hour: number; value: number }>;
    engagementTimeline: EngagementTimelinePoint[];
    contentTypeData: ContentTypeStats[];
    accountGrowthData: AccountGrowthData;
    insights: Insight[];
    demographicsData: AudienceDemographicsData;
    hashtagData: HashtagPerformanceEntry[];
    periodComparison: PeriodComparisonData;
    currentRange: string;
    videoPerformance: VideoPerformanceData;
    platformBreakdown: PlatformBreakdownEntry[];
    topPerformingPosts: TopPerformingPost[];
}

// ============================================================================
// Compact stat pill — inline metric with icon
// ============================================================================

interface StatPillProps {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    change?: number;
    showChange?: boolean;
}

/** Small inline metric: icon + value + optional trend */
function StatPill({ icon, label, value, change, showChange }: StatPillProps) {
    return (
        <motion.div
            whileHover={{ y: -2, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="group flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-2.5 shadow-sm hover:shadow-md hover:border-[var(--accent-gold-light)] transition-all"
        >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] group-hover:bg-[var(--accent-gold-light)] group-hover:text-[var(--accent-gold)] transition-colors">
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-xs text-[var(--text-muted)] font-medium leading-none mb-1">{label}</p>
                <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold leading-none tracking-tight">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </span>
                    {showChange && change !== undefined && change !== 0 && (
                        <span className={cn(
                            'flex items-center text-[10px] font-bold px-1 rounded-sm',
                            change >= 0 ? 'text-[var(--success)] bg-[var(--success)]/10' : 'text-[var(--error)] bg-[var(--error)]/10'
                        )}>
                            {change >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                            {Math.abs(Math.round(change))}%
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ============================================================================
// Top-level metric card — used for the 4 hero stats
// ============================================================================

interface KPICardProps {
    label: string;
    value: string;
    icon: React.ReactNode;
    iconColor: string;
    sublabel?: string;
}

/** Larger card for KPI row at top */
function KPICard({ label, value, icon, iconColor, sublabel }: KPICardProps) {
    return (
        <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="group relative overflow-hidden card px-5 py-4 border border-[var(--border)] shadow-sm hover:shadow-lg hover:border-[var(--accent-gold-light)] transition-all duration-300"
        >
            {/* Background Glow Effect on Hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-secondary)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative flex items-center gap-4">
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl shadow-inner', iconColor)}>
                    {icon}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] leading-none mb-1.5">{label}</p>
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-2xl font-black tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)]"
                    >
                        {value}
                    </motion.p>
                    {sublabel && (
                        <p className="text-[11px] font-medium text-[var(--text-muted)] mt-1.5 flex items-center gap-1">
                            {sublabel.includes('+') ? <TrendingUp className="h-3 w-3 text-[var(--success)]" /> : null}
                            {sublabel.includes('-') ? <TrendingDown className="h-3 w-3 text-[var(--error)]" /> : null}
                            {sublabel}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Main Analytics Desktop Component — compact scannable layout.
 */
export function AnalyticsDesktop(props: AnalyticsDesktopProps) {
    const {
        publishedPosts, platformFilter, platformCounts, hasAccounts, hasPosts,
        hasCompetitors, hasEngagementData, engagement, timelineData,
        availablePlatforms, recentPublished, myEngagementRate,
        competitorAvgEngagement, competitors, socialAccountsCount,
        heatmapData, engagementTimeline, contentTypeData, accountGrowthData,
        insights, demographicsData, hashtagData, periodComparison, currentRange,
        videoPerformance, platformBreakdown, topPerformingPosts,
    } = props;

    const [showExport, setShowExport] = useState(false);
    const bestTimeSlots = deriveBestSlots(heatmapData);

    /** Why: Memoize advisor metrics to avoid re-triggering the API on every render */
    const advisorMetrics = useMemo(() => ({
        totalLikes: engagement.totalLikes,
        totalComments: engagement.totalComments,
        totalShares: engagement.totalShares,
        totalSaves: engagement.totalSaves,
        totalReach: engagement.totalReach,
        totalImpressions: engagement.totalImpressions,
        likesChange: engagement.likesChange,
        commentsChange: engagement.commentsChange,
        sharesChange: engagement.sharesChange,
        reachChange: engagement.reachChange,
        impressionsChange: engagement.impressionsChange,
        savesChange: engagement.savesChange,
        avgEngagementRate: engagement.avgEngagementRate,
        totalFollowers: accountGrowthData.totalFollowers,
        totalFollowerChange: accountGrowthData.totalFollowerChange,
        accounts: accountGrowthData.accounts.map(a => ({
            platform: a.platform,
            name: a.name,
            currentFollowers: a.currentFollowers,
            followerChange: a.followerChange,
        })),
        contentTypes: contentTypeData.map(ct => ({
            postType: ct.postType,
            count: ct.count,
            avgEngagement: ct.avgEngagement,
        })),
        totalPosts: props.totalPosts,
        postsChange: props.postsChange,
        rangeLabel: currentRange === '7d' ? 'Last 7 days'
            : currentRange === '30d' ? 'Last 30 days'
                : currentRange === '90d' ? 'Last 90 days'
                    : 'Last year',
    }), [engagement, accountGrowthData, contentTypeData, props.totalPosts, props.postsChange, currentRange]);

    return (
        <div className="flex h-screen flex-col">
            {/* Header — compact */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3">
                <h1 className="text-xl font-semibold">Analytics</h1>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* Filter Bar */}
                <AnalyticsControls
                    platforms={availablePlatforms}
                    onExport={() => setShowExport(true)}
                />

                {/* Row 1 — AI Advisor (full width, top prominence) */}
                <div className="mt-3">
                    <AiAdvisorCard insights={insights} metrics={advisorMetrics} />
                </div>

                {/* Row 2 — KPI Cards + Engagement Stat Pills side by side */}
                <div className="mt-3 grid grid-cols-5 gap-3">
                    {/* KPI Cards — left 2 columns */}
                    <div className="col-span-2 grid grid-cols-2 gap-2">
                        {(() => {
                            const kpis = [
                                { metric: 'followers', label: 'Followers', value: fmt(accountGrowthData.totalFollowers), icon: <Users className="h-3.5 w-3.5 text-indigo-500" />, iconColor: 'bg-indigo-500/10', sublabel: accountGrowthData.totalFollowerChange !== 0 ? `${accountGrowthData.totalFollowerChange >= 0 ? '+' : ''}${fmt(accountGrowthData.totalFollowerChange)} this period` : undefined },
                                { metric: 'profileViews', label: 'Profile Views', value: fmt(accountGrowthData.totalProfileViews), icon: <Globe className="h-3.5 w-3.5 text-teal-500" />, iconColor: 'bg-teal-500/10' },
                                { metric: 'websiteClicks', label: 'Website Clicks', value: fmt(accountGrowthData.totalWebsiteClicks), icon: <MousePointerClick className="h-3.5 w-3.5 text-violet-500" />, iconColor: 'bg-violet-500/10' },
                                { metric: 'engagementRate', label: 'Engagement Rate', value: `${engagement.avgEngagementRate.toFixed(2)}%`, icon: <BarChart3 className="h-3.5 w-3.5 text-[var(--accent-gold)]" />, iconColor: 'bg-[var(--accent-gold-light)]', sublabel: 'Average across posts' },
                            ].filter(k => showMetric(platformFilter, k.metric));
                            return kpis.map(k => (
                                <KPICard key={k.metric} label={k.label} value={k.value} icon={k.icon} iconColor={k.iconColor} sublabel={k.sublabel} />
                            ));
                        })()}
                    </div>
                    {/* Engagement Stats — right 3 columns as a wrapped grid */}
                    {hasEngagementData && (
                        <div className="col-span-3 grid grid-cols-3 gap-2 auto-rows-min content-start">
                            {showMetric(platformFilter, 'likes') && <StatPill icon={<Heart className="h-3.5 w-3.5" />} label="Likes" value={engagement.totalLikes} change={engagement.likesChange} showChange={hasEngagementData} />}
                            {showMetric(platformFilter, 'comments') && <StatPill icon={<MessageCircle className="h-3.5 w-3.5" />} label="Comments" value={engagement.totalComments} change={engagement.commentsChange} showChange={hasEngagementData} />}
                            {showMetric(platformFilter, 'shares') && <StatPill icon={<Share2 className="h-3.5 w-3.5" />} label="Shares" value={engagement.totalShares} change={engagement.sharesChange} showChange={hasEngagementData} />}
                            {showMetric(platformFilter, 'reach') && <StatPill icon={<Eye className="h-3.5 w-3.5" />} label="Reach" value={engagement.totalReach} change={engagement.reachChange} showChange={hasEngagementData} />}
                            {showMetric(platformFilter, 'impressions') && <StatPill icon={<Megaphone className="h-3.5 w-3.5" />} label="Impressions" value={engagement.totalImpressions} change={engagement.impressionsChange} showChange={hasEngagementData} />}
                            {showMetric(platformFilter, 'saves') && <StatPill icon={<Bookmark className="h-3.5 w-3.5" />} label="Saves" value={engagement.totalSaves} change={engagement.savesChange} showChange={hasEngagementData} />}
                            {showMetric(platformFilter, 'clicks') && <StatPill icon={<MousePointer className="h-3.5 w-3.5" />} label="Clicks" value={engagement.totalClicks} change={engagement.clicksChange} showChange={hasEngagementData} />}
                            {showMetric(platformFilter, 'videoViews') && engagement.totalVideoViews > 0 && <StatPill icon={<Play className="h-3.5 w-3.5" />} label="Video Views" value={engagement.totalVideoViews} change={engagement.videoViewsChange} showChange={hasEngagementData} />}
                        </div>
                    )}
                </div>

                {/* Row 3 — Engagement Trend + Period Comparison + Best Time (3-col) */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                    <EngagementTrendChart data={engagementTimeline} hasPosts={hasPosts} />
                    <PeriodComparison data={periodComparison} rangeName={currentRange} />
                    <BestTimeCard slots={bestTimeSlots} />
                </div>

                {/* Row 4 — Follower Growth + Content Type + Platform Breakdown (3-col) */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                    <FollowerGrowthChart accounts={accountGrowthData.accounts} />
                    <ContentTypeChart data={contentTypeData} />
                    <PlatformBreakdownCard data={platformBreakdown} />
                </div>

                {/* Row 5 — Heatmap + Video Performance (2-col) */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                        <EngagementHeatmapDesktop data={heatmapData} />
                    </div>
                    <VideoPerformanceCard data={videoPerformance} />
                </div>

                {/* Row 6 — Competitors + Recent Posts (2-col) */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                    {/* Competitors — only show if data exists */}
                    {hasCompetitors && (
                        <div className="card p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold">Performance Benchmark</h3>
                                <SPALink href="/competitors">
                                    <Button variant="ghost" size="sm" className="text-xs h-7">Manage</Button>
                                </SPALink>
                            </div>
                            <div className="space-y-3 mb-4">
                                <BenchmarkBar label="You" value={myEngagementRate} color="bg-[var(--accent-gold)]" />
                                <BenchmarkBar label="Competitor Avg" value={competitorAvgEngagement} color="bg-[var(--text-secondary)]" />
                            </div>
                            <div className="divide-y divide-[var(--border)] border-t border-[var(--border)] -mx-4 px-4">
                                {competitors.slice(0, 3).map(comp => (
                                    <div key={comp.id} className="py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-5 w-5 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center overflow-hidden">
                                                {comp.avatar
                                                    ? <img src={comp.avatar} alt={comp.username} className="h-5 w-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                    : <span className="text-[9px]">{comp.username.charAt(0).toUpperCase()}</span>
                                                }
                                            </div>
                                            <span className="text-xs font-medium truncate max-w-[100px]">{comp.displayName || comp.username}</span>
                                        </div>
                                        <span className="text-xs font-bold">{comp.avgEngagement}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Top Performing Content — by engagement rate */}
                    {topPerformingPosts.length > 0 && (
                        <div className="card p-0">
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
                                <h3 className="text-sm font-semibold">Top Performing</h3>
                                <SPALink href="/calendar" className="text-xs font-medium text-[var(--accent-gold)] hover:underline">View all</SPALink>
                            </div>
                            <div className="divide-y divide-[var(--border)]">
                                {topPerformingPosts.slice(0, 4).map((post, idx) => {
                                    const gradients = [
                                        'from-purple-400 to-pink-400',
                                        'from-blue-400 to-cyan-400',
                                        'from-amber-400 to-orange-400',
                                        'from-emerald-400 to-teal-400',
                                    ];
                                    return (
                                        <div key={post.id} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-tertiary)]/50">
                                            {post.thumbnail ? (
                                                <img src={post.thumbnail} alt="" className="h-8 w-8 flex-shrink-0 rounded-md object-cover" />
                                            ) : (
                                                <div className={`h-8 w-8 flex-shrink-0 rounded-md bg-gradient-to-br ${gradients[idx % gradients.length]}`} />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs truncate">{post.caption.slice(0, 40)}{post.caption.length > 40 ? '…' : ''}</p>
                                                <p className="text-[10px] text-[var(--text-muted)]">
                                                    {post.platform} • {post.publishedAt ? format(post.publishedAt, 'MMM d') : '—'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                                <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{post.likes}</span>
                                                <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{post.comments}</span>
                                                {post.shares > 0 && <span className="flex items-center gap-0.5"><Share2 className="h-3 w-3" />{post.shares}</span>}
                                                {post.videoViews > 0 && <span className="flex items-center gap-0.5"><Play className="h-3 w-3" />{post.videoViews.toLocaleString()}</span>}
                                                <span className="px-1 py-0.5 rounded-sm bg-[var(--accent-gold-light)] text-[var(--accent-gold)] font-bold text-[9px]">
                                                    {post.engagementRate.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Recent Posts — compact, with enhanced metrics */}
                    {recentPublished.length > 0 && !topPerformingPosts.length && (
                        <div className="card p-0">
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
                                <h3 className="text-sm font-semibold">Recent Posts</h3>
                                <SPALink href="/calendar" className="text-xs font-medium text-[var(--accent-gold)] hover:underline">View all</SPALink>
                            </div>
                            <div className="divide-y divide-[var(--border)]">
                                {recentPublished.slice(0, 3).map((post, idx) => {
                                    const gradients = [
                                        'from-purple-400 to-pink-400',
                                        'from-blue-400 to-cyan-400',
                                        'from-amber-400 to-orange-400',
                                    ];
                                    return (
                                        <div key={post.id} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-tertiary)]/50">
                                            {post.thumbnail ? (
                                                <img src={post.thumbnail} alt="" className="h-8 w-8 flex-shrink-0 rounded-md object-cover" />
                                            ) : (
                                                <div className={`h-8 w-8 flex-shrink-0 rounded-md bg-gradient-to-br ${gradients[idx % gradients.length]}`} />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs truncate">{post.caption.slice(0, 40)}{post.caption.length > 40 ? '…' : ''}</p>
                                                <p className="text-[10px] text-[var(--text-muted)]">
                                                    {post.platforms.join(', ')} • {post.publishedAt ? format(post.publishedAt, 'MMM d') : '—'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                                <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{post.metrics.likes}</span>
                                                <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{post.metrics.comments}</span>
                                                {post.metrics.shares > 0 && <span className="flex items-center gap-0.5"><Share2 className="h-3 w-3" />{post.metrics.shares}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Row 7 — Demographics + Hashtags + Goals (3-col) */}
                <div className="mt-3 grid grid-cols-3 gap-3 pb-6">
                    <AudienceDemographics data={demographicsData} />
                    <HashtagPerformance data={hashtagData} />
                    <GoalTracker
                        currentFollowers={accountGrowthData.totalFollowers}
                        currentEngagementRate={engagement.avgEngagementRate}
                        currentPostsThisWeek={publishedPosts}
                    />
                </div>
            </div>

            {/* Export Modal */}
            <ExportModal
                isOpen={showExport}
                onClose={() => setShowExport(false)}
                reportType="analytics"
            />
        </div>
    );
}

// ============================================================================
// Sub-Components — Compact variants
// ============================================================================

/** Benchmark progress bar */
function BenchmarkBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div>
            <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium">{label}</span>
                <span className="font-bold">{value.toFixed(2)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(value * 20, 100)}%` }} />
            </div>
        </div>
    );
}

/** Compact posts activity bar chart */
function PostsActivityMini({ timelineData, hasPosts }: { timelineData: TimelinePoint[]; hasPosts: boolean }) {
    const maxPosts = Math.max(...timelineData.map(d => d.count), 1);
    return (
        <div className="card p-4">
            <h3 className="text-sm font-semibold mb-3">Posts Activity</h3>
            {hasPosts ? (
                <div className="flex h-32 items-end justify-between gap-1">
                    {timelineData.map((item, i) => (
                        <div key={i} className="flex flex-1 flex-col items-center gap-1">
                            <div className="w-full rounded-t bg-gradient" style={{ height: `${Math.max((item.count / maxPosts) * 100, 4)}%` }} />
                            <span className="text-[10px] text-[var(--text-muted)]">{item.day}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex h-32 items-center justify-center">
                    <p className="text-xs text-[var(--text-muted)]">No posts yet</p>
                </div>
            )}
        </div>
    );
}



/** Format large numbers compactly: 12500 → "12.5K" */
function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}
