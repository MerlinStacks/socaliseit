/**
 * Mobile Detection Hook
 * Provides responsive breakpoint detection for mobile-first UX
 */

'use client';

import { useState, useEffect } from 'react';

/**
 * Custom media query hook
 * Why: SSR-safe media query detection with hydration handling
 * 
 * @param query - CSS media query string (e.g., '(max-width: 768px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia(query);

        // Set initial value
        setMatches(mediaQuery.matches);

        // Create listener
        const handler = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        // Modern browsers use addEventListener
        mediaQuery.addEventListener('change', handler);

        return () => {
            mediaQuery.removeEventListener('change', handler);
        };
    }, [query]);

    return matches;
}

/**
 * Mobile detection hook using Tailwind's md breakpoint (768px)
 * Why: Consistent with existing responsive design in the app
 * 
 * @returns boolean - true if viewport is below 768px
 */
export function useIsMobile(): boolean {
    return useMediaQuery('(max-width: 767px)');
}

/**
 * Tablet detection hook (768px - 1024px)
 */
export function useIsTablet(): boolean {
    return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

/**
 * Touch device detection
 * Why: Enables different interaction patterns for touch vs mouse
 */
export function useIsTouchDevice(): boolean {
    const [isTouch, setIsTouch] = useState(false);

    useEffect(() => {
        const isTouchCapable =
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0;
        setIsTouch(isTouchCapable);
    }, []);

    return isTouch;
}

/**
 * Standalone mode detection (PWA installed)
 * Why: Enables PWA-specific UI adjustments
 */
export function useIsStandalone(): boolean {
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        const standalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as { standalone?: boolean }).standalone === true;
        setIsStandalone(standalone);
    }, []);

    return isStandalone;
}
