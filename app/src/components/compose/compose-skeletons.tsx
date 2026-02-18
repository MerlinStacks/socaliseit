/**
 * Skeleton placeholders for lazy-loaded compose panels.
 * Why: Extracted from compose/page.tsx to reduce the main bundle.
 * These render instantly while the heavy panel chunks download.
 */

/** Shimmer bar helper — reused across skeletons */
export function Shimmer({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded bg-[var(--bg-tertiary)] ${className ?? ''}`} />;
}

export function ProfileSelectorSkeleton() {
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <Shimmer className="h-8 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <Shimmer className="h-8 w-8 rounded-full" />
                    <Shimmer className="h-4 flex-1" />
                </div>
            ))}
        </div>
    );
}

export function EditorSkeleton() {
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <Shimmer className="h-8 w-48" />
            <Shimmer className="h-24 w-full" />
            <div className="flex gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Shimmer key={i} className="h-7 w-7" />
                ))}
            </div>
        </div>
    );
}

export function PanelSkeleton() {
    return (
        <div className="flex h-full flex-col gap-4 p-4">
            <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Shimmer key={i} className="h-9 w-9 rounded-lg" />
                ))}
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                    <Shimmer className="h-4 w-24" />
                    <Shimmer className="h-10 w-full" />
                </div>
            ))}
        </div>
    );
}
