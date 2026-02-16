/**
 * Analytics Desktop Content Component
 * Extracted desktop layout from page.tsx for 200-line standard compliance
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    TrendingUp, TrendingDown, Users, Heart, MessageCircle,
    Share2, Eye, BarChart3, Calendar, FileText, Link as LinkIcon,
    ArrowUpRight, Clock, Trophy, Target, MousePointer,
    Bookmark, Megaphone, Download, Globe, MousePointerClick
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

// Component Props
interface MetricCardProps {
    label: string;
    value: number | string;
    icon: React.ReactNode;
    iconBg: string;
    change?: number;
    sublabel?: string;
    showChange?: boolean;
}

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
    /** Heatmap data for best-time-to-post and heatmap grid */
    heatmapData: Array<{ day: number; hour: number; value: number }>;
    /** Multi-series engagement timeline for trend chart */
    engagementTimeline: EngagementTimelinePoint[];
    /** Content type performance breakdown */
    contentTypeData: ContentTypeStats[];
    /** Account-level growth data from PlatformAnalytics */
    accountGrowthData: AccountGrowthData;
    /** AI-generated plain-English insights */
    insights: Insight[];
    /** Audience demographics (age/gender/locations) */
    demographicsData: AudienceDemographicsData;
    /** Hashtag engagement rankings */
    hashtagData: HashtagPerformanceEntry[];
    /** Current vs previous period side-by-side */
    periodComparison: PeriodComparisonData;
    /** Current date range label */
    currentRange: string;
}

/**
 * Metric Card with optional trend indicator
 */
function MetricCard({ label, value, icon, iconBg, change, sublabel, showChange = false }: MetricCardProps) {
    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
                    {icon}
                </div>
            </div>
            <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {showChange && change !== undefined ? (
                <div className="mt-2 flex items-center gap-1 text-sm">
                    {change >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-[var(--success)]" />
                    ) : (
                        <TrendingDown className="h-4 w-4 text-[var(--error)]" />
                    )}
                    <span className={change >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}>
                        {change >= 0 ? '+' : ''}{Math.round(change)}%
                    </span>
                    <span className="text-[var(--text-muted)]">vs last period</span>
                </div>
            ) : sublabel ? (
                <div className="mt-2 text-sm text-[var(--text-muted)]">{sublabel}</div>
            ) : null}
        </div>
    );
}

/**
 * Posts Activity Chart
 */
function PostsActivityChart({ timelineData, hasPosts }: { timelineData: TimelinePoint[]; hasPosts: boolean }) {
    const maxPosts = Math.max(...timelineData.map(d => d.count), 1);

    return (
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
    );
}

/**
 * Platform Distribution Chart
 */
function PlatformDistribution({
    platformCounts,
    hasAccounts,
    platformFilter,
    socialAccountsCount
}: {
    platformCounts: Record<string, number>;
    hasAccounts: boolean;
    platformFilter?: string;
    socialAccountsCount: number;
}) {
    const colors: Record<string, string> = {
        instagram: 'bg-pink-500',
        tiktok: 'bg-gray-900',
        youtube: 'bg-red-500',
        facebook: 'bg-blue-500',
        pinterest: 'bg-red-600',
        linkedin: 'bg-blue-700',
        bluesky: 'bg-sky-500',
        googlebusiness: 'bg-green-500',
    };

    return (
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
                        const percentage = Math.round((count / socialAccountsCount) * 100);
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
    );
}

/**
 * Main Analytics Desktop Component
 */
export function AnalyticsDesktop(props: AnalyticsDesktopProps) {
    const {
        displayedAccountsCount, totalPosts, publishedPosts, scheduledPosts,
        postsChange, platformFilter, platformCounts, hasAccounts, hasPosts,
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
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <h1 className="text-2xl font-semibold">Analytics</h1>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {/* Filter Bar */}
                <AnalyticsControls
                    platforms={availablePlatforms}
                    onExport={() => setShowExport(true)}
                />
                {/* Summary Metrics Grid */}
                <div className="grid grid-cols-4 gap-5">
                    <MetricCard
                        label={platformFilter ? 'Filtered Accounts' : 'Connected Accounts'}
                        value={displayedAccountsCount}
                        icon={<Users className="h-4 w-4 text-[var(--accent-gold)]" />}
                        iconBg="bg-[var(--accent-gold-light)]"
                        sublabel={hasAccounts ? (platformFilter || Object.keys(platformCounts).join(', ')) : 'No platforms connected'}
                    />
                    <MetricCard
                        label="Total Posts"
                        value={totalPosts}
                        icon={<FileText className="h-4 w-4 text-[var(--accent-pink)]" />}
                        iconBg="bg-[var(--accent-pink-light)]"
                        change={postsChange}
                        showChange
                    />
                    <MetricCard
                        label="Published"
                        value={publishedPosts}
                        icon={<ArrowUpRight className="h-4 w-4 text-[var(--success)]" />}
                        iconBg="bg-[var(--success-light)]"
                        sublabel={`${Math.round((publishedPosts / Math.max(totalPosts, 1)) * 100)}% of total`}
                    />
                    <MetricCard
                        label="Scheduled"
                        value={scheduledPosts}
                        icon={<Clock className="h-4 w-4 text-[var(--warning)]" />}
                        iconBg="bg-[var(--warning-light)]"
                        sublabel="Queued for publishing"
                    />
                </div>

                {/* Account Growth Section */}
                <h2 className="mt-8 mb-4 text-lg font-semibold">Account Growth</h2>
                <div className="grid grid-cols-4 gap-5">
                    <MetricCard
                        label="Total Followers"
                        value={formatCompact(accountGrowthData.totalFollowers)}
                        icon={<Users className="h-4 w-4 text-indigo-500" />}
                        iconBg="bg-indigo-500/10"
                        sublabel="Across all accounts"
                    />
                    <MetricCard
                        label="Follower Change"
                        value={accountGrowthData.totalFollowerChange >= 0 ? `+${formatCompact(accountGrowthData.totalFollowerChange)}` : formatCompact(accountGrowthData.totalFollowerChange)}
                        icon={accountGrowthData.totalFollowerChange >= 0 ? <TrendingUp className="h-4 w-4 text-[var(--success)]" /> : <TrendingDown className="h-4 w-4 text-[var(--error)]" />}
                        iconBg={accountGrowthData.totalFollowerChange >= 0 ? 'bg-[var(--success-light)]' : 'bg-red-500/10'}
                        sublabel="In selected period"
                    />
                    <MetricCard
                        label="Profile Views"
                        value={formatCompact(accountGrowthData.totalProfileViews)}
                        icon={<Globe className="h-4 w-4 text-teal-500" />}
                        iconBg="bg-teal-500/10"
                    />
                    <MetricCard
                        label="Website Clicks"
                        value={formatCompact(accountGrowthData.totalWebsiteClicks)}
                        icon={<MousePointerClick className="h-4 w-4 text-violet-500" />}
                        iconBg="bg-violet-500/10"
                    />
                </div>
                <div className="mt-5">
                    <FollowerGrowthChart accounts={accountGrowthData.accounts} />
                </div>

                {/* AI Insights */}
                <div className="mt-6">
                    <AiInsightsPanel insights={insights} />
                </div>

                {/* Period Comparison */}
                <div className="mt-6">
                    <PeriodComparison data={periodComparison} rangeName={currentRange} />
                </div>

                {/* Engagement Metrics Row — 4 cols × 2 rows */}
                <div className="mt-6 grid grid-cols-4 gap-5">
                    <MetricCard
                        label="Total Likes"
                        value={engagement.totalLikes}
                        icon={<Heart className="h-4 w-4 text-pink-500" />}
                        iconBg="bg-pink-500/10"
                        change={engagement.likesChange}
                        showChange={hasEngagementData}
                    />
                    <MetricCard
                        label="Total Comments"
                        value={engagement.totalComments}
                        icon={<MessageCircle className="h-4 w-4 text-blue-500" />}
                        iconBg="bg-blue-500/10"
                        change={engagement.commentsChange}
                        showChange={hasEngagementData}
                    />
                    <MetricCard
                        label="Total Shares"
                        value={engagement.totalShares}
                        icon={<Share2 className="h-4 w-4 text-green-500" />}
                        iconBg="bg-green-500/10"
                        change={engagement.sharesChange}
                        showChange={hasEngagementData}
                    />
                    <MetricCard
                        label="Total Reach"
                        value={engagement.totalReach}
                        icon={<Eye className="h-4 w-4 text-purple-500" />}
                        iconBg="bg-purple-500/10"
                        change={engagement.reachChange}
                        showChange={hasEngagementData}
                    />
                    <MetricCard
                        label="Impressions"
                        value={engagement.totalImpressions}
                        icon={<Megaphone className="h-4 w-4 text-orange-500" />}
                        iconBg="bg-orange-500/10"
                        change={engagement.impressionsChange}
                        showChange={hasEngagementData}
                    />
                    <MetricCard
                        label="Saves"
                        value={engagement.totalSaves}
                        icon={<Bookmark className="h-4 w-4 text-amber-500" />}
                        iconBg="bg-amber-500/10"
                        change={engagement.savesChange}
                        showChange={hasEngagementData}
                    />
                    <MetricCard
                        label="Clicks"
                        value={engagement.totalClicks}
                        icon={<MousePointer className="h-4 w-4 text-cyan-500" />}
                        iconBg="bg-cyan-500/10"
                        change={engagement.clicksChange}
                        showChange={hasEngagementData}
                    />
                    <MetricCard
                        label="Engagement Rate"
                        value={`${engagement.avgEngagementRate.toFixed(2)}%`}
                        icon={<BarChart3 className="h-4 w-4 text-[var(--accent-gold)]" />}
                        iconBg="bg-[var(--accent-gold-light)]"
                        sublabel="Average across posts"
                    />
                </div>

                {/* Charts Row — Engagement Trend + Best Time + Platform Distribution */}
                <div className="mt-6 grid grid-cols-3 gap-5">
                    <div className="col-span-2">
                        <EngagementTrendChart data={engagementTimeline} hasPosts={hasPosts} />
                    </div>
                    <BestTimeCard slots={bestTimeSlots} />
                </div>

                {/* Heatmap + Content Type Row */}
                <div className="mt-6 grid grid-cols-3 gap-5">
                    <div className="col-span-2">
                        <EngagementHeatmapDesktop data={heatmapData} />
                    </div>
                    <ContentTypeChart data={contentTypeData} />
                </div>

                {/* Platform Distribution */}
                <div className="mt-6 grid grid-cols-2 gap-5">
                    <PostsActivityChart timelineData={timelineData} hasPosts={hasPosts} />
                    <PlatformDistribution
                        platformCounts={platformCounts}
                        hasAccounts={hasAccounts}
                        platformFilter={platformFilter}
                        socialAccountsCount={socialAccountsCount}
                    />
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
                                <div>
                                    <div className="mb-2 flex justify-between text-sm">
                                        <span className="font-medium">You</span>
                                        <span className="font-bold text-[var(--accent-gold)]">{myEngagementRate.toFixed(2)}%</span>
                                    </div>
                                    <div className="h-4 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                                        <div
                                            className="h-full rounded-full bg-[var(--accent-gold)]"
                                            style={{ width: `${Math.min(myEngagementRate * 20, 100)}%` }}
                                        />
                                    </div>
                                </div>
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
                                {recentPublished.map((post) => (
                                    <div key={post.id} className="flex items-center gap-4 p-5">
                                        {post.thumbnail ? (
                                            <img
                                                src={post.thumbnail}
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
                                                {post.platforms.join(', ') || 'Unknown'} •
                                                {post.publishedAt
                                                    ? ` Published ${format(post.publishedAt, 'MMM d, h:mm a')}`
                                                    : ' Not yet published'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                                            <div className="flex items-center gap-1" title="Likes">
                                                <Heart className="h-4 w-4" />
                                                <span>{post.metrics.likes}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title="Comments">
                                                <MessageCircle className="h-4 w-4" />
                                                <span>{post.metrics.comments}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title="Shares">
                                                <Share2 className="h-4 w-4" />
                                                <span>{post.metrics.shares}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
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

            {/* Audience Demographics */}
            <div className="mt-6">
                <AudienceDemographics data={demographicsData} />
            </div>

            {/* Hashtag Performance + Goal Tracking */}
            <div className="mt-6 grid grid-cols-2 gap-5">
                <HashtagPerformance data={hashtagData} />
                <GoalTracker
                    currentFollowers={accountGrowthData.totalFollowers}
                    currentEngagementRate={engagement.avgEngagementRate}
                    currentPostsThisWeek={publishedPosts}
                />
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

/** Format large numbers compactly: 12500 → "12.5K" */
function formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}
