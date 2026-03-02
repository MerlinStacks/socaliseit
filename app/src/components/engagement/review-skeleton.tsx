'use client';

/**
 * ReviewSkeleton — loading placeholder matching the review card layout.
 */

import { Skeleton } from '@/components/ui/skeleton';

export function ReviewSkeleton() {
    return (
        <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
        </div>
    );
}
