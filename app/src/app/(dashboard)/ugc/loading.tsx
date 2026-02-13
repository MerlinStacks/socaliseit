/**
 * UGC loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function UGCLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-40" />
                <div className="skeleton h-10 w-28 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} className="h-48" />
                ))}
            </div>
        </div>
    );
}
