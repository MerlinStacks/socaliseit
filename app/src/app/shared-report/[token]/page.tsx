/**
 * Shared Report Viewer Page
 *
 * Public page accessible via share token — no login required.
 * Displays a branded, read-only view of a scheduled report with
 * summary metrics, charts, and top posts.
 *
 * Why: Enables "live link" delivery format for scheduled reports,
 * allowing stakeholders to view reports without logging in.
 */

'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    TrendingUp,
    TrendingDown,
    Eye,
    Users,
    Heart,
    BarChart3,
    Calendar,
    Clock,
    ExternalLink,
    Download,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface ReportData {
    title: string;
    generatedAt: string;
    dateRange: { start: string; end: string };
    organization: { name: string; logo?: string };
    summary: {
        totalImpressions: number;
        totalReach: number;
        avgEngagementRate: number;
        totalFollowersGained: number;
        totalPostsPublished: number;
        bestPerformingPlatform: string;
    };
    metrics: Array<{
        date: string;
        impressions: number;
        reach: number;
        engagement: number;
        followers: number;
    }>;
    topPosts: Array<{
        id: string;
        caption: string;
        platform: string;
        publishedAt: string;
        impressions: number;
        engagement: number;
        thumbnailUrl?: string;
    }>;
    predictions?: {
        nextWeekEstimate: {
            impressions: number;
            reach: number;
            engagement: number;
        };
        recommendations: string[];
    };
}

interface SharedReportResponse {
    data: {
        name: string;
        organization: { name: string; logo: string | null };
        reportData: ReportData;
        lastRunAt: string | null;
        schedule: string;
    };
}

// ============================================================================
// Page Component
// ============================================================================

export default function SharedReportPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = use(params);

    const { data, isLoading, error } = useQuery<SharedReportResponse>({
        queryKey: ['shared-report', token],
        queryFn: async () => {
            const res = await fetch(`/api/reports/share/${token}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Report not found' }));
                throw new Error(err.error || err.message || 'Failed to load report');
            }
            return res.json();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: false,
    });

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent-gold)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading report...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
                    <div className="rounded-full p-4" style={{ background: 'var(--error-light)' }}>
                        <AlertCircle className="h-8 w-8" style={{ color: 'var(--error)' }} />
                    </div>
                    <h1 className="text-xl font-semibold">Report Unavailable</h1>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {error instanceof Error ? error.message : 'This report could not be loaded. It may have been deactivated or the link may be invalid.'}
                    </p>
                </div>
            </div>
        );
    }

    const report = data.data.reportData;
    const org = data.data.organization;

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
            {/* Header */}
            <header
                className="sticky top-0 z-10 border-b backdrop-blur-xl"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {org.logo && (
                            <img src={org.logo} alt={org.name} className="h-8 w-8 rounded-lg object-cover" />
                        )}
                        <div>
                            <h1 className="font-semibold text-lg">{data.data.name}</h1>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {org.name}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {data.data.lastRunAt && (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                <Clock className="h-3 w-3 inline mr-1" />
                                Updated {formatDistanceToNow(new Date(data.data.lastRunAt), { addSuffix: true })}
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
                {/* Date Range Banner */}
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Calendar className="h-4 w-4" />
                    <span>
                        {new Date(report.dateRange.start).toLocaleDateString()} — {new Date(report.dateRange.end).toLocaleDateString()}
                    </span>
                </div>

                {/* Summary Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <MetricCard
                        label="Impressions"
                        value={formatNumber(report.summary.totalImpressions)}
                        icon={<Eye className="h-4 w-4" />}
                    />
                    <MetricCard
                        label="Reach"
                        value={formatNumber(report.summary.totalReach)}
                        icon={<Users className="h-4 w-4" />}
                    />
                    <MetricCard
                        label="Avg. Engagement"
                        value={`${report.summary.avgEngagementRate.toFixed(1)}%`}
                        icon={<Heart className="h-4 w-4" />}
                    />
                    <MetricCard
                        label="Followers Gained"
                        value={`+${formatNumber(report.summary.totalFollowersGained)}`}
                        icon={<TrendingUp className="h-4 w-4" />}
                        positive={report.summary.totalFollowersGained > 0}
                    />
                    <MetricCard
                        label="Posts Published"
                        value={report.summary.totalPostsPublished.toString()}
                        icon={<BarChart3 className="h-4 w-4" />}
                    />
                    <MetricCard
                        label="Best Platform"
                        value={report.summary.bestPerformingPlatform}
                        icon={<TrendingUp className="h-4 w-4" />}
                    />
                </div>

                {/* Metrics Over Time — Simple Bar Chart */}
                {report.metrics.length > 0 && (
                    <section className="glass-card p-6 rounded-xl">
                        <h2 className="font-semibold text-lg mb-4">Performance Over Time</h2>
                        <div className="overflow-x-auto">
                            <div className="flex items-end gap-1 h-40 min-w-[400px]">
                                {report.metrics.map((m, i) => {
                                    const maxImpressions = Math.max(...report.metrics.map(x => x.impressions), 1);
                                    const heightPercent = (m.impressions / maxImpressions) * 100;
                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                            <div
                                                className="w-full rounded-t-sm transition-all duration-300 bg-gradient"
                                                style={{
                                                    height: `${Math.max(heightPercent, 2)}%`,
                                                    minHeight: '2px',
                                                    opacity: 0.7 + (heightPercent / 100) * 0.3,
                                                }}
                                                title={`${m.date}: ${formatNumber(m.impressions)} impressions`}
                                            />
                                            {report.metrics.length <= 14 && (
                                                <span className="text-[9px] text-center" style={{ color: 'var(--text-muted)' }}>
                                                    {m.date.substring(5)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
                                Impressions over time
                            </p>
                        </div>
                    </section>
                )}

                {/* Top Posts */}
                {report.topPosts.length > 0 && (
                    <section className="glass-card p-6 rounded-xl">
                        <h2 className="font-semibold text-lg mb-4">Top Performing Posts</h2>
                        <div className="space-y-3">
                            {report.topPosts.map((post, index) => (
                                <div
                                    key={post.id}
                                    className="flex items-start gap-4 p-3 rounded-lg border transition-colors hover:bg-[var(--bg-tertiary)]"
                                    style={{ borderColor: 'var(--border)' }}
                                >
                                    <span
                                        className="flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0"
                                        style={{ background: 'var(--accent-gold-light)', color: 'var(--accent-gold)' }}
                                    >
                                        {index + 1}
                                    </span>
                                    {post.thumbnailUrl && (
                                        <img
                                            src={post.thumbnailUrl}
                                            alt=""
                                            className="h-12 w-12 rounded-lg object-cover shrink-0"
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{post.caption}</p>
                                        <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                            <span className="capitalize">{post.platform.toLowerCase()}</span>
                                            <span>·</span>
                                            <span>{formatNumber(post.impressions)} impressions</span>
                                            <span>·</span>
                                            <span>{post.engagement.toFixed(1)}% engagement</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Predictions */}
                {report.predictions && (
                    <section className="glass-card p-6 rounded-xl">
                        <h2 className="font-semibold text-lg mb-4">Next Week Predictions</h2>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="text-center">
                                <p className="text-2xl font-bold" style={{ color: 'var(--accent-gold)' }}>
                                    {formatNumber(report.predictions.nextWeekEstimate.impressions)}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Est. Impressions</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold" style={{ color: 'var(--accent-gold)' }}>
                                    {formatNumber(report.predictions.nextWeekEstimate.reach)}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Est. Reach</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold" style={{ color: 'var(--accent-gold)' }}>
                                    {report.predictions.nextWeekEstimate.engagement.toFixed(1)}%
                                </p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Est. Engagement</p>
                            </div>
                        </div>

                        {report.predictions.recommendations.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium">Recommendations</p>
                                {report.predictions.recommendations.map((rec, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-2 text-sm p-2 rounded-lg"
                                        style={{ background: 'var(--bg-tertiary)' }}
                                    >
                                        <TrendingUp className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--accent-gold)' }} />
                                        <span>{rec}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </main>

            {/* Footer */}
            <footer
                className="border-t py-6 text-center text-xs"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            >
                <p>Powered by Overseek Socials</p>
                {report.generatedAt && (
                    <p className="mt-1">
                        Report generated {formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true })}
                    </p>
                )}
            </footer>
        </div>
    );
}

// ============================================================================
// Sub-Components
// ============================================================================

function MetricCard({
    label,
    value,
    icon,
    positive,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    positive?: boolean;
}) {
    return (
        <div className="glass-card p-4 rounded-xl text-center">
            <div className="flex items-center justify-center mb-2" style={{ color: 'var(--accent-gold)' }}>
                {icon}
            </div>
            <p className="text-lg font-bold">{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        </div>
    );
}

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}
