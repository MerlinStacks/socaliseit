/**
 * Competitors Page
 * Track competitor accounts - now with real database integration
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Plus, TrendingUp, TrendingDown,
    Users, BarChart3, ExternalLink, Trash2,
    Loader2, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

export default function CompetitorsPage() {
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);

    const fetchCompetitors = useCallback(async () => {
        try {
            const response = await fetch('/api/competitors');
            if (!response.ok) throw new Error('Failed to fetch competitors');
            const data = await response.json();
            setCompetitors(data.competitors);
        } catch (error) {
            console.error('Error fetching competitors:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCompetitors();
    }, [fetchCompetitors]);

    /**
     * Remove competitor from tracking
     */
    const handleRemove = async (id: string) => {
        if (!confirm('Stop tracking this competitor?')) return;

        try {
            const response = await fetch(`/api/competitors?id=${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to remove competitor');
            setCompetitors(prev => prev.filter(c => c.id !== id));
        } catch (error) {
            console.error('Error removing competitor:', error);
        }
    };

    /**
     * Format follower count with K/M suffix
     */
    const formatFollowers = (count: number): string => {
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
    };

    const platformColors: Record<string, string> = {
        instagram: 'bg-gradient-to-br from-purple-500 to-pink-500',
        facebook: 'bg-blue-600',
        tiktok: 'bg-black',
        youtube: 'bg-red-600',
        pinterest: 'bg-red-500',
    };

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
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="h-4 w-4" />
                    Track Competitor
                </Button>
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
                        <p className="text-sm text-[var(--text-muted)]">
                            Add competitor accounts to benchmark your performance
                        </p>
                        <Button className="mt-4" onClick={() => setShowAddModal(true)}>
                            <Plus className="h-4 w-4" />
                            Track Your First Competitor
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Summary Stats */}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                <p className="text-sm text-[var(--text-muted)]">Tracking</p>
                                <p className="text-2xl font-bold">{competitors.length}</p>
                                <p className="text-xs text-[var(--text-muted)]">competitor{competitors.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                <p className="text-sm text-[var(--text-muted)]">Avg Followers</p>
                                <p className="text-2xl font-bold">
                                    {formatFollowers(Math.round(competitors.reduce((sum, c) => sum + c.followers, 0) / competitors.length) || 0)}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">across competitors</p>
                            </div>
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                <p className="text-sm text-[var(--text-muted)]">Avg Engagement</p>
                                <p className="text-2xl font-bold">
                                    {(competitors.reduce((sum, c) => sum + c.avgEngagement, 0) / competitors.length || 0).toFixed(1)}%
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">benchmark rate</p>
                            </div>
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                <p className="text-sm text-[var(--text-muted)]">Avg Posts/Week</p>
                                <p className="text-2xl font-bold">
                                    {(competitors.reduce((sum, c) => sum + c.postsPerWeek, 0) / competitors.length || 0).toFixed(1)}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">posting frequency</p>
                            </div>
                        </div>

                        {/* Competitors Grid */}
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {competitors.map((competitor) => (
                                <div
                                    key={competitor.id}
                                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                'flex h-12 w-12 items-center justify-center rounded-full text-white font-bold overflow-hidden',
                                                platformColors[competitor.platform] || 'bg-[var(--text-muted)]'
                                            )}>
                                                {competitor.avatar ? (
                                                    <img src={competitor.avatar} alt={competitor.username} className="h-full w-full object-cover" />
                                                ) : (
                                                    competitor.username.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-medium flex items-center gap-1">
                                                    @{competitor.username}
                                                    {competitor.isVerified && (
                                                        <span className="text-[var(--info)]">✓</span>
                                                    )}
                                                </h3>
                                                <p className="text-xs text-[var(--text-muted)] capitalize">
                                                    {competitor.platform}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <a
                                                href={`https://${competitor.platform}.com/${competitor.username}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </a>
                                            <button
                                                onClick={() => handleRemove(competitor.id)}
                                                className="p-2 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

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
                                            <p className={cn(
                                                'font-semibold flex items-center gap-1',
                                                competitor.followerGrowth >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'
                                            )}>
                                                {competitor.followerGrowth >= 0 ? (
                                                    <TrendingUp className="h-4 w-4" />
                                                ) : (
                                                    <TrendingDown className="h-4 w-4" />
                                                )}
                                                {competitor.followerGrowth >= 0 ? '+' : ''}{competitor.followerGrowth}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-[var(--text-muted)]">Engagement</p>
                                            <p className="font-semibold">{competitor.avgEngagement}%</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-[var(--text-muted)]">Posts/Week</p>
                                            <p className="font-semibold">{competitor.postsPerWeek}</p>
                                        </div>
                                    </div>

                                    {!competitor.lastSynced && (
                                        <p className="mt-4 text-xs text-[var(--text-muted)] italic">
                                            Connect social accounts to enable data sync
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
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

/**
 * Modal for adding competitors
 */
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
                avatar: null,
                platform: data.platform,
                followers: data.followers || 0,
                followerGrowth: 0,
                avgEngagement: 0,
                postsPerWeek: 0,
                isVerified: false,
                lastSynced: null
            });
        } catch (err) {
            setError('An error occurred. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-[var(--bg-secondary)] p-6">
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
