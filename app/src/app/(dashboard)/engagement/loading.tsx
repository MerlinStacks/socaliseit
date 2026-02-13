/**
 * Engagement loading skeleton
 */
export default function EngagementLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-40" />
                <div className="skeleton h-10 w-24 rounded-lg" />
            </div>
            {/* Tabs skeleton */}
            <div className="flex gap-2 mb-6">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton h-10 w-28 rounded-lg" />
                ))}
            </div>
            {/* Message list skeleton */}
            <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl bg-[var(--bg-secondary)] p-4">
                        <div className="skeleton h-10 w-10 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="skeleton h-4 w-32" />
                            <div className="skeleton h-3 w-full" />
                            <div className="skeleton h-3 w-2/3" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
