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

import {
    createContext,
    lazy,
    memo,
    Suspense,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonCard } from '@/components/ui/skeleton';

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

/**
 * Routes that are fully SSR and can NOT be SPA-swapped.
 * Only /compose remains here since it uses Next.js intercepting/parallel routes.
 */
const SSR_ONLY_ROUTES = new Set([
    '/compose',
]);

// ── Generic Skeleton Fallback ──────────────────────────────────────────

function ViewSkeleton() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-6">
                <div className="skeleton h-8 w-40" />
                <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-32 rounded-lg" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
        </div>
    );
}

// ── SPA Navigation Context ─────────────────────────────────────────────

interface SPANavContextValue {
    /** Navigate to a dashboard route instantly (client-side). */
    navigateTo: (path: string) => void;
    /** Current pathname as tracked by the SPA shell. */
    currentPath: string;
    /** Whether the SPA shell is actively managing navigation. */
    spaActive: boolean;
    /** Activate the SPA shell (used internally by DashboardSPAShell). */
    setSpaActive: (active: boolean) => void;
}

const SPANavContext = createContext<SPANavContextValue | null>(null);

/**
 * Hook for sidebar / bottom-nav to trigger SPA navigation.
 * Falls back to Next.js router.push for non-SPA routes.
 */
export function useSPANavigation() {
    const ctx = useContext(SPANavContext);
    if (!ctx) {
        throw new Error('useSPANavigation must be used within <SPANavProvider>');
    }
    return ctx;
}

// ── Helper: match a pathname to a dashboard base route ──────────────────

function toDashboardRoute(pathname: string): string {
    // Strip trailing slash
    const p = pathname.endsWith('/') && pathname.length > 1
        ? pathname.slice(0, -1)
        : pathname;

    // Special case: /settings/sessions is its own route
    if (p === '/settings/sessions') return '/settings/sessions';

    // Otherwise take the first segment: /calendar/foo → /calendar
    const segments = p.split('/').filter(Boolean);
    return segments.length > 0 ? `/${segments[0]}` : '/dashboard';
}

// ── SPA Shell Component ─────────────────────────────────────────────────

interface DashboardSPAShellProps {
    children: ReactNode;
}

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

/**
 * Context provider that owns all SPA navigation state.
 * Wrap this around the entire dashboard layout so Sidebar,
 * MobileBottomNav, and DashboardSPAShell all have access.
 */
export function SPANavProvider({ children }: { children: ReactNode }) {
    const nextRouter = useRouter();

    /**
     * spaActive starts false. On first client-side navigateTo() call
     * it flips to true, and from then on the shell renders lazy views
     * instead of SSR children.
     *
     * Why: On hard refresh the SSR children are the correct RSC output.
     * We only take over once the user starts clicking sidebar links.
     */
    const [spaActive, setSpaActive] = useState(false);

    /**
     * Why not useState initializer: `window` is undefined during SSR.
     * Starting with '' prevents hydration mismatch; the effect immediately
     * sets the correct value on mount.
     */
    const [currentPath, setCurrentPath] = useState('');
    useEffect(() => {
        setCurrentPath(toDashboardRoute(window.location.pathname));
    }, []);

    // Keep a ref so popstate handler always sees the latest spaActive state
    const spaActiveRef = useRef(spaActive);
    spaActiveRef.current = spaActive;

    // Refs for stable navigateTo callback (avoids re-renders on path change)
    const currentPathRef = useRef(currentPath);
    currentPathRef.current = currentPath;
    const nextRouterRef = useRef(nextRouter);
    nextRouterRef.current = nextRouter;

    /**
     * Navigate to a dashboard path using client-side state swap.
     * SSR-only routes use Next.js router.push for smooth App Router transition.
     * SPA routes use history.pushState for instant, zero-server-contact swap.
     */
    const navigateTo = useCallback((path: string) => {
        const route = toDashboardRoute(path);

        // For SSR-only routes, delegate to Next.js App Router
        if (SSR_ONLY_ROUTES.has(route)) {
            nextRouterRef.current.push(path);
            return;
        }

        // Already on this route — no-op
        if (spaActiveRef.current && currentPathRef.current === route) return;

        // Push to history for back/forward support
        if (window.location.pathname !== path) {
            history.pushState({ spa: true }, '', path);
        }

        // Scroll to top for the new page
        window.scrollTo(0, 0);

        setSpaActive(true);
        setCurrentPath(route);
    }, []);

    // Listen for browser back/forward
    useEffect(() => {
        const handlePopState = () => {
            const route = toDashboardRoute(window.location.pathname);

            // If going back to an SSR route while SPA is active, reload
            if (SSR_ONLY_ROUTES.has(route) && spaActiveRef.current) {
                window.location.reload();
                return;
            }

            if (lazyViews[route]) {
                setSpaActive(true);
            }
            setCurrentPath(route);
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const contextValue = useMemo(
        () => ({ navigateTo, currentPath, spaActive, setSpaActive }),
        [navigateTo, currentPath, spaActive],
    );

    return (
        <SPANavContext.Provider value={contextValue}>
            {children}
        </SPANavContext.Provider>
    );
}

/**
 * View-swapping shell that renders lazy SPA views or SSR children.
 * Must be used inside <SPANavProvider>.
 */
export function DashboardSPAShell({ children }: DashboardSPAShellProps) {
    const { spaActive, currentPath } = useSPANavigation();

    return spaActive ? (
        <div key={currentPath} className="animate-in fade-in duration-120">
            <ActiveView route={currentPath}>{children}</ActiveView>
        </div>
    ) : (
        // First render: use SSR children from Next.js
        <>{children}</>
    );
}
