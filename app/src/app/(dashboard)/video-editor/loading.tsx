/**
 * Video editor loading skeleton
 */
export default function VideoEditorLoading() {
    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-[var(--bg-primary)] animate-in fade-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="skeleton h-8 w-36" />
                <div className="flex gap-2">
                    <div className="skeleton h-10 w-24 rounded-lg" />
                    <div className="skeleton h-10 w-24 rounded-lg" />
                </div>
            </div>
            {/* Main area */}
            <div className="flex flex-1">
                <div className="w-64 border-r border-[var(--border)] p-4">
                    <div className="skeleton h-64 w-full rounded-xl" />
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="skeleton w-[480px] h-[270px] rounded-xl" />
                </div>
                <div className="w-72 border-l border-[var(--border)] p-4">
                    <div className="skeleton h-48 w-full rounded-xl" />
                </div>
            </div>
            {/* Timeline */}
            <div className="h-40 border-t border-[var(--border)] p-4">
                <div className="skeleton h-full w-full rounded-xl" />
            </div>
        </div>
    );
}
