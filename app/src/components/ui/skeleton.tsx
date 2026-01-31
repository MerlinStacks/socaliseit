/**
 * Skeleton loading components
 * Used as placeholders while content is loading
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
    className?: string;
    style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
    return <div className={cn('skeleton h-4 w-full', className)} style={style} />;
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

/**
 * Calendar grid skeleton - mimics the week view calendar layout
 */
export function SkeletonCalendarGrid({ className }: SkeletonProps) {
    const days = Array.from({ length: 7 });
    const timeSlots = Array.from({ length: 5 });

    return (
        <div className={cn('card overflow-hidden', className)}>
            {/* Header Row - Day names */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)]">
                <div className="p-4" />
                {days.map((_, i) => (
                    <div key={i} className="p-4 text-center">
                        <Skeleton className="mx-auto h-3 w-8 mb-2" />
                        <Skeleton className="mx-auto h-8 w-8 rounded-full" />
                    </div>
                ))}
            </div>

            {/* Time slot rows */}
            {timeSlots.map((_, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)] last:border-0">
                    <div className="bg-[var(--bg-tertiary)] p-3 flex items-start justify-end">
                        <Skeleton className="h-3 w-10" />
                    </div>
                    {days.map((_, colIndex) => (
                        <div key={colIndex} className="min-h-[100px] border-l border-[var(--border)] p-2">
                            {/* Randomly show 0-2 post skeletons per cell */}
                            {(rowIndex + colIndex) % 3 === 0 && (
                                <div className="mb-1 rounded-lg border-l-[3px] border-l-[var(--border)] bg-[var(--bg-secondary)] p-2.5">
                                    <Skeleton className="h-2 w-12 mb-2" />
                                    <Skeleton className="h-3 w-full" />
                                </div>
                            )}
                            {(rowIndex + colIndex) % 4 === 1 && (
                                <div className="mb-1 rounded-lg border-l-[3px] border-l-[var(--border)] bg-[var(--bg-secondary)] p-2.5">
                                    <Skeleton className="h-2 w-10 mb-2" />
                                    <Skeleton className="h-3 w-3/4" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

/**
 * Media grid skeleton - mimics the media library thumbnail grid
 */
export function SkeletonMediaGrid({ count = 12, className }: SkeletonProps & { count?: number }) {
    return (
        <div className={cn('grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6', className)}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-xl border-2 border-transparent">
                    {/* Thumbnail placeholder */}
                    <div className="aspect-square bg-[var(--bg-tertiary)] relative">
                        <Skeleton className="h-full w-full rounded-none" />
                        {/* Selection circle */}
                        <Skeleton className="absolute left-2 top-2 h-6 w-6 rounded-full" />
                        {/* Type badge */}
                        <Skeleton className="absolute right-2 top-2 h-5 w-5 rounded" />
                    </div>
                    {/* Info section */}
                    <div className="bg-[var(--bg-secondary)] p-3 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-12" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Analytics stat card skeleton
 */
export function SkeletonAnalyticsCard({ className }: SkeletonProps) {
    return (
        <div className={cn('card p-6', className)}>
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-28 mb-2" />
            <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-20" />
            </div>
        </div>
    );
}

/**
 * Analytics chart skeleton - placeholder for chart areas
 */
export function SkeletonAnalyticsChart({ className }: SkeletonProps) {
    return (
        <div className={cn('card p-6', className)}>
            {/* Chart header */}
            <div className="flex items-center justify-between mb-6">
                <Skeleton className="h-5 w-32" />
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
            </div>
            {/* Chart area - simulated bar chart */}
            <div className="flex items-end justify-between gap-2 h-48">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <Skeleton
                            className="w-full rounded-t"
                            style={{ height: `${30 + Math.random() * 70}%` }}
                        />
                        <Skeleton className="h-3 w-8" />
                    </div>
                ))}
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-6">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </div>
        </div>
    );
}

/**
 * Automation card skeleton
 */
export function SkeletonAutomationCard({ className }: SkeletonProps) {
    return (
        <div className={cn('rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6', className)}>
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                </div>
                <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-4" />
            </div>
        </div>
    );
}
