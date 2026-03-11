'use client';

/**
 * SPA Navigation Context — owns all SPA navigation state.
 *
 * Why extracted: The DashboardSPAShell module was 300+ lines. This file
 * houses the context, provider, and helper used by Sidebar, MobileBottomNav,
 * and the SPA shell itself to coordinate instant client-side view switching.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';

// ── Route registry (shared with dashboard-spa-shell) ────────────────────

/**
 * Routes that are fully SSR and can NOT be SPA-swapped.
 * Only /compose remains here since it uses Next.js intercepting/parallel routes.
 */
export const SSR_ONLY_ROUTES = new Set([
    '/compose',
]);

// ── Helper: match a pathname to a dashboard base route ──────────────────

/**
 * Resolve a full pathname to its dashboard base route key.
 * Why: SPA views are keyed by their base segment (e.g. '/calendar'),
 * but the URL may include sub-paths (e.g. '/calendar/week').
 */
export function toDashboardRoute(pathname: string): string {
    const p = pathname.endsWith('/') && pathname.length > 1
        ? pathname.slice(0, -1)
        : pathname;

    // Special case: /settings/sessions is its own route
    if (p === '/settings/sessions') return '/settings/sessions';

    // Otherwise take the first segment: /calendar/foo → /calendar
    const segments = p.split('/').filter(Boolean);
    return segments.length > 0 ? `/${segments[0]}` : '/dashboard';
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

// ── Provider ────────────────────────────────────────────────────────────

interface SPANavProviderProps {
    children: ReactNode;
    /** Lazy view registry — passed in so this module stays route-agnostic. */
    lazyViews: Record<string, unknown>;
}

/**
 * Context provider that owns all SPA navigation state.
 * Wrap this around the entire dashboard layout so Sidebar,
 * MobileBottomNav, and DashboardSPAShell all have access.
 */
export function SPANavProvider({ children, lazyViews }: SPANavProviderProps) {
    const nextRouter = useRouter();
    const pathname = usePathname();

    /**
     * spaActive controls whether the shell renders lazy views or SSR children.
     * Starts false to avoid hydration mismatch, then auto-activates on mount
     * for SPA-eligible routes via the effect below.
     */
    const [spaActive, setSpaActive] = useState(false);

    const [currentPath, setCurrentPath] = useState(() => toDashboardRoute(pathname));

    /**
     * Auto-activate SPA on mount for eligible routes.
     * Why: Without this, users must click a sidebar link before lazy views
     * take over — until then {children} are SSR output that goes stale.
     */
    useEffect(() => {
        const route = toDashboardRoute(window.location.pathname);
        if (lazyViews[route]) {
            setSpaActive(true);
        }
    }, [lazyViews]);

    /**
     * Sync SPA state when Next.js pathname changes (e.g. <Link>, router.push).
     * Activates SPA for eligible routes, deactivates for SSR-only routes
     * so {children} passthrough works correctly.
     */
    useEffect(() => {
        const route = toDashboardRoute(pathname);
        setCurrentPath(route);
        if (lazyViews[route]) {
            setSpaActive(true);
        } else {
            // SSR-only route (e.g. /compose) — let {children} render
            setSpaActive(false);
        }
    }, [pathname, lazyViews]);

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
        // Keep Next.js router in sync so {children} stays fresh
        // for when SPA mode deactivates (e.g. navigating to /compose)
        nextRouterRef.current.replace(path, { scroll: false });

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
    }, [lazyViews]);

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
