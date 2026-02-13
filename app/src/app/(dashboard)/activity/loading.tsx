/**
 * Activity loading skeleton
 */
export default function ActivityLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="skeleton h-8 w-32 mb-6" />
            <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] p-4">
                        <div className="skeleton h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <div className="skeleton h-4 w-48" />
                            <div className="skeleton h-3 w-24" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
