'use client';

/**
 * Page Transition Component
 * Provides smooth fade + slide animations for page navigation
 * Respects user's prefers-reduced-motion preference
 */

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

interface PageTransitionProps {
    children: ReactNode;
}

/**
 * Animation variants for page transitions
 * - Fade in with subtle upward slide on enter
 * - Fade out on exit
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
            ease: [0.25, 0.1, 0.25, 1], // Smooth ease-out
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

/**
 * Reduced motion variants - instant transitions for accessibility
 */
const reducedMotionVariants = {
    initial: { opacity: 1 },
    enter: { opacity: 1 },
    exit: { opacity: 1 },
};

/**
 * Hook to detect prefers-reduced-motion
 */
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
 * Wraps content with AnimatePresence for enter/exit animations
 */
export function PageTransition({ children }: PageTransitionProps) {
    const pathname = usePathname();
    const prefersReducedMotion = usePrefersReducedMotion();

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
