/**
 * Team loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function TeamLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-24" />
                <div className="skeleton h-10 w-32 rounded-lg" />
            </div>
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-xl bg-[var(--bg-secondary)] p-4">
                        <div className="skeleton h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <div className="skeleton h-4 w-32" />
                            <div className="skeleton h-3 w-48" />
                        </div>
                        <div className="skeleton h-8 w-20 rounded-lg" />
                    </div>
                ))}
            </div>
        </div>
    );
}
