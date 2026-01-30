/**
 * Activity Log Page
 * View audit trail of all workspace actions - now with real data
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Activity, Download, Search,
    FileText, Image, Users, Settings, Zap,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityItem {
    id: string;
    user: { name: string; avatar?: string };
    action: string;
    resourceType: string;
    resourceId: string | null;
    resourceName: string;
    timestamp: string;
    details?: string;
}

export default function ActivityPage() {
    const [filter, setFilter] = useState<string>('all');
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchActivities = useCallback(async (reset = false) => {
        const currentOffset = reset ? 0 : offset;
        if (reset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const params = new URLSearchParams({
                limit: '20',
                offset: currentOffset.toString(),
                type: filter
            });

            const response = await fetch(`/api/activity?${params}`);
            if (!response.ok) throw new Error('Failed to fetch activities');

            const data = await response.json();

            if (reset) {
                setActivities(data.activities);
                setOffset(20);
            } else {
                setActivities(prev => [...prev, ...data.activities]);
                setOffset(currentOffset + 20);
            }
            setHasMore(data.hasMore);
        } catch (error) {
            console.error('Error fetching activities:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [filter, offset]);

    useEffect(() => {
        fetchActivities(true);
    }, [filter]);

    /**
     * Export activities as CSV download
     */
    const handleExport = () => {
        const headers = ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource Name', 'Details'];
        const rows = activities.map(a => [
            a.timestamp,
            a.user.name,
            a.action,
            a.resourceType,
            a.resourceName,
            a.details || ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-log-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const typeIcons: Record<string, React.ElementType> = {
        post: FileText,
        media: Image,
        account: Settings,
        automation: Zap,
        team: Users,
        pillar: FileText,
        competitor: Users,
    };

    const actionColors: Record<string, string> = {
        published: 'text-[var(--success)]',
        scheduled: 'text-[var(--info)]',
        connected: 'text-[var(--accent-gold)]',
        uploaded: 'text-[var(--text-primary)]',
        triggered: 'text-purple-500',
        invited: 'text-[var(--info)]',
        deleted: 'text-[var(--error)]',
        removed: 'text-[var(--error)]',
        created: 'text-[var(--success)]',
        added: 'text-[var(--success)]',
    };

    const filters = [
        { id: 'all', label: 'All Activity' },
        { id: 'post', label: 'Posts' },
        { id: 'media', label: 'Media' },
        { id: 'account', label: 'Accounts' },
        { id: 'team', label: 'Team' },
        { id: 'automation', label: 'Automations' },
    ];

    const filteredActivities = searchQuery
        ? activities.filter(a =>
            a.resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.user.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : activities;

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <Activity className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Activity Log</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Track all workspace activity
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            placeholder="Search activity..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] py-2 pl-10 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                        />
                    </div>
                    <Button variant="secondary" onClick={handleExport}>
                        <Download className="h-4 w-4" />
                        Export
                    </Button>
                </div>
            </header>

            {/* Filters */}
            <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-3">
                <div className="flex gap-2">
                    {filters.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={cn(
                                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                                filter === f.id
                                    ? 'bg-[var(--accent-gold)] text-white'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Activity List */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="mx-auto max-w-3xl">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                        </div>
                    ) : filteredActivities.length === 0 ? (
                        <div className="text-center py-12">
                            <Activity className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                            <h3 className="mt-4 text-lg font-medium">No activity yet</h3>
                            <p className="text-sm text-[var(--text-muted)]">
                                Activity will appear here as you use the platform
                            </p>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Timeline line */}
                            <div className="absolute left-6 top-0 bottom-0 w-px bg-[var(--border)]" />

                            {/* Activity items */}
                            <div className="space-y-6">
                                {filteredActivities.map((activity) => {
                                    const Icon = typeIcons[activity.resourceType] || FileText;

                                    return (
                                        <div key={activity.id} className="relative flex gap-4">
                                            {/* Icon */}
                                            <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--bg-secondary)]">
                                                <Icon className="h-5 w-5 text-[var(--text-muted)]" />
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 pt-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{activity.user.name}</span>
                                                    <span className={cn('font-medium', actionColors[activity.action] || '')}>
                                                        {activity.action}
                                                    </span>
                                                    <span className="text-[var(--text-muted)]">
                                                        {activity.resourceType === 'post' ? 'a' : ''} {activity.resourceType}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                                    {activity.resourceName}
                                                </p>
                                                {activity.details && (
                                                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                                                        {activity.details}
                                                    </p>
                                                )}
                                                <p className="mt-2 text-xs text-[var(--text-muted)]">
                                                    {activity.timestamp}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Load More */}
                    {hasMore && !loading && filteredActivities.length > 0 && (
                        <div className="mt-8 text-center">
                            <Button
                                variant="secondary"
                                onClick={() => fetchActivities(false)}
                                disabled={loadingMore}
                            >
                                {loadingMore ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    'Load More'
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
