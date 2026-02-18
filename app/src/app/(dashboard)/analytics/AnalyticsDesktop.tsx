/**
 * Analytics Desktop Content Component
 * Compact, scannable analytics dashboard with tight spacing.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    Users, Heart, MessageCircle,
    Share2, Eye, BarChart3,
    MousePointer, Bookmark, Megaphone,
    Globe, MousePointerClick
} from 'lucide-react';
import { format } from 'date-fns';
import { AnalyticsControls } from '@/components/analytics/analytics-controls';
import { EngagementTrendChart } from '@/components/analytics/engagement-trend-chart';
import { ContentTypeChart } from '@/components/analytics/content-type-chart';
import { BestTimeCard, deriveBestSlots } from '@/components/analytics/best-time-card';
import { EngagementHeatmapDesktop } from '@/components/analytics/engagement-heatmap-desktop';
import { FollowerGrowthChart } from '@/components/analytics/follower-growth-chart';
import { AiInsightsPanel } from '@/components/analytics/ai-insights-panel';
import { AudienceDemographics } from '@/components/analytics/audience-demographics';
import { HashtagPerformance } from '@/components/analytics/hashtag-performance';
import { GoalTracker } from '@/components/analytics/goal-tracker';
import { PeriodComparison } from '@/components/analytics/period-comparison';
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
    instagram: new Set(['followers', 'websiteClicks', 'engagementRate', 'likes', 'comments', 'shares', 'reach', 'impressions', 'clicks']),
    // Why: `websiteClicks` not wired in API. `reach` returns 0. `profileViews` maps to `page_views_total`.
    facebook: new Set(['followers', 'profileViews', 'engagementRate', 'likes', 'comments', 'shares', 'impressions']),
    // Why: Only subscribers + viewCount + per-video likes/comments are available.
    youtube: new Set(['followers', 'impressions', 'likes', 'comments']),
    // Why: Display API only returns followers, likes_count, video_count.
    tiktok: new Set(['followers', 'likes', 'comments', 'shares']),
    // Why: Pinterest provides IMPRESSION, SAVE, PIN_CLICK, OUTBOUND_CLICK, ENGAGEMENT.
    pinterest: new Set(['followers', 'impressions', 'engagementRate', 'websiteClicks', 'saves', 'clicks']),
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
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
            <div className="text-[var(--text-muted)]">{icon}</div>
            <div className="min-w-0">
                <p className="text-xs text-[var(--text-muted)] leading-none">{label}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-sm font-semibold leading-none">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </span>
                    {showChange && change !== undefined && change !== 0 && (
                        <span className={cn(
                            'text-[10px] font-medium',
                            change >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'
                        )}>
                            {change >= 0 ? '↑' : '↓'}{Math.abs(Math.round(change))}%
                        </span>
                    )}
                </div>
            </div>
        </div>
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
        <div className="card px-4 py-3">
            <div className="flex items-center gap-3">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconColor)}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-[var(--text-muted)] leading-none">{label}</p>
                    <p className="text-lg font-bold leading-tight mt-0.5">{value}</p>
                    {sublabel && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{sublabel}</p>}
                </div>
            </div>
        </div>
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
        insights, demographicsData, hashtagData, periodComparison, currentRange
    } = props;

    const [showExport, setShowExport] = useState(false);
    const bestTimeSlots = deriveBestSlots(heatmapData);

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

                {/* KPI Row — filtered per platform */}
                {(() => {
                    const kpis = [
                        { metric: 'followers', label: 'Followers', value: fmt(accountGrowthData.totalFollowers), icon: <Users className="h-3.5 w-3.5 text-indigo-500" />, iconColor: 'bg-indigo-500/10', sublabel: accountGrowthData.totalFollowerChange !== 0 ? `${accountGrowthData.totalFollowerChange >= 0 ? '+' : ''}${fmt(accountGrowthData.totalFollowerChange)} this period` : undefined },
                        { metric: 'profileViews', label: 'Profile Views', value: fmt(accountGrowthData.totalProfileViews), icon: <Globe className="h-3.5 w-3.5 text-teal-500" />, iconColor: 'bg-teal-500/10' },
                        { metric: 'websiteClicks', label: 'Website Clicks', value: fmt(accountGrowthData.totalWebsiteClicks), icon: <MousePointerClick className="h-3.5 w-3.5 text-violet-500" />, iconColor: 'bg-violet-500/10' },
                        { metric: 'engagementRate', label: 'Engagement Rate', value: `${engagement.avgEngagementRate.toFixed(2)}%`, icon: <BarChart3 className="h-3.5 w-3.5 text-[var(--accent-gold)]" />, iconColor: 'bg-[var(--accent-gold-light)]', sublabel: 'Average across posts' },
                    ].filter(k => showMetric(platformFilter, k.metric));
                    const cols = kpis.length <= 2 ? 'grid-cols-2' : kpis.length === 3 ? 'grid-cols-3' : 'grid-cols-4';
                    return (
                        <div className={`grid ${cols} gap-3`}>
                            {kpis.map(k => (
                                <KPICard key={k.metric} label={k.label} value={k.value} icon={k.icon} iconColor={k.iconColor} sublabel={k.sublabel} />
                            ))}
                        </div>
                    );
                })()}

                {/* Engagement stats — filtered per platform, hidden when all zeroes */}
                {hasEngagementData && <div className="mt-3 flex flex-wrap gap-2">
                    {showMetric(platformFilter, 'likes') && <StatPill icon={<Heart className="h-3.5 w-3.5" />} label="Likes" value={engagement.totalLikes} change={engagement.likesChange} showChange={hasEngagementData} />}
                    {showMetric(platformFilter, 'comments') && <StatPill icon={<MessageCircle className="h-3.5 w-3.5" />} label="Comments" value={engagement.totalComments} change={engagement.commentsChange} showChange={hasEngagementData} />}
                    {showMetric(platformFilter, 'shares') && <StatPill icon={<Share2 className="h-3.5 w-3.5" />} label="Shares" value={engagement.totalShares} change={engagement.sharesChange} showChange={hasEngagementData} />}
                    {showMetric(platformFilter, 'reach') && <StatPill icon={<Eye className="h-3.5 w-3.5" />} label="Reach" value={engagement.totalReach} change={engagement.reachChange} showChange={hasEngagementData} />}
                    {showMetric(platformFilter, 'impressions') && <StatPill icon={<Megaphone className="h-3.5 w-3.5" />} label="Impressions" value={engagement.totalImpressions} change={engagement.impressionsChange} showChange={hasEngagementData} />}
                    {showMetric(platformFilter, 'saves') && <StatPill icon={<Bookmark className="h-3.5 w-3.5" />} label="Saves" value={engagement.totalSaves} change={engagement.savesChange} showChange={hasEngagementData} />}
                    {showMetric(platformFilter, 'clicks') && <StatPill icon={<MousePointer className="h-3.5 w-3.5" />} label="Clicks" value={engagement.totalClicks} change={engagement.clicksChange} showChange={hasEngagementData} />}
                </div>}

                {/* Follower Growth Chart */}
                <div className="mt-4">
                    <FollowerGrowthChart accounts={accountGrowthData.accounts} />
                </div>

                {/* AI Insights + Period Comparison — side by side */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <AiInsightsPanel insights={insights} />
                    <PeriodComparison data={periodComparison} rangeName={currentRange} />
                </div>

                {/* Charts — Engagement Trend + Best Time */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                        <EngagementTrendChart data={engagementTimeline} hasPosts={hasPosts} />
                    </div>
                    <BestTimeCard slots={bestTimeSlots} />
                </div>

                {/* Heatmap — full width for 24-column readability */}
                <div className="mt-4">
                    <EngagementHeatmapDesktop data={heatmapData} />
                </div>

                {/* Content Type + Posts Activity — side by side */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <ContentTypeChart data={contentTypeData} />
                    <PostsActivityMini timelineData={timelineData} hasPosts={hasPosts} />
                </div>

                {/* Competitors — only show if data exists */}
                {hasCompetitors && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="card p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold">Performance Benchmark</h3>
                                <Link href="/competitors">
                                    <Button variant="ghost" size="sm" className="text-xs h-7">Manage</Button>
                                </Link>
                            </div>
                            <div className="space-y-3">
                                <BenchmarkBar label="You" value={myEngagementRate} color="bg-[var(--accent-gold)]" />
                                <BenchmarkBar label="Competitor Avg" value={competitorAvgEngagement} color="bg-[var(--text-secondary)]" />
                            </div>
                        </div>
                        <div className="card p-0">
                            <div className="px-4 py-3 border-b border-[var(--border)]">
                                <h3 className="text-sm font-semibold">Top Competitors</h3>
                            </div>
                            <div className="divide-y divide-[var(--border)]">
                                {competitors.slice(0, 5).map(comp => (
                                    <div key={comp.id} className="px-4 py-2.5 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center overflow-hidden">
                                                {comp.avatar
                                                    ? <img src={comp.avatar} alt={comp.username} className="h-6 w-6 rounded-full" />
                                                    : <span className="text-[10px]">{comp.username.charAt(0).toUpperCase()}</span>
                                                }
                                            </div>
                                            <span className="text-xs font-medium truncate max-w-[120px]">{comp.displayName || comp.username}</span>
                                        </div>
                                        <span className="text-xs font-bold">{comp.avgEngagement}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Recent Posts — compact, max 3 */}
                {recentPublished.length > 0 && (
                    <div className="mt-4 card p-0">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                            <h3 className="text-sm font-semibold">Recent Posts</h3>
                            <Link href="/calendar" className="text-xs font-medium text-[var(--accent-gold)] hover:underline">View all</Link>
                        </div>
                        <div className="divide-y divide-[var(--border)]">
                            {recentPublished.slice(0, 3).map((post, idx) => {
                                const gradients = [
                                    'from-purple-400 to-pink-400',
                                    'from-blue-400 to-cyan-400',
                                    'from-amber-400 to-orange-400',
                                ];
                                return (
                                    <div key={post.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-tertiary)]/50">
                                        {post.thumbnail ? (
                                            <img src={post.thumbnail} alt="" className="h-10 w-10 flex-shrink-0 rounded-md object-cover" />
                                        ) : (
                                            <div className={`h-10 w-10 flex-shrink-0 rounded-md bg-gradient-to-br ${gradients[idx % gradients.length]}`} />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm truncate">{post.caption.slice(0, 50)}{post.caption.length > 50 ? '…' : ''}</p>
                                            <p className="text-[11px] text-[var(--text-muted)]">
                                                {post.platforms.join(', ')} • {post.publishedAt ? format(post.publishedAt, 'MMM d') : '—'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-secondary)]">
                                            <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{post.metrics.likes}</span>
                                            <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{post.metrics.comments}</span>
                                            <span className="flex items-center gap-0.5"><Share2 className="h-3 w-3" />{post.metrics.shares}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Audience Demographics */}
                <div className="mt-4">
                    <AudienceDemographics data={demographicsData} />
                </div>

                {/* Hashtag Performance + Goal Tracking */}
                <div className="mt-4 grid grid-cols-2 gap-3 pb-6">
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
