/**
 * Compose loading skeleton
 */
export default function ComposeLoading() {
    return (
        <div className="flex h-[calc(100vh-64px)] animate-in fade-in duration-150">
            {/* Left panel - Editor */}
            <div className="flex-1 border-r border-[var(--border)] p-6">
                <div className="skeleton h-6 w-24 mb-4" />
                <div className="skeleton h-[200px] w-full rounded-xl mb-4" />
                <div className="skeleton h-10 w-full rounded-lg" />
            </div>
            {/* Right panel - Preview */}
            <div className="w-96 p-6">
                <div className="skeleton h-6 w-20 mb-4" />
                <div className="skeleton h-[400px] w-full rounded-xl" />
            </div>
        </div>
    );
}
