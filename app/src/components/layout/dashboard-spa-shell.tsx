'use client';

/**
 * Dashboard SPA Shell — client-side view switching for instant navigation.
 *
 * How it works:
 * 1. On mount, reads `window.location.pathname` to pick the active view.
 * 2. `navigateTo(path)` calls `history.pushState` and swaps the view in
 *    React state — ZERO server contact, instant render.
 * 3. Listens to `popstate` for browser back/forward.
 * 4. Views are lazy-loaded with `React.lazy` so only the first navigation
 *    to a view downloads its bundle (subsequent visits are instant).
 * 5. The `{children}` prop (Next.js App Router output) is used as a fallback
 *    on the FIRST render only (hard refresh / direct URL). Once the SPA shell
 *    is active, it takes over all subsequent in-app navigation.
 *
 * Why: Next.js App Router hits the server on every navigation for an RSC
 * payload. For purely client components (9 of 14 dashboard pages), this is
 * unnecessary overhead. The SPA shell eliminates that round-trip.
 */

import { lazy, memo, Suspense, type ReactNode } from 'react';
import { SkeletonCard } from '@/components/ui/skeleton';
import { useSPANavigation, SPANavProvider } from './spa-nav-context';

// Re-export for consumers that import from this module
export { useSPANavigation, SPANavProvider } from './spa-nav-context';

/**
 * Why lazy: Each page's JS bundle is only downloaded when first visited.
 * On revisit, React reuses the already-resolved module — instant swap.
 *
 * Pages that had server-side data components now use `spa-page.tsx`
 * wrappers that fetch data via API routes + React Query.
 */
const lazyViews: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
    // Originally client-side pages (instant from day one)
    '/calendar': lazy(() => import('@/app/(dashboard)/calendar/page')),
    '/engagement': lazy(() => import('@/app/(dashboard)/engagement/page')),
    '/media': lazy(() => import('@/app/(dashboard)/media/page')),
    '/pillars': lazy(() => import('@/app/(dashboard)/pillars/page')),
    '/competitors': lazy(() => import('@/app/(dashboard)/competitors/page')),
    '/activity': lazy(() => import('@/app/(dashboard)/activity/page')),
    '/status': lazy(() => import('@/app/(dashboard)/status/page')),
    '/team': lazy(() => import('@/app/(dashboard)/team/page')),
    '/settings/sessions': lazy(() => import('@/app/(dashboard)/settings/sessions/page')),

    // Migrated from SSR → SPA (use spa-page.tsx client wrappers)
    '/dashboard': lazy(() => import('@/app/(dashboard)/dashboard/spa-page')),
    '/analytics': lazy(() => import('@/app/(dashboard)/analytics/spa-page')),
    '/trends': lazy(() => import('@/app/(dashboard)/trends/spa-page')),
    '/listening': lazy(() => import('@/app/(dashboard)/listening/spa-page')),
    '/settings': lazy(() => import('@/app/(dashboard)/settings/spa-page')),
};

// ── Generic Skeleton Fallback ──────────────────────────────────────────

function ViewSkeleton() {
    return (
        <div className="p-4 md:p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-6 md:h-8 w-32 md:w-40" />
                <div className="hidden md:flex items-center gap-3">
                    <div className="skeleton h-10 w-32 rounded-lg" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard className="hidden md:block" />
            </div>
        </div>
    );
}

// ── Active View Renderer ────────────────────────────────────────────────

/**
 * Memoised active view renderer.
 * Why memo: prevents re-renders when other shell state changes.
 */
const ActiveView = memo(function ActiveView({
    route,
    children,
}: {
    route: string;
    children: ReactNode;
}) {
    const LazyComponent = lazyViews[route];

    if (!LazyComponent) {
        // SSR-only route or unknown — use Next.js children
        return <>{children}</>;
    }

    return (
        <Suspense fallback={<ViewSkeleton />}>
            <LazyComponent />
        </Suspense>
    );
});

// ── SPA Shell Component ─────────────────────────────────────────────────

interface DashboardSPAShellProps {
    children: ReactNode;
}

/**
 * View-swapping shell that renders lazy SPA views or SSR children.
 * Must be used inside <SPANavProvider>.
 */
export function DashboardSPAShell({ children }: DashboardSPAShellProps) {
    const { spaActive, currentPath } = useSPANavigation();

    return spaActive ? (
        <div className="animate-in fade-in duration-120">
            <ActiveView route={currentPath}>{children}</ActiveView>
        </div>
    ) : (
        // First render: use SSR children from Next.js
        <>{children}</>
    );
}

/**
 * Convenience export: the lazy views record so the SPANavProvider
 * can reference it without circular imports.
 */
export { lazyViews };
