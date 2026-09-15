/**
 * Performance Metrics Panel
 * Displays post analytics in a VistaSocial-style 2-column grid
 * 
 * Why: Published posts need to show performance data including impressions,
 * reach, shares, likes, comments, and video-specific metrics.
 * Only metrics that the platform+postType actually tracks are displayed —
 * unsupported metrics are hidden rather than showing misleading zeros.
 */

'use client';

import { Eye, Users, Share2, ThumbsUp, MessageCircle, Play, Clock } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { StoryPerformance } from './story-performance';

interface PostAnalytics {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    videoViews: number;
    videoWatchTime: number;
    avgWatchPercentage: number | null;
    syncedAt: string | null;
    platformMetrics?: unknown;
}

interface PerformanceMetricsProps {
    analytics?: PostAnalytics | null;
    isVideo?: boolean;
    /** Why: Needed to determine which metrics are tracked for this post type */
    platform?: string;
    /** Why: Stories, Reels, Pins, etc. each support different metric sets */
    postType?: string;
}

interface MetricCardProps {
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    description: string;
    value: number | string;
}

// ---------------------------------------------------------------------------
// Metric availability per platform + postType
// ---------------------------------------------------------------------------

type MetricKey = 'impressions' | 'reach' | 'shares' | 'likes' | 'comments' | 'views';

/**
 * Why: Each platform+postType combination only supports a subset of metrics.
 * Showing "0 Likes" on a Facebook Story is misleading because Stories don't
 * track likes at all. This map defines which metrics to render.
 *
 * Default (not listed): all standard metrics shown.
 */
const HIDDEN_METRICS: Record<string, Set<MetricKey>> = {
    // Public YouTube video statistics do not report these metrics. Older rows
    // contain views copied into impressions/reach and a placeholder zero shares.
    'youtube:*':       new Set(['impressions', 'reach', 'shares']),
    // Facebook Stories: only impressions/reach
    'facebook:story':   new Set(['likes', 'comments', 'shares']),
    // Instagram Stories: no likes or shares, only impressions, reach, replies
    'instagram:story':  new Set(['likes', 'shares']),
    // Pinterest Pins: no comments or shares in the API
    'pinterest:pin':    new Set(['comments', 'shares']),
    'pinterest:feed':   new Set(['comments', 'shares']),
    // TikTok returns views and engagement, not impressions or unique reach.
    'tiktok:*':        new Set(['impressions', 'reach']),
    // Threads: no shares
    'threads:thread':   new Set(['shares']),
    'threads:feed':     new Set(['shares']),
};

/**
 * Determine whether a metric should be shown for a given platform+postType.
 * Why: Returns true by default for unknown combos — safe to show everything.
 */
function isMetricSupported(platform?: string, postType?: string, metric?: MetricKey): boolean {
    if (!platform || !metric) return true;
    const key = `${platform.toLowerCase()}:${(postType || 'feed').toLowerCase()}`;
    return !HIDDEN_METRICS[`${platform.toLowerCase()}:*`]?.has(metric)
        && !HIDDEN_METRICS[key]?.has(metric);
}

/**
 * Individual metric card component
 * Why: Matches VistaSocial design with icon, label, description, and prominent value
 */
function MetricCard({ icon, iconBg, label, description, value }: MetricCardProps) {
    return (
        <div className="rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--border)] p-4 hover:bg-[var(--bg-tertiary)] transition-colors">
            <div className="flex items-start gap-3">
                <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0',
                    iconBg
                )}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2">{description}</p>
                </div>
            </div>
            <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
        </div>
    );
}

/**
 * Format watch time from seconds to human-readable format
 */
function formatWatchTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function PerformanceMetrics({ analytics, isVideo = false, platform, postType }: PerformanceMetricsProps) {
    if (postType?.toLowerCase() === 'story' && ['facebook', 'instagram'].includes(platform?.toLowerCase() ?? '')) {
        return <StoryPerformance platform={platform!} analytics={analytics} />;
    }
    const isTikTok = platform?.toLowerCase() === 'tiktok';
    if (isTikTok && !analytics) {
        return (
            <div className="border-t border-[var(--border)] px-5 py-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Performance</h3>
                <p className="mt-3 text-sm text-[var(--text-muted)]">Performance unavailable</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                    TikTok has not returned analytics for this post. Only eligible public videos are supported;
                    photo or private posts may not be available. If this persists, verify your TikTok connection permissions.
                </p>
            </div>
        );
    }

    // Why: Google retired local-post insights without a replacement. Ignore
    // legacy placeholder rows too; location totals cannot be attributed to a post.
    if (platform?.toLowerCase() === 'google_business') {
        return (
            <div className="border-t border-[var(--border)] px-5 py-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Performance</h3>
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 p-4">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Post analytics unavailable</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Google Business Profile no longer provides analytics for individual posts.
                        Search and Maps impressions, website clicks, calls, and direction requests
                        are business-level metrics, not results for this post.
                    </p>
                    <a
                        href="https://developers.google.com/my-business/content/sunset-dates"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-sm text-[var(--text-primary)] underline underline-offset-4"
                    >
                        About Google’s analytics availability
                    </a>
                </div>
            </div>
        );
    }

    if (!analytics) return null;

    const iconClass = 'h-5 w-5';
    const isYouTube = platform?.toLowerCase() === 'youtube';

    /** Why: Shorthand to avoid repeating the platform+postType check */
    const show = (metric: MetricKey) => isMetricSupported(platform, postType, metric);

    return (
        <div className="border-t border-[var(--border)] px-5 py-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Performance</h3>
                {analytics.syncedAt && (
                    <span className="text-xs text-[var(--text-muted)]">
                        Last updated {format(new Date(analytics.syncedAt), 'MMM d, yyyy')}
                    </span>
                )}
            </div>

            {/* Metrics Grid - 2 columns like VistaSocial */}
            <div className="grid grid-cols-2 gap-3">
                {show('impressions') && (
                    <MetricCard
                        icon={<Eye className={cn(iconClass, 'text-pink-500')} />}
                        iconBg="bg-pink-500/20"
                        label="Impressions"
                        description="Number of times this post has been seen."
                        value={analytics.impressions}
                    />
                )}
                {show('reach') && (
                    <MetricCard
                        icon={<Users className={cn(iconClass, 'text-purple-500')} />}
                        iconBg="bg-purple-500/20"
                        label="Reach"
                        description="Number of unique users that have seen this post."
                        value={analytics.reach}
                    />
                )}
                {show('shares') && (
                    <MetricCard
                        icon={<Share2 className={cn(iconClass, 'text-green-500')} />}
                        iconBg="bg-green-500/20"
                        label="Shares"
                        description="Number of times this post has been shared."
                        value={analytics.shares}
                    />
                )}
                {show('likes') && (
                    <MetricCard
                        icon={<ThumbsUp className={cn(iconClass, 'text-blue-500')} />}
                        iconBg="bg-blue-500/20"
                        label="Likes"
                        description="Number of times this post has been liked."
                        value={analytics.likes}
                    />
                )}
                {show('comments') && (
                    <MetricCard
                        icon={<MessageCircle className={cn(iconClass, 'text-amber-500')} />}
                        iconBg="bg-amber-500/20"
                        label="Comments"
                        description="Number of comments written on this post."
                        value={analytics.comments}
                    />
                )}
                {show('views') && (
                    <MetricCard
                        icon={<Play className={cn(iconClass, 'text-cyan-500')} />}
                        iconBg="bg-cyan-500/20"
                        label="Views"
                        description="Total number of times the video has been seen."
                        value={isVideo || isYouTube || isTikTok ? analytics.videoViews : analytics.impressions}
                    />
                )}
                {/* Video-specific: Avg Watch Time */}
                {isVideo && !isYouTube && !isTikTok && analytics.avgWatchPercentage != null && (
                    <MetricCard
                        icon={<Clock className={cn(iconClass, 'text-orange-500')} />}
                        iconBg="bg-orange-500/20"
                        label="Avg. Watch Time"
                        description="Avg. number of seconds this post was watched."
                        value={formatWatchTime(analytics.videoWatchTime / Math.max(1, analytics.videoViews))}
                    />
                )}
            </div>
            {isYouTube && (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                    Lifetime video counts. Impressions, unique reach and shares are not available from this data source.
                    {' '}For watch time, audience retention and subscriber data, open{' '}
                    <Link href="/analytics" className="text-[var(--accent-gold)] underline">YouTube insights in Analytics</Link>
                    {' '}and select this video. These reports use a selected date range and may require reconnecting your account for analytics access.
                </p>
            )}
        </div>
    );
}
