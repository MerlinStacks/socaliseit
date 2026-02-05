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
import { detectTrends, getTrendsLastUpdated, type Trend } from '@/lib/trends';
import { formatDistanceToNow } from 'date-fns';

export default async function TrendsPage() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;

    // Fetch connected accounts
    const socialAccounts = await db.socialAccount.findMany({
        where: { organizationId, isActive: true },
    });

    const hasAccounts = socialAccounts.length > 0;

    // Fetch trends (now uses Google Trends as primary source)
    const connectedPlatforms = socialAccounts.map(a => a.platform.toLowerCase());
    const trends = await detectTrends(organizationId, {
        keywords: [],
        hashtags: [],
        competitors: [],
        industries: [],
    }, connectedPlatforms);

    // Get when trends were last updated
    const lastUpdated = await getTrendsLastUpdated();

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
                {trends.length === 0 ? (
                    /* Empty State */
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Sparkles className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>

                            <h2 className="mt-6 text-xl font-semibold">No Trends Available</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                We couldn&apos;t fetch any trends right now. Try again in a few minutes.
                            </p>

                            {!hasAccounts && (
                                <>
                                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                                        Connect social accounts for personalized hashtag trends.
                                    </p>
                                    <Link href="/settings?tab=integrations">
                                        <Button className="mt-4" variant="secondary">
                                            <LinkIcon className="h-4 w-4" />
                                            Connect Accounts
                                        </Button>
                                    </Link>
                                </>
                            )}
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
                                {lastUpdated
                                    ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}`
                                    : 'Recently updated'
                                }
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
