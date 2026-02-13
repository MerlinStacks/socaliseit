/**
 * Calendar loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function CalendarLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-32" />
                <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-10 rounded-lg" />
                    <div className="skeleton h-10 w-32 rounded-lg" />
                    <div className="skeleton h-10 w-10 rounded-lg" />
                </div>
            </div>
            {/* Calendar grid skeleton */}
            <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border border-[var(--border)]">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={`h-${i}`} className="skeleton h-10" />
                ))}
                {Array.from({ length: 35 }).map((_, i) => (
                    <div key={`c-${i}`} className="skeleton h-24" />
                ))}
            </div>
        </div>
    );
}
