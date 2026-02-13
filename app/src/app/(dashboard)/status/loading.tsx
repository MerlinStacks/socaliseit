/**
 * Status loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function StatusLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="skeleton h-8 w-36 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <SkeletonCard className="h-48 mt-6" />
        </div>
    );
}
