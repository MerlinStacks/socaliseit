/**
 * Trends data component (server-side, streamed via Suspense)
 * Why: Heavy DB + external API calls run here while the page shell
 * shows a loading skeleton instantly. This is the SSR fallback path;
 * the primary experience uses spa-page.tsx via the SPA shell.
 */

import { db } from '@/lib/db';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    TrendingUp, Sparkles, Music, Hash, Video,
    Link as LinkIcon, ArrowUpRight, ExternalLink, Clock,
    Flame, Zap, Calendar,
} from 'lucide-react';
import { detectTrends, getTrendForecast, getTrendingSounds, getTrendsLastUpdated, type Trend } from '@/lib/trends';
import { formatDistanceToNow } from 'date-fns';

/** Format large numbers for display */
function formatVolume(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toString();
}

export async function TrendsData({ organizationId }: { organizationId: string }) {
    const socialAccounts = await db.socialAccount.findMany({
        where: { organizationId, isActive: true },
    });

    const hasAccounts = socialAccounts.length > 0;
    const connectedPlatforms = socialAccounts.map(a => a.platform.toLowerCase());

    // Fetch trends, forecast, sounds, and last-updated in parallel
    const [trends, forecast, sounds, lastUpdated] = await Promise.all([
        detectTrends(organizationId, {
            keywords: [],
            hashtags: [],
            competitors: [],
            industries: [],
        }, connectedPlatforms),
        getTrendForecast({
            keywords: [],
            hashtags: [],
            competitors: [],
            industries: [],
        }),
        getTrendingSounds('instagram'),
        getTrendsLastUpdated(),
    ]);

    const risingCount = trends.filter(t => t.velocity === 'rising').length;
    const platformCounts: Record<string, number> = {};
    for (const t of trends) {
        platformCounts[t.platform] = (platformCounts[t.platform] || 0) + 1;
    }
    const topPlatform = Object.entries(platformCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'google';

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
                        <p className="text-sm text-[var(--text-muted)]">Discover trending topics in your niche</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <Clock className="h-3 w-3" />
                    {lastUpdated
                        ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}`
                        : 'Recently updated'
                    }
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-auto p-8">
                {trends.length === 0 ? (
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
                    <div>
                        {/* Hero Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                            <div className="card p-5 border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-indigo-500/20">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-primary)]/60 text-violet-400">
                                        <TrendingUp className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{trends.length}</p>
                                        <p className="text-xs text-[var(--text-muted)]">Total Trends</p>
                                    </div>
                                </div>
                            </div>
                            <div className="card p-5 border border-orange-500/30 bg-gradient-to-br from-orange-500/20 to-red-500/20">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-primary)]/60 text-orange-400">
                                        <Flame className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{risingCount}</p>
                                        <p className="text-xs text-[var(--text-muted)]">Rising Now</p>
                                    </div>
                                </div>
                            </div>
                            <div className="card p-5 border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-primary)]/60 text-emerald-400">
                                        <Zap className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold capitalize">{topPlatform}</p>
                                        <p className="text-xs text-[var(--text-muted)]">Top Platform</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Forecast */}
                        {forecast.length > 0 && (
                            <div className="mb-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <Calendar className="h-4 w-4 text-[var(--accent-gold)]" />
                                    <h2 className="text-sm font-semibold">Trend Forecast</h2>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {forecast.map((item) => (
                                        <div key={item.week} className="card p-5">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-sm font-semibold">{item.week}</h3>
                                                <span className="text-[10px] text-[var(--text-muted)]">
                                                    {Math.round(item.confidence * 100)}% confidence
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                {item.predictedTrends.map((trend) => (
                                                    <span
                                                        key={trend}
                                                        className="inline-flex items-center rounded-full bg-[var(--accent-gold-light)] px-2.5 py-1 text-[10px] font-medium text-[var(--accent-gold)]"
                                                    >
                                                        {trend}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-[10px] text-[var(--text-muted)]">
                                                <Zap className="h-3 w-3 inline mr-1" />
                                                {item.basis}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Trending Sounds */}
                        {sounds.length > 0 && (
                            <div className="mb-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <Music className="h-4 w-4 text-pink-400" />
                                    <h2 className="text-sm font-semibold">Trending Sounds</h2>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {sounds.map((sound) => (
                                        <div key={sound.id} className="card p-4 flex items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/10">
                                                <Music className="h-5 w-5 text-pink-400" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium truncate">{sound.name}</p>
                                                <p className="text-[10px] text-[var(--text-muted)] truncate">{sound.artist}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xs font-semibold">{formatVolume(sound.usageCount)}</p>
                                                <span className={`text-[10px] font-medium ${sound.trend === 'rising' ? 'text-emerald-400' : 'text-amber-400'
                                                    }`}>
                                                    {sound.trend === 'rising' ? '↑ Rising' : '→ Stable'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Trends Grid */}
                        <div className="flex items-center gap-2 mb-4">
                            <Flame className="h-4 w-4 text-orange-400" />
                            <h2 className="text-sm font-semibold">Trending Now</h2>
                            <span className="text-xs text-[var(--text-muted)]">{trends.length} trends</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {trends.map((trend) => (
                                <TrendCard key={trend.id} trend={trend} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Trend Card Component — server-rendered version */
function TrendCard({ trend }: { trend: Trend }) {
    const typeIcons: Record<string, typeof Hash> = {
        hashtag: Hash,
        topic: TrendingUp,
        sound: Music,
        challenge: Sparkles,
        format: Video,
    };

    const velocityConfig: Record<string, { color: string; bg: string; label: string }> = {
        rising: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '🔥 Rising' },
        stable: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: '⚡ Stable' },
        declining: { color: 'text-red-400', bg: 'bg-red-500/10', label: '↓ Declining' },
    };

    const platformColors: Record<string, string> = {
        google: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
        instagram: 'bg-pink-500/15 text-pink-400 border-pink-500/25',
        tiktok: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
    };

    const TypeIcon = typeIcons[trend.type] || TrendingUp;
    const velocity = velocityConfig[trend.velocity] || velocityConfig.stable;
    const platformStyle = platformColors[trend.platform] || 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]';

    return (
        <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-gold-light)]">
                        <TypeIcon className="h-5 w-5 text-[var(--accent-gold)]" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold truncate">{trend.topic}</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium mt-1 ${platformStyle}`}>
                            {trend.platform}
                        </span>
                    </div>
                </div>
                <span className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${velocity.bg} ${velocity.color}`}>
                    {trend.velocity === 'rising' && <ArrowUpRight className="h-3 w-3" />}
                    {velocity.label}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-4">
                <div className="rounded-xl bg-[var(--bg-tertiary)] p-3 text-center">
                    <p className="text-lg font-bold">{formatVolume(trend.volume)}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Posts</p>
                </div>
                <div className="rounded-xl bg-[var(--bg-tertiary)] p-3 text-center">
                    <p className="text-lg font-bold text-emerald-400">+{trend.growth}%</p>
                    <p className="text-[10px] text-[var(--text-muted)]">24h Growth</p>
                </div>
            </div>

            <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-[var(--text-muted)]">Relevance Score</span>
                    <span className="text-[10px] font-semibold">{Math.round(trend.relevanceScore * 100)}%</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient"
                        style={{ width: `${trend.relevanceScore * 100}%` }}
                    />
                </div>
            </div>

            <p className="text-[10px] text-[var(--text-muted)] mb-3">
                <Clock className="h-3 w-3 inline mr-1" />
                Peak: {trend.peakPrediction}
            </p>

            <div className="bg-[var(--bg-tertiary)] rounded-xl p-3 mb-4">
                <p className="text-[10px] font-semibold mb-1 text-[var(--accent-gold)]">💡 Content Idea</p>
                <p className="text-xs text-[var(--text-secondary)]">{trend.suggestedContent}</p>
            </div>

            <div className="flex gap-2">
                <Link href={`/compose?hashtag=${encodeURIComponent(trend.topic)}`} className="flex-1">
                    <Button size="sm" variant="secondary" className="w-full text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
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
