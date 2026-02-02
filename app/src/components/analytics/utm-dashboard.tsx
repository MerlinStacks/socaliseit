'use client';

/**
 * UTM Attribution Dashboard Component
 * Track campaign performance and traffic sources
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
    Link2,
    TrendingUp,
    ExternalLink,
    BarChart3,
    Users,
    MousePointer
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface UTMCampaign {
    id: string;
    name: string;
    source: string;
    medium: string;
    clicks: number;
    conversions: number;
    conversionRate: number;
    revenue?: number;
}

interface UTMDashboardProps {
    className?: string;
}

// ============================================================================
// Mock Data
// ============================================================================

const mockCampaigns: UTMCampaign[] = [
    {
        id: '1',
        name: 'summer_launch_2024',
        source: 'instagram',
        medium: 'social',
        clicks: 12450,
        conversions: 845,
        conversionRate: 6.79,
        revenue: 42250,
    },
    {
        id: '2',
        name: 'influencer_collab',
        source: 'tiktok',
        medium: 'social',
        clicks: 8920,
        conversions: 523,
        conversionRate: 5.86,
        revenue: 26150,
    },
    {
        id: '3',
        name: 'newsletter_promo',
        source: 'email',
        medium: 'email',
        clicks: 3240,
        conversions: 412,
        conversionRate: 12.72,
        revenue: 20600,
    },
    {
        id: '4',
        name: 'google_ads_q2',
        source: 'google',
        medium: 'cpc',
        clicks: 5670,
        conversions: 289,
        conversionRate: 5.10,
        revenue: 14450,
    },
    {
        id: '5',
        name: 'pinterest_pins',
        source: 'pinterest',
        medium: 'social',
        clicks: 2890,
        conversions: 156,
        conversionRate: 5.40,
        revenue: 7800,
    },
];

// ============================================================================
// Helper Functions
// ============================================================================

function formatNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
}

function getSourceColor(source: string): string {
    const colors: Record<string, string> = {
        instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
        tiktok: 'bg-black',
        email: 'bg-blue-500',
        google: 'bg-red-500',
        pinterest: 'bg-red-600',
        facebook: 'bg-blue-600',
    };
    return colors[source.toLowerCase()] || 'bg-[var(--accent-gold)]';
}

// ============================================================================
// Main Component
// ============================================================================

export function UTMDashboard({ className }: UTMDashboardProps) {
    const campaigns = useMemo(() => mockCampaigns, []);

    const totals = useMemo(() => ({
        clicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
        conversions: campaigns.reduce((sum, c) => sum + c.conversions, 0),
        revenue: campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0),
    }), [campaigns]);

    const overallConversionRate = totals.clicks > 0
        ? ((totals.conversions / totals.clicks) * 100).toFixed(2)
        : '0';

    return (
        <div className={cn('card p-6', className)}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient">
                    <Link2 className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h2 className="font-semibold text-lg">UTM Attribution</h2>
                    <p className="text-sm text-[var(--text-muted)]">
                        Track your campaign performance
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-[var(--bg-tertiary)]">
                    <div className="flex items-center gap-2 mb-1">
                        <MousePointer className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs text-[var(--text-muted)]">Total Clicks</span>
                    </div>
                    <p className="text-2xl font-bold">{formatNumber(totals.clicks)}</p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-tertiary)]">
                    <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs text-[var(--text-muted)]">Conversions</span>
                    </div>
                    <p className="text-2xl font-bold">{formatNumber(totals.conversions)}</p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-tertiary)]">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs text-[var(--text-muted)]">Conv. Rate</span>
                    </div>
                    <p className="text-2xl font-bold">{overallConversionRate}%</p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-tertiary)]">
                    <div className="flex items-center gap-2 mb-1">
                        <BarChart3 className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-xs text-[var(--text-muted)]">Revenue</span>
                    </div>
                    <p className="text-2xl font-bold">${formatNumber(totals.revenue)}</p>
                </div>
            </div>

            {/* Campaigns Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-[var(--border)]">
                            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-muted)]">Campaign</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-muted)]">Source</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-muted)]">Clicks</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-muted)]">Conversions</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-muted)]">Conv. Rate</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-muted)]">Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.map((campaign) => (
                            <tr
                                key={campaign.id}
                                className="border-b border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">{campaign.name}</span>
                                        <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
                                    </div>
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            'w-3 h-3 rounded-full',
                                            getSourceColor(campaign.source)
                                        )} />
                                        <span className="text-sm capitalize">{campaign.source}</span>
                                        <span className="text-xs text-[var(--text-muted)]">/ {campaign.medium}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-right text-sm">
                                    {campaign.clicks.toLocaleString()}
                                </td>
                                <td className="py-3 px-4 text-right text-sm">
                                    {campaign.conversions.toLocaleString()}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <span className={cn(
                                        'px-2 py-0.5 rounded text-xs font-medium',
                                        campaign.conversionRate >= 10
                                            ? 'bg-[var(--success-light)] text-[var(--success)]'
                                            : campaign.conversionRate >= 5
                                                ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                                    )}>
                                        {campaign.conversionRate.toFixed(2)}%
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right text-sm font-medium">
                                    ${campaign.revenue?.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* UTM Builder Link */}
            <div className="mt-4 p-3 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">
                    Create tracked links for your campaigns
                </span>
                <button className="text-sm font-medium text-[var(--accent-gold)] hover:underline flex items-center gap-1">
                    Open UTM Builder <ExternalLink className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}
