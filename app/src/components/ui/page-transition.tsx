'use client';

/**
 * Page Transition Component
 * Uses native View Transitions API when available (Chrome/Edge 111+),
 * with framer-motion fallback for older browsers.
 * Respects user's prefers-reduced-motion preference.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState, useRef } from 'react';

interface PageTransitionProps {
    children: ReactNode;
}

/**
 * Animation variants for page transitions (framer-motion fallback)
 */
const pageVariants = {
    initial: {
        opacity: 0,
        y: 8,
    },
    enter: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.25,
            ease: [0.25, 0.1, 0.25, 1],
        },
    },
    exit: {
        opacity: 0,
        transition: {
            duration: 0.15,
            ease: [0.25, 0.1, 0.25, 1],
        },
    },
};

const reducedMotionVariants = {
    initial: { opacity: 1 },
    enter: { opacity: 1 },
    exit: { opacity: 1 },
};

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

    // Native transitions: skip framer-motion entirely
    if (useNativeTransitions) {
        return (
            <div className="flex-1 flex flex-col min-h-0 view-transition-page">
                {children}
            </div>
        );
    }

    // Fallback: framer-motion transition
    const variants = prefersReducedMotion ? reducedMotionVariants : pageVariants;

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={pathname}
                initial="initial"
                animate="enter"
                exit="exit"
                variants={variants}
                className="flex-1 flex flex-col min-h-0"
            >
                {children}
            </motion.div>
        </AnimatePresence>
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
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            {children}
        </motion.div>
    );
}
