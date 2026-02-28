/**
 * Trends loading skeleton
 * Why: Matches the new layout sections — hero stats, forecast, sounds, card grid.
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function TrendsLoading() {
    return (
        <div className="flex h-screen flex-col animate-in fade-in duration-150">
            {/* Header skeleton */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-10 rounded-lg" />
                    <div>
                        <div className="skeleton h-6 w-24 mb-1" />
                        <div className="skeleton h-4 w-48" />
                    </div>
                </div>
                <div className="skeleton h-8 w-24 rounded-lg" />
            </div>

            <div className="flex-1 overflow-auto p-8">
                {/* Hero stats skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="card p-5">
                            <div className="flex items-center gap-3">
                                <div className="skeleton h-10 w-10 rounded-xl" />
                                <div>
                                    <div className="skeleton h-7 w-16 mb-1" />
                                    <div className="skeleton h-3 w-20" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Forecast skeleton */}
                <div className="skeleton h-4 w-28 mb-4" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    <SkeletonCard className="h-32" />
                    <SkeletonCard className="h-32" />
                </div>

                {/* Sounds skeleton */}
                <div className="skeleton h-4 w-32 mb-4" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                    {[...Array(3)].map((_, i) => (
                        <SkeletonCard key={i} className="h-16" />
                    ))}
                </div>

                {/* Filter bar skeleton */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="skeleton h-9 w-64 rounded-xl" />
                    <div className="skeleton h-8 w-28 rounded-lg" />
                    <div className="skeleton h-8 w-40 rounded-lg" />
                </div>

                {/* Trend cards skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <SkeletonCard key={i} className="h-72" />
                    ))}
                </div>
            </div>
        </div>
    );
}
