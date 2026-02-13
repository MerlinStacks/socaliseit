/**
 * Media library loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function MediaLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-36" />
                <div className="skeleton h-10 w-32 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="skeleton aspect-square rounded-xl" />
                ))}
            </div>
        </div>
    );
}
