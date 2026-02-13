/**
 * Analytics loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function AnalyticsLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-32" />
                <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-28 rounded-lg" />
                    <div className="skeleton h-10 w-28 rounded-lg" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <SkeletonCard className="h-64 mb-6" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <SkeletonCard className="h-48" />
                <SkeletonCard className="h-48" />
            </div>
        </div>
    );
}
