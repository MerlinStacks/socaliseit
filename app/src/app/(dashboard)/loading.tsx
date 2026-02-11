/**
 * Generic dashboard loading skeleton
 * Why: Provides instant visual feedback during server-side layout re-renders
 * for all dashboard routes that don't have their own loading.tsx.
 */

import { SkeletonCard } from '@/components/ui/skeleton';

export default function DashboardGroupLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            {/* Page header skeleton */}
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-40" />
                <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-32 rounded-lg" />
                </div>
            </div>

            {/* Content skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>

            <div className="mt-6">
                <SkeletonCard className="h-64" />
            </div>
        </div>
    );
}
