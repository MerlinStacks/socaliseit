/**
 * Dashboard loading state
 * Shows skeletons while dashboard content loads
 */

import { SkeletonCard } from '@/components/ui/skeleton';

export default function DashboardLoading() {
    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-32" />
                <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-64 rounded-lg" />
                    <div className="skeleton h-10 w-32 rounded-lg" />
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3 mb-6">
                <div className="skeleton h-10 w-28 rounded-lg" />
                <div className="skeleton h-10 w-36 rounded-lg" />
                <div className="skeleton h-10 w-32 rounded-lg" />
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-5">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>

            {/* Two Column */}
            <div className="grid grid-cols-3 gap-5 mt-6">
                <div className="col-span-2">
                    <SkeletonCard className="h-48" />
                </div>
                <div>
                    <SkeletonCard className="h-48" />
                </div>
            </div>
        </div>
    );
}
