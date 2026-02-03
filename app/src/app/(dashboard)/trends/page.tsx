/**
 * Trends Page
 * Discover trending topics - shows real data when accounts connected
 */

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    TrendingUp, Sparkles, Music, Hash, Video,
    Link as LinkIcon, ArrowUpRight, ExternalLink, Clock
} from 'lucide-react';
import { detectTrends, type Trend } from '@/lib/trends';

export default async function TrendsPage() {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        redirect('/login');
    }

    const workspaceId = session.user.currentWorkspaceId;

    // Fetch connected accounts
    const socialAccounts = await db.socialAccount.findMany({
        where: { workspaceId, isActive: true },
    });

    const hasAccounts = socialAccounts.length > 0;

    // Fetch trends if accounts are connected
    let trends: Trend[] = [];
    if (hasAccounts) {
        const connectedPlatforms = socialAccounts.map(a => a.platform.toLowerCase());
        trends = await detectTrends(workspaceId, {
            keywords: [],
            hashtags: [],
            competitors: [],
            industries: [],
        }, connectedPlatforms);
    }

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Trends</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Discover trending topics in your niche
                        </p>
                    </div>
                </div>
                {hasAccounts && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-muted)]">
                            Tracking: {socialAccounts.map(a => a.platform.toLowerCase()).join(', ')}
                        </span>
                    </div>
                )}
            </header>

            {/* Content */}
            <div className="flex-1 overflow-auto p-8">
                {!hasAccounts ? (
                    /* Empty State - No Accounts Connected */
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Sparkles className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>

                            <h2 className="mt-6 text-xl font-semibold">Connect Accounts to See Trends</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                Once you connect your social accounts, we&apos;ll show you trending topics,
                                sounds, and hashtags relevant to your niche.
                            </p>

                            <div className="mt-8 grid grid-cols-3 gap-4">
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                    <Hash className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                                    <p className="mt-2 text-sm font-medium">Hashtags</p>
                                    <p className="text-xs text-[var(--text-muted)]">Top performing tags</p>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                    <Music className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                                    <p className="mt-2 text-sm font-medium">Sounds</p>
                                    <p className="text-xs text-[var(--text-muted)]">Trending audio</p>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                    <Video className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                                    <p className="mt-2 text-sm font-medium">Formats</p>
                                    <p className="text-xs text-[var(--text-muted)]">Viral templates</p>
                                </div>
                            </div>

                            <Link href="/settings?tab=integrations">
                                <Button className="mt-8">
                                    <LinkIcon className="h-4 w-4" />
                                    Connect Social Accounts
                                </Button>
                            </Link>
                        </div>
                    </div>
                ) : (
                    /* Trends Grid */
                    <div>
                        <div className="mb-6 flex items-center justify-between">
                            <p className="text-sm text-[var(--text-muted)]">
                                Showing <span className="font-medium text-[var(--text-primary)]">{trends.length}</span> trending topics
                            </p>
                            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                <Clock className="h-3 w-3" />
                                Updated just now
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {trends.map((trend) => (
                                <TrendCard key={trend.id} trend={trend} />
                            ))}
                        </div>

                        {trends.length === 0 && (
                            <div className="flex items-center justify-center h-64">
                                <div className="text-center">
                                    <Sparkles className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
                                    <p className="mt-4 text-[var(--text-muted)]">No trends detected yet. Check back soon!</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Trend Card Component
 * Displays individual trend with stats and actions
 */
function TrendCard({ trend }: { trend: Trend }) {
    const typeIcons: Record<string, typeof Hash> = {
        hashtag: Hash,
        topic: TrendingUp,
        sound: Music,
        challenge: Sparkles,
        format: Video,
    };

    const velocityColors: Record<string, string> = {
        rising: 'text-[var(--success)]',
        stable: 'text-[var(--warning)]',
        declining: 'text-[var(--error)]',
    };

    const TypeIcon = typeIcons[trend.type] || TrendingUp;

    return (
        <div className="card p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                        <TypeIcon className="h-5 w-5 text-[var(--accent-gold)]" />
                    </div>
                    <div>
                        <p className="font-medium">{trend.topic}</p>
                        <p className="text-xs text-[var(--text-muted)] capitalize">{trend.platform}</p>
                    </div>
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium ${velocityColors[trend.velocity]}`}>
                    {trend.velocity === 'rising' && <ArrowUpRight className="h-3 w-3" />}
                    {trend.velocity}
                </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                    <p className="text-xl font-bold">{formatVolume(trend.volume)}</p>
                    <p className="text-xs text-[var(--text-muted)]">Posts</p>
                </div>
                <div className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                    <p className="text-xl font-bold text-[var(--success)]">+{trend.growth}%</p>
                    <p className="text-xs text-[var(--text-muted)]">24h Growth</p>
                </div>
            </div>

            {/* Relevance Score */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--text-muted)]">Relevance</span>
                    <span className="text-xs font-medium">{Math.round(trend.relevanceScore * 100)}%</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient rounded-full"
                        style={{ width: `${trend.relevanceScore * 100}%` }}
                    />
                </div>
            </div>

            {/* Peak Prediction */}
            <p className="text-xs text-[var(--text-muted)] mb-4">
                <Clock className="h-3 w-3 inline mr-1" />
                Peak: {trend.peakPrediction}
            </p>

            {/* Suggested Content */}
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 mb-4">
                <p className="text-xs font-medium mb-1">💡 Content Idea</p>
                <p className="text-sm text-[var(--text-secondary)]">{trend.suggestedContent}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <Link href={`/compose?hashtag=${encodeURIComponent(trend.topic)}`} className="flex-1">
                    <Button size="sm" variant="secondary" className="w-full">
                        Create Post
                    </Button>
                </Link>
                {trend.samplePosts.length > 0 && (
                    <a href={trend.samplePosts[0].url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="secondary">
                            <ExternalLink className="h-3 w-3" />
                        </Button>
                    </a>
                )}
            </div>
        </div>
    );
}

/**
 * Format large numbers for display
 */
function formatVolume(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(0) + 'K';
    }
    return num.toString();
}
