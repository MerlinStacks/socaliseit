/**
 * Modal-overlay loading skeleton for the intercepting compose route.
 *
 * Why: Without this file, Next.js blocks rendering until the server
 * component finishes fetching post data. This skeleton renders
 * *immediately*, giving users instant visual feedback that the
 * composer is opening — matching the modal overlay structure of
 * ComposeClient (fixed inset-0 z-50).
 */

import { Shimmer } from '@/components/compose/compose-skeletons';

export default function ComposeInterceptLoading() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative flex h-[90vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-[var(--bg-primary)] shadow-2xl">
                {/* Header skeleton */}
                <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Shimmer className="h-5 w-24" />
                        <Shimmer className="h-5 w-32 rounded-full" />
                    </div>
                    <Shimmer className="h-9 w-9 rounded-lg" />
                </header>

                {/* Body skeleton */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Profile selector column */}
                    <div className="w-[180px] flex-shrink-0 border-r border-[var(--border)] p-4">
                        <Shimmer className="h-8 w-full mb-3" />
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-2 mb-3">
                                <Shimmer className="h-8 w-8 rounded-full" />
                                <Shimmer className="h-4 flex-1" />
                            </div>
                        ))}
                    </div>

                    {/* Editor column */}
                    <div className="flex-1 min-w-[380px] max-w-[480px] border-r border-[var(--border)] p-4">
                        <Shimmer className="h-8 w-48 mb-3" />
                        <Shimmer className="h-32 w-full mb-3" />
                        <div className="flex gap-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Shimmer key={i} className="h-7 w-7" />
                            ))}
                        </div>
                    </div>

                    {/* Customization column */}
                    <div className="flex-1 min-w-[440px] max-w-[560px] border-r border-[var(--border)] p-4">
                        <div className="flex gap-2 mb-4">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Shimmer key={i} className="h-9 w-9 rounded-lg" />
                            ))}
                        </div>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="space-y-2 mb-4">
                                <Shimmer className="h-4 w-24" />
                                <Shimmer className="h-10 w-full" />
                            </div>
                        ))}
                    </div>

                    {/* Preview column */}
                    <div className="w-[280px] flex-shrink-0 bg-[var(--bg-secondary)] p-3">
                        <Shimmer className="h-4 w-16 mb-3" />
                        <Shimmer className="h-[300px] w-full rounded-xl" />
                    </div>
                </div>

                {/* Footer skeleton */}
                <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                    <div className="flex items-center justify-end gap-3">
                        <Shimmer className="h-9 w-28 rounded-lg" />
                        <Shimmer className="h-9 w-24 rounded-lg" />
                    </div>
                </footer>
            </div>
        </div>
    );
}
