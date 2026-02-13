/**
 * Competitors loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function CompetitorsLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-36" />
                <div className="skeleton h-10 w-36 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <SkeletonCard className="h-48" />
                <SkeletonCard className="h-48" />
            </div>
        </div>
    );
}
