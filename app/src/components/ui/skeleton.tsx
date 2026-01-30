/**
 * Skeleton loading components
 * Used as placeholders while content is loading
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return <div className={cn('skeleton h-4 w-full', className)} />;
}

export function SkeletonCard({ className }: SkeletonProps) {
    return (
        <div className={cn('card p-5', className)}>
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-20" />
        </div>
    );
}

export function SkeletonPostItem({ className }: SkeletonProps) {
    return (
        <div className={cn('flex items-center gap-4 p-4 bg-[var(--bg-secondary)]', className)}>
            <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
        </div>
    );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="card overflow-hidden">
            {/* Header */}
            <div className="flex gap-4 border-b border-[var(--border)] p-4 bg-[var(--bg-tertiary)]">
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-4 w-24" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex gap-4 border-b border-[var(--border)] p-4 last:border-0">
                    {[1, 2, 3, 4].map((j) => (
                        <Skeleton key={j} className="h-4 w-24" />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizeClasses = {
        sm: 'h-8 w-8',
        md: 'h-10 w-10',
        lg: 'h-12 w-12',
    };

    return <Skeleton className={cn('rounded-full', sizeClasses[size])} />;
}
