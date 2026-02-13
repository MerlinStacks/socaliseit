'use client';

/**
 * Page Transition Component
 * Uses native View Transitions API when available (Chrome/Edge 111+),
 * with framer-motion fallback for older browsers.
 * Respects user's prefers-reduced-motion preference.
 *
 * Performance: framer-motion is lazy-loaded so Chrome/Edge users
 * never download its ~30KB bundle for page transitions.
 */

import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState, useRef, lazy, Suspense } from 'react';

interface PageTransitionProps {
    children: ReactNode;
}

/**
 * Check if the browser supports the View Transitions API
 */
function supportsViewTransitions(): boolean {
    return typeof document !== 'undefined' &&
        'startViewTransition' in document;
}

function usePrefersReducedMotion(): boolean {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setPrefersReducedMotion(mediaQuery.matches);

        const handler = (event: MediaQueryListEvent) => {
            setPrefersReducedMotion(event.matches);
        };

        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    return prefersReducedMotion;
}

/**
 * Lazy-loaded framer-motion fallback component.
 * Only downloaded when native View Transitions are not available.
 */
const FramerMotionFallback = lazy(() =>
    import('framer-motion').then((mod) => ({
        default: function MotionPageTransition({ children, pathname, prefersReducedMotion }: {
            children: ReactNode;
            pathname: string;
            prefersReducedMotion: boolean;
        }) {
            const pageVariants = {
                initial: { opacity: 0, y: 8 },
                enter: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
                },
                exit: {
                    opacity: 0,
                    transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] },
                },
            };

            const reducedMotionVariants = {
                initial: { opacity: 1 },
                enter: { opacity: 1 },
                exit: { opacity: 1 },
            };

            const variants = prefersReducedMotion ? reducedMotionVariants : pageVariants;

            return (
                <mod.AnimatePresence mode="popLayout" initial={false}>
                    <mod.motion.div
                        key={pathname}
                        initial="initial"
                        animate="enter"
                        exit="exit"
                        variants={variants}
                        className="flex-1 flex flex-col min-h-0"
                    >
                        {children}
                    </mod.motion.div>
                </mod.AnimatePresence>
            );
        },
    }))
);

/**
 * Main PageTransition component
 * Prefers native View Transitions API, falls back to framer-motion
 */
export function PageTransition({ children }: PageTransitionProps) {
    const pathname = usePathname();
    const prefersReducedMotion = usePrefersReducedMotion();
    const prevPathname = useRef(pathname);
    const useNativeTransitions = supportsViewTransitions() && !prefersReducedMotion;

    // Trigger native View Transition on route change
    useEffect(() => {
        if (prevPathname.current !== pathname && useNativeTransitions) {
            try {
                // startViewTransition captures the outgoing state and
                // animates to the incoming state automatically
                (document as any).startViewTransition(() => {
                    return new Promise<void>((resolve) => {
                        requestAnimationFrame(() => resolve());
                    });
                });
            } catch {
                // Gracefully degrade if transition fails
            }
        }
        prevPathname.current = pathname;
    }, [pathname, useNativeTransitions]);

    // Native transitions: skip framer-motion entirely (majority of users)
    if (useNativeTransitions) {
        return (
            <div className="flex-1 flex flex-col min-h-0 view-transition-page">
                {children}
            </div>
        );
    }

    // Reduced motion: no animation at all, skip framer-motion download
    if (prefersReducedMotion) {
        return (
            <div className="flex-1 flex flex-col min-h-0">
                {children}
            </div>
        );
    }

    // Fallback: lazy-load framer-motion transition for older browsers
    return (
        <Suspense fallback={<div className="flex-1 flex flex-col min-h-0">{children}</div>}>
            <FramerMotionFallback pathname={pathname} prefersReducedMotion={prefersReducedMotion}>
                {children}
            </FramerMotionFallback>
        </Suspense>
    );
}

/**
 * Simpler fade transition for modal content or sections
 */
export function FadeTransition({ children }: PageTransitionProps) {
    const prefersReducedMotion = usePrefersReducedMotion();

    if (prefersReducedMotion) {
        return <>{children}</>;
    }

    return (
        <Suspense fallback={<>{children}</>}>
            <LazyFadeTransition>{children}</LazyFadeTransition>
        </Suspense>
    );
}

const LazyFadeTransition = lazy(() =>
    import('framer-motion').then((mod) => ({
        default: function FadeMotion({ children }: { children: ReactNode }) {
            return (
                <mod.motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {children}
                </mod.motion.div>
            );
        },
    }))
);

