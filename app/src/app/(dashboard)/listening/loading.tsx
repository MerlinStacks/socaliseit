/**
 * Listening loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function ListeningLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-32" />
                <div className="skeleton h-10 w-28 rounded-lg" />
            </div>
            <SkeletonCard className="h-64 mb-6" />
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="skeleton h-16 w-full rounded-xl" />
                ))}
            </div>
        </div>
    );
}
