/**
 * Competitors Page
 * Track competitor accounts — enriched competitive intelligence dashboard.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
    Plus, TrendingUp, TrendingDown,
    Users, BarChart3, ExternalLink, Trash2,
    Loader2, X, RefreshCw, ChevronDown, ChevronUp,
    Trophy, PieChart, ArrowUpDown, Eye,
    Heart, MessageCircle, Image, Video, LayoutGrid,
    Clock, Zap, Target, Table2, LayoutDashboard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clientLogger } from '@/lib/client-logger';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface RecentPost {
    id: string;
    caption: string | null;
    mediaType: string | null;
    likes: number;
    comments: number;
    engagement: number;
    postedAt: string;
}

interface Competitor {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    platform: string;
    followers: number;
    followerGrowth: number;
    avgEngagement: number;
    postsPerWeek: number;
    isVerified: boolean;
    lastSynced: string | null;
    createdAt: string;
    engagementHistory: number[];
    shareOfVoice: number;
    benchmarkScore: number;
    postCount: number;
    recentPosts: RecentPost[];
}

type SortField = 'followers' | 'followerGrowth' | 'avgEngagement' | 'postsPerWeek' | 'benchmarkScore' | 'shareOfVoice';
type ViewMode = 'cards' | 'table';

/* -------------------------------------------------------------------------- */
/*  Page Component                                                            */
/* -------------------------------------------------------------------------- */

export default function CompetitorsPage() {
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('cards');
    const [sortField, setSortField] = useState<SortField>('followers');
    const [sortAsc, setSortAsc] = useState(false);

    const fetchCompetitors = useCallback(async () => {
        try {
            const response = await fetch('/api/competitors');
            if (!response.ok) throw new Error('Failed to fetch competitors');
            const data = await response.json();
            setCompetitors(data.competitors);
        } catch (error) {
            clientLogger.error({ error }, 'Error fetching competitors');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCompetitors();
    }, [fetchCompetitors]);

    const sortedCompetitors = useMemo(() => {
        return [...competitors].sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [competitors, sortField, sortAsc]);

    const handleRemove = async (id: string) => {
        if (!confirm('Stop tracking this competitor?')) return;
        try {
            const response = await fetch(`/api/competitors?id=${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to remove competitor');
            setCompetitors(prev => prev.filter(c => c.id !== id));
            if (expandedId === id) setExpandedId(null);
        } catch {
            // Silent — user sees nothing change on failure
        }
    };

    const handleSync = async (id: string) => {
        setSyncingIds(prev => new Set(prev).add(id));
        try {
            const response = await fetch(`/api/competitors/sync?id=${id}`, { method: 'POST' });
            const data = await response.json();

            if (!response.ok || !data.synced) {
                alert(data.error || 'Sync failed. Please try again.');
                return;
            }

            setCompetitors(prev =>
                prev.map(c =>
                    c.id === id
                        ? {
                            ...c,
                            followers: data.followers ?? c.followers,
                            followerGrowth: data.followerGrowth ?? c.followerGrowth,
                            avgEngagement: data.avgEngagement ?? c.avgEngagement,
                            postsPerWeek: data.postsPerWeek ?? c.postsPerWeek,
                            lastSynced: data.lastSyncedAt ?? new Date().toISOString(),
                        }
                        : c
                )
            );
        } catch {
            alert('Failed to sync competitor data.');
        } finally {
            setSyncingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(false);
        }
    };

    const formatFollowers = (count: number): string => {
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
    };

    const formatNumber = (n: number): string => n.toLocaleString();

    const platformColors: Record<string, string> = {
        instagram: 'bg-gradient-to-br from-purple-500 to-pink-500',
        facebook: 'bg-blue-600',
        tiktok: 'bg-black',
        youtube: 'bg-red-600',
        pinterest: 'bg-red-500',
    };

    /* ------ Summary Calculations ------ */
    const avgFollowers = competitors.length > 0
        ? Math.round(competitors.reduce((s, c) => s + c.followers, 0) / competitors.length)
        : 0;
    const avgEngagement = competitors.length > 0
        ? (competitors.reduce((s, c) => s + c.avgEngagement, 0) / competitors.length)
        : 0;
    const avgPostsPerWeek = competitors.length > 0
        ? (competitors.reduce((s, c) => s + c.postsPerWeek, 0) / competitors.length)
        : 0;
    const avgBenchmark = competitors.length > 0
        ? Math.round(competitors.reduce((s, c) => s + c.benchmarkScore, 0) / competitors.length)
        : 0;
    const avgShareOfVoice = competitors.length > 0
        ? (competitors.reduce((s, c) => s + c.shareOfVoice, 0) / competitors.length)
        : 0;

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Competitors</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Track and benchmark competitor performance
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {competitors.length > 0 && (
                        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
                            <button
                                onClick={() => setViewMode('cards')}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
                                    viewMode === 'cards'
                                        ? 'bg-[var(--accent-gold)] text-white'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                )}
                            >
                                <LayoutDashboard className="h-4 w-4" />
                                Cards
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
                                    viewMode === 'table'
                                        ? 'bg-[var(--accent-gold)] text-white'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                )}
                            >
                                <Table2 className="h-4 w-4" />
                                Table
                            </button>
                        </div>
                    )}
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="h-4 w-4" />
                        Track Competitor
                    </Button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                    </div>
                ) : competitors.length === 0 ? (
                    <div className="text-center py-12">
                        <BarChart3 className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <h3 className="mt-4 text-lg font-medium">No competitors tracked</h3>
                        <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto mt-1">
                            Add competitor accounts to benchmark your engagement, growth, and posting strategy against theirs.
                        </p>
                        <Button className="mt-4" onClick={() => setShowAddModal(true)}>
                            <Plus className="h-4 w-4" />
                            Track Your First Competitor
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* ===================== Summary Stats ===================== */}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            <StatCard label="Tracking" value={competitors.length.toString()} sub={`competitor${competitors.length !== 1 ? 's' : ''}`} icon={<Eye className="h-4 w-4" />} />
                            <StatCard label="Avg Followers" value={formatFollowers(avgFollowers)} sub="across competitors" icon={<Users className="h-4 w-4" />} />
                            <StatCard label="Avg Engagement" value={`${avgEngagement.toFixed(1)}%`} sub="benchmark rate" icon={<Zap className="h-4 w-4" />} />
                            <StatCard label="Avg Posts/Week" value={avgPostsPerWeek.toFixed(1)} sub="posting frequency" icon={<Clock className="h-4 w-4" />} />
                            <StatCard label="Avg Benchmark" value={avgBenchmark.toString()} sub="score out of 100" icon={<Trophy className="h-4 w-4" />} accent />
                            <StatCard label="Avg Share of Voice" value={`${avgShareOfVoice.toFixed(1)}%`} sub="market presence" icon={<PieChart className="h-4 w-4" />} />
                        </div>

                        {/* ===================== TABLE VIEW ===================== */}
                        {viewMode === 'table' ? (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                                            <th className="text-left px-4 py-3 font-medium">Competitor</th>
                                            <SortableHeader label="Followers" field="followers" current={sortField} asc={sortAsc} onSort={handleSort} />
                                            <SortableHeader label="Growth" field="followerGrowth" current={sortField} asc={sortAsc} onSort={handleSort} />
                                            <SortableHeader label="Engagement" field="avgEngagement" current={sortField} asc={sortAsc} onSort={handleSort} />
                                            <SortableHeader label="Posts/Wk" field="postsPerWeek" current={sortField} asc={sortAsc} onSort={handleSort} />
                                            <SortableHeader label="Benchmark" field="benchmarkScore" current={sortField} asc={sortAsc} onSort={handleSort} />
                                            <SortableHeader label="Share of Voice" field="shareOfVoice" current={sortField} asc={sortAsc} onSort={handleSort} />
                                            <th className="text-left px-4 py-3 font-medium">Posts</th>
                                            <th className="text-right px-4 py-3 font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedCompetitors.map((comp) => (
                                            <tr key={comp.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            'flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-bold overflow-hidden shrink-0',
                                                            platformColors[comp.platform] || 'bg-[var(--text-muted)]'
                                                        )}>
                                                            {comp.avatar ? (
                                                                <img src={comp.avatar} alt={comp.username} className="h-full w-full object-cover" />
                                                            ) : comp.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <span className="font-medium">@{comp.username}</span>
                                                            {comp.isVerified && <span className="text-[var(--info)] ml-1">✓</span>}
                                                            <p className="text-xs text-[var(--text-muted)] capitalize">{comp.platform}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-medium">{formatFollowers(comp.followers)}</td>
                                                <td className="px-4 py-3">
                                                    <GrowthBadge value={comp.followerGrowth} />
                                                </td>
                                                <td className="px-4 py-3">{comp.avgEngagement.toFixed(2)}%</td>
                                                <td className="px-4 py-3">{comp.postsPerWeek}</td>
                                                <td className="px-4 py-3">
                                                    <BenchmarkBar score={comp.benchmarkScore} />
                                                </td>
                                                <td className="px-4 py-3">{comp.shareOfVoice.toFixed(1)}%</td>
                                                <td className="px-4 py-3 text-[var(--text-muted)]">{comp.postCount}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-1">
                                                        <button onClick={() => handleSync(comp.id)} disabled={syncingIds.has(comp.id)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors disabled:opacity-50" title="Sync">
                                                            <RefreshCw className={cn('h-3.5 w-3.5', syncingIds.has(comp.id) && 'animate-spin')} />
                                                        </button>
                                                        <a href={`https://${comp.platform}.com/${comp.username}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Visit profile">
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </a>
                                                        <button onClick={() => handleRemove(comp.id)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors" title="Remove">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            /* ===================== CARDS VIEW ===================== */
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {sortedCompetitors.map((competitor) => {
                                    const isExpanded = expandedId === competitor.id;
                                    return (
                                        <div
                                            key={competitor.id}
                                            className={cn(
                                                'rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] transition-all duration-300',
                                                isExpanded && 'md:col-span-2 xl:col-span-2 ring-1 ring-[var(--accent-gold)]/30'
                                            )}
                                        >
                                            {/* Card Header */}
                                            <div className="p-6">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            'flex h-12 w-12 items-center justify-center rounded-full text-white font-bold overflow-hidden',
                                                            platformColors[competitor.platform] || 'bg-[var(--text-muted)]'
                                                        )}>
                                                            {competitor.avatar ? (
                                                                <img src={competitor.avatar} alt={competitor.username} className="h-full w-full object-cover" />
                                                            ) : competitor.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <h3 className="font-medium flex items-center gap-1">
                                                                @{competitor.username}
                                                                {competitor.isVerified && <span className="text-[var(--info)]">✓</span>}
                                                            </h3>
                                                            <p className="text-xs text-[var(--text-muted)] capitalize">{competitor.platform}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => handleSync(competitor.id)} disabled={syncingIds.has(competitor.id)} title="Sync competitor data" className="p-2 text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors disabled:opacity-50">
                                                            <RefreshCw className={cn('h-4 w-4', syncingIds.has(competitor.id) && 'animate-spin')} />
                                                        </button>
                                                        <a href={`https://${competitor.platform}.com/${competitor.username}`} target="_blank" rel="noopener noreferrer" className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </a>
                                                        <button onClick={() => handleRemove(competitor.id)} className="p-2 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Quick Metrics */}
                                                <div className="mt-4 grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-xs text-[var(--text-muted)]">Followers</p>
                                                        <p className="font-semibold flex items-center gap-1">
                                                            <Users className="h-4 w-4 text-[var(--text-muted)]" />
                                                            {formatFollowers(competitor.followers)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-[var(--text-muted)]">Growth</p>
                                                        <GrowthBadge value={competitor.followerGrowth} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-[var(--text-muted)]">Engagement</p>
                                                        <p className="font-semibold">{competitor.avgEngagement.toFixed(2)}%</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-[var(--text-muted)]">Posts/Week</p>
                                                        <p className="font-semibold">{competitor.postsPerWeek}</p>
                                                    </div>
                                                </div>

                                                {/* Benchmark + Share of Voice bars */}
                                                <div className="mt-4 space-y-2">
                                                    <div>
                                                        <div className="flex items-center justify-between text-xs mb-1">
                                                            <span className="text-[var(--text-muted)] flex items-center gap-1"><Trophy className="h-3 w-3" /> Benchmark Score</span>
                                                            <span className="font-medium">{competitor.benchmarkScore}/100</span>
                                                        </div>
                                                        <BenchmarkBar score={competitor.benchmarkScore} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center justify-between text-xs mb-1">
                                                            <span className="text-[var(--text-muted)] flex items-center gap-1"><Target className="h-3 w-3" /> Share of Voice</span>
                                                            <span className="font-medium">{competitor.shareOfVoice.toFixed(1)}%</span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-blue-500 transition-all duration-700"
                                                                style={{ width: `${Math.min(competitor.shareOfVoice, 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expand Toggle */}
                                                <button
                                                    onClick={() => setExpandedId(isExpanded ? null : competitor.id)}
                                                    className="mt-4 w-full flex items-center justify-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors py-1"
                                                >
                                                    {isExpanded ? (
                                                        <>Less detail <ChevronUp className="h-3 w-3" /></>
                                                    ) : (
                                                        <>More detail <ChevronDown className="h-3 w-3" /></>
                                                    )}
                                                </button>

                                                {!competitor.lastSynced && (
                                                    <p className="mt-2 text-xs text-[var(--text-muted)] italic">
                                                        No data yet — click <RefreshCw className="inline h-3 w-3" /> to sync
                                                    </p>
                                                )}
                                            </div>

                                            {/* Expanded Detail */}
                                            {isExpanded && (
                                                <div className="border-t border-[var(--border)] p-6 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    {/* Engagement History Sparkline */}
                                                    {Array.isArray(competitor.engagementHistory) && competitor.engagementHistory.length > 0 && (
                                                        <div>
                                                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                                                <BarChart3 className="h-4 w-4 text-[var(--accent-gold)]" />
                                                                Engagement History
                                                            </h4>
                                                            <Sparkline data={competitor.engagementHistory} />
                                                        </div>
                                                    )}

                                                    {/* Content Type Breakdown */}
                                                    {competitor.recentPosts.length > 0 && (
                                                        <div>
                                                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                                                <PieChart className="h-4 w-4 text-[var(--accent-gold)]" />
                                                                Content Breakdown
                                                            </h4>
                                                            <ContentBreakdown posts={competitor.recentPosts} />
                                                        </div>
                                                    )}

                                                    {/* Recent Posts */}
                                                    {competitor.recentPosts.length > 0 && (
                                                        <div>
                                                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                                                <Clock className="h-4 w-4 text-[var(--accent-gold)]" />
                                                                Recent Posts ({competitor.postCount} total)
                                                            </h4>
                                                            <div className="grid gap-3 sm:grid-cols-2">
                                                                {competitor.recentPosts.map((post) => (
                                                                    <PostCard key={post.id} post={post} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <AddCompetitorModal
                    onClose={() => setShowAddModal(false)}
                    onAdded={(newCompetitor) => {
                        setCompetitors(prev => [...prev, newCompetitor]);
                        setShowAddModal(false);
                    }}
                />
            )}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Sub-Components                                                            */
/* -------------------------------------------------------------------------- */

/** Summary stat card */
function StatCard({ label, value, sub, icon, accent }: {
    label: string;
    value: string;
    sub: string;
    icon: React.ReactNode;
    accent?: boolean;
}) {
    return (
        <div className={cn(
            'rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 transition-all hover:shadow-md',
            accent && 'border-[var(--accent-gold)]/30'
        )}>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[var(--text-muted)]">{icon}</span>
                <p className="text-sm text-[var(--text-muted)]">{label}</p>
            </div>
            <p className={cn('text-2xl font-bold', accent && 'text-[var(--accent-gold)]')}>{value}</p>
            <p className="text-xs text-[var(--text-muted)]">{sub}</p>
        </div>
    );
}

/** Growth badge with color + arrow */
function GrowthBadge({ value }: { value: number }) {
    return (
        <p className={cn(
            'font-semibold flex items-center gap-1',
            value >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'
        )}>
            {value >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {value >= 0 ? '+' : ''}{value}%
        </p>
    );
}

/** Benchmark score colored progress bar */
function BenchmarkBar({ score }: { score: number }) {
    const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                <div
                    className={cn('h-full rounded-full transition-all duration-700', color)}
                    style={{ width: `${Math.min(score, 100)}%` }}
                />
            </div>
            <span className="text-xs font-medium w-6 text-right">{score}</span>
        </div>
    );
}

/** Sortable table header */
function SortableHeader({ label, field, current, asc, onSort }: {
    label: string;
    field: SortField;
    current: SortField;
    asc: boolean;
    onSort: (f: SortField) => void;
}) {
    const isActive = current === field;
    return (
        <th
            className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors"
            onClick={() => onSort(field)}
        >
            <span className="flex items-center gap-1">
                {label}
                <ArrowUpDown className={cn('h-3 w-3', isActive ? 'text-[var(--accent-gold)]' : 'opacity-40')} />
                {isActive && (
                    <span className="text-[var(--accent-gold)] text-[10px]">{asc ? '↑' : '↓'}</span>
                )}
            </span>
        </th>
    );
}

/** CSS-based sparkline chart */
function Sparkline({ data }: { data: number[] }) {
    const max = Math.max(...data, 1);
    return (
        <div className="flex items-end gap-[3px] h-16">
            {data.map((val, i) => (
                <div
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-[var(--accent-gold)] to-[var(--accent-gold)]/50 transition-all duration-500 hover:opacity-80"
                    style={{
                        height: `${Math.max((val / max) * 100, 4)}%`,
                        animationDelay: `${i * 50}ms`,
                    }}
                    title={`${val.toFixed(2)}%`}
                />
            ))}
        </div>
    );
}

/** Content type breakdown from posts */
function ContentBreakdown({ posts }: { posts: RecentPost[] }) {
    const counts = { image: 0, video: 0, carousel: 0 };
    posts.forEach(p => {
        const t = (p.mediaType || 'image').toLowerCase();
        if (t === 'video') counts.video++;
        else if (t === 'carousel') counts.carousel++;
        else counts.image++;
    });
    const total = posts.length;
    const items = [
        { label: 'Images', count: counts.image, icon: <Image className="h-3.5 w-3.5" />, color: 'bg-blue-500' },
        { label: 'Videos', count: counts.video, icon: <Video className="h-3.5 w-3.5" />, color: 'bg-purple-500' },
        { label: 'Carousels', count: counts.carousel, icon: <LayoutGrid className="h-3.5 w-3.5" />, color: 'bg-amber-500' },
    ].filter(it => it.count > 0);

    return (
        <div className="space-y-2">
            {/* Stacked bar */}
            <div className="flex h-3 rounded-full overflow-hidden bg-[var(--bg-tertiary)]">
                {items.map((it, i) => (
                    <div
                        key={i}
                        className={cn('h-full transition-all duration-700', it.color)}
                        style={{ width: `${(it.count / total) * 100}%` }}
                    />
                ))}
            </div>
            {/* Legend */}
            <div className="flex gap-4 text-xs">
                {items.map((it, i) => (
                    <span key={i} className="flex items-center gap-1 text-[var(--text-muted)]">
                        {it.icon}
                        {it.label}: {it.count} ({Math.round((it.count / total) * 100)}%)
                    </span>
                ))}
            </div>
        </div>
    );
}

/** Single recent post card */
function PostCard({ post }: { post: RecentPost }) {
    const date = new Date(post.postedAt);
    const timeAgo = getTimeAgo(date);
    const typeIcon = (post.mediaType || 'image').toLowerCase() === 'video'
        ? <Video className="h-3 w-3" />
        : (post.mediaType || 'image').toLowerCase() === 'carousel'
            ? <LayoutGrid className="h-3 w-3" />
            : <Image className="h-3 w-3" />;

    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 hover:border-[var(--accent-gold)]/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] capitalize">
                    {typeIcon}
                    {post.mediaType || 'image'}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{timeAgo}</span>
            </div>
            {post.caption && (
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-2">
                    {post.caption}
                </p>
            )}
            <div className="flex gap-3 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    {post.likes.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    {post.comments.toLocaleString()}
                </span>
            </div>
        </div>
    );
}

/** Simple time ago helper */
function getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    return date.toLocaleDateString();
}

/* -------------------------------------------------------------------------- */
/*  Add Competitor Modal                                                      */
/* -------------------------------------------------------------------------- */

function AddCompetitorModal({
    onClose,
    onAdded
}: {
    onClose: () => void;
    onAdded: (competitor: Competitor) => void;
}) {
    const [username, setUsername] = useState('');
    const [platform, setPlatform] = useState('instagram');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username) return;

        setSaving(true);
        setError(null);

        try {
            const response = await fetch('/api/competitors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, platform })
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to add competitor');
                return;
            }

            onAdded({
                id: data.id,
                username: data.username,
                displayName: data.displayName,
                avatar: data.avatar || null,
                platform: data.platform,
                followers: data.followers || 0,
                followerGrowth: 0,
                avgEngagement: 0,
                postsPerWeek: 0,
                isVerified: data.isVerified || false,
                lastSynced: null,
                createdAt: new Date().toISOString(),
                engagementHistory: [],
                shareOfVoice: 0,
                benchmarkScore: 0,
                postCount: 0,
                recentPosts: [],
            });
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-[var(--bg-secondary)] p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Track Competitor</h2>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.replace('@', ''))}
                            placeholder="@competitor"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Platform</label>
                        <select
                            value={platform}
                            onChange={(e) => setPlatform(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="instagram">Instagram</option>
                            <option value="facebook">Facebook</option>
                            <option value="tiktok">TikTok</option>
                            <option value="youtube">YouTube</option>
                            <option value="pinterest">Pinterest</option>
                        </select>
                    </div>

                    {error && (
                        <p className="text-sm text-[var(--error)]">{error}</p>
                    )}

                    <p className="text-xs text-[var(--text-muted)]">
                        Note: Full analytics require connected social accounts. Basic tracking will be available immediately.
                    </p>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !username}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Track
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
