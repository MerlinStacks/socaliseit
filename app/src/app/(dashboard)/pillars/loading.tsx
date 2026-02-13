/**
 * Pillars loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function PillarsLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-40" />
                <div className="skeleton h-10 w-32 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <SkeletonCard className="h-40" />
                <SkeletonCard className="h-40" />
                <SkeletonCard className="h-40" />
            </div>
        </div>
    );
}
