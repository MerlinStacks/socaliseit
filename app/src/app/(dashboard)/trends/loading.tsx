/**
 * Trends loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function TrendsLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-32" />
                <div className="skeleton h-10 w-28 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <SkeletonCard className="h-64" />
                <SkeletonCard className="h-64" />
            </div>
            <SkeletonCard className="h-48 mt-6" />
        </div>
    );
}
