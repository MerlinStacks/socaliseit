'use client';

/**
 * Admin Billing Page
 *
 * Why: Dedicated billing management for Super Admins — shows revenue
 * metrics, tier distribution, subscription status breakdown, and
 * recent webhook events for debugging payment flows.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    CreditCard,
    TrendingUp,
    Building2,
    AlertTriangle,
    Webhook,
    Search,
    ChevronLeft,
    ChevronRight,
    Ban,
} from 'lucide-react';
import { clientLogger } from '@/lib/client-logger';

interface BillingStats {
    totalOrganizations: number;
    paidOrganizations: number;
    freeOrganizations: number;
    tierDistribution: Record<string, number>;
    statusBreakdown: Record<string, number>;
    cancellingCount: number;
    bannedUserCount: number;
}

interface WebhookEvent {
    eventId: string;
    processedAt: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const STATUS_COLORS: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400',
    past_due: 'bg-orange-500/10 text-orange-400',
    canceled: 'bg-red-500/10 text-red-400',
    trialing: 'bg-blue-500/10 text-blue-400',
    incomplete: 'bg-yellow-500/10 text-yellow-400',
    unpaid: 'bg-red-500/10 text-red-400',
    unknown: 'bg-gray-500/10 text-gray-400',
};

const TIER_COLORS: Record<string, string> = {
    FREE: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
    PRO: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    BUSINESS: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    ENTERPRISE: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    ADMIN: 'bg-red-500/10 text-red-400 border-red-500/30',
};

export default function AdminBillingPage() {
    const [stats, setStats] = useState<BillingStats | null>(null);
    const [events, setEvents] = useState<WebhookEvent[]>([]);
    const [eventPagination, setEventPagination] = useState<Pagination | null>(null);
    const [eventPage, setEventPage] = useState(1);
    const [eventSearch, setEventSearch] = useState('');
    const [loadingStats, setLoadingStats] = useState(true);
    const [loadingEvents, setLoadingEvents] = useState(true);

    const fetchStats = useCallback(async () => {
        setLoadingStats(true);
        try {
            const res = await fetch('/api/admin/billing/stats');
            if (res.ok) setStats(await res.json());
        } catch {
            clientLogger.error('Failed to fetch billing stats');
        } finally {
            setLoadingStats(false);
        }
    }, []);

    const fetchEvents = useCallback(async () => {
        setLoadingEvents(true);
        try {
            const params = new URLSearchParams({
                page: eventPage.toString(),
                limit: '15',
            });
            if (eventSearch) params.set('search', eventSearch);

            const res = await fetch(`/api/admin/billing/webhooks?${params}`);
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events);
                setEventPagination(data.pagination);
            }
        } catch {
            clientLogger.error('Failed to fetch webhook events');
        } finally {
            setLoadingEvents(false);
        }
    }, [eventPage, eventSearch]);

    useEffect(() => { fetchStats(); }, [fetchStats]);
    useEffect(() => { fetchEvents(); }, [fetchEvents]);

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Billing Management</h1>
                <p className="text-gray-400 mt-1">
                    Revenue overview, subscription management, and webhook monitoring
                </p>
            </div>

            {/* Stats Cards */}
            {loadingStats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-6 animate-pulse">
                            <div className="h-4 w-24 bg-gray-700 rounded mb-3" />
                            <div className="h-8 w-16 bg-gray-700 rounded" />
                        </div>
                    ))}
                </div>
            ) : stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        icon={CreditCard}
                        title="Paid Organizations"
                        value={stats.paidOrganizations}
                        subtitle={`of ${stats.totalOrganizations} total`}
                        color="green"
                    />
                    <StatCard
                        icon={Building2}
                        title="Free Organizations"
                        value={stats.freeOrganizations}
                        subtitle={`${stats.totalOrganizations > 0 ? Math.round((stats.freeOrganizations / stats.totalOrganizations) * 100) : 0}% of total`}
                        color="gray"
                    />
                    <StatCard
                        icon={AlertTriangle}
                        title="Cancelling"
                        value={stats.cancellingCount}
                        subtitle="Active but will cancel"
                        color="orange"
                    />
                    <StatCard
                        icon={Ban}
                        title="Banned Users"
                        value={stats.bannedUserCount}
                        subtitle="Blocked from login"
                        color="red"
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Tier Distribution */}
                {stats && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Tier Distribution</h2>
                        <div className="space-y-3">
                            {Object.entries(stats.tierDistribution).map(([tier, count]) => {
                                const pct = stats.totalOrganizations > 0 ? (count / stats.totalOrganizations) * 100 : 0;
                                return (
                                    <div key={tier}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${TIER_COLORS[tier] || TIER_COLORS.FREE}`}>
                                                {tier}
                                            </span>
                                            <span className="text-sm text-gray-300">{count} ({pct.toFixed(0)}%)</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${tier === 'PRO' ? 'bg-blue-500' :
                                                        tier === 'BUSINESS' ? 'bg-purple-500' :
                                                            tier === 'ENTERPRISE' ? 'bg-amber-500' :
                                                                tier === 'ADMIN' ? 'bg-red-500' : 'bg-gray-500'
                                                    }`}
                                                style={{ width: `${Math.max(pct, 1)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Subscription Status Breakdown */}
                {stats && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Subscription Status</h2>
                        {Object.keys(stats.statusBreakdown).length === 0 ? (
                            <p className="text-gray-500 text-sm">No active subscriptions</p>
                        ) : (
                            <div className="space-y-3">
                                {Object.entries(stats.statusBreakdown).map(([status, count]) => (
                                    <div key={status} className="flex items-center justify-between">
                                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.unknown}`}>
                                            {status}
                                        </span>
                                        <span className="text-sm font-medium text-white">{count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Webhook Events */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Webhook className="h-5 w-5 text-gray-400" />
                        <h2 className="text-lg font-semibold text-white">Processed Webhook Events</h2>
                        {eventPagination && (
                            <span className="text-sm text-gray-500">({eventPagination.total} total)</span>
                        )}
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="text"
                            value={eventSearch}
                            onChange={(e) => { setEventSearch(e.target.value); setEventPage(1); }}
                            placeholder="Search event ID..."
                            className="rounded-lg border border-gray-700 bg-gray-800 pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none w-64"
                        />
                    </div>
                </div>

                {loadingEvents ? (
                    <div className="py-8 text-center text-gray-400">Loading events...</div>
                ) : events.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                        {eventSearch ? 'No events matching search' : 'No webhook events processed yet'}
                    </div>
                ) : (
                    <>
                        <div className="rounded-lg border border-gray-800 overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-800/50">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Event ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Processed At</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {events.map((event) => (
                                        <tr key={event.eventId} className="hover:bg-gray-800/30">
                                            <td className="px-4 py-3">
                                                <code className="text-sm text-gray-300">{event.eventId}</code>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-400">
                                                {new Date(event.processedAt).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                                                    processed
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {eventPagination && eventPagination.totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4">
                                <span className="text-sm text-gray-400">
                                    Page {eventPagination.page} of {eventPagination.totalPages}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEventPage((p) => Math.max(1, p - 1))}
                                        disabled={eventPage <= 1}
                                        className="rounded-lg border border-gray-700 p-2 text-gray-400 hover:bg-gray-800 disabled:opacity-30"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => setEventPage((p) => Math.min(eventPagination.totalPages, p + 1))}
                                        disabled={eventPage >= eventPagination.totalPages}
                                        className="rounded-lg border border-gray-700 p-2 text-gray-400 hover:bg-gray-800 disabled:opacity-30"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/** Reusable stat card component */
function StatCard({
    icon: Icon,
    title,
    value,
    subtitle,
    color,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    value: number;
    subtitle: string;
    color: string;
}) {
    const colorMap: Record<string, { bg: string; text: string; border: string }> = {
        green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
        gray: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
        orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
        red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    };
    const c = colorMap[color] || colorMap.gray;

    return (
        <div className={`rounded-xl border ${c.border} ${c.bg} p-6`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-400">{title}</p>
                    <p className="text-3xl font-bold text-white mt-1">{value}</p>
                    <p className={`text-sm ${c.text} mt-2`}>{subtitle}</p>
                </div>
                <div className={`rounded-lg ${c.bg} p-3`}>
                    <Icon className={`h-6 w-6 ${c.text}`} />
                </div>
            </div>
        </div>
    );
}
