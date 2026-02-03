/**
 * Timeline Scroll Synchronization Hook
 * Provides shared scroll state for synchronized timeline tracks.
 * 
 * Why: Multiple timeline tracks (video, audio, text) need to scroll together
 * for proper alignment. This hook provides a centralized scroll position
 * that all tracks can subscribe to.
 */

import { create } from 'zustand';
import { useCallback, useRef, useEffect } from 'react';

interface TimelineScrollState {
    scrollLeft: number;
    setScrollLeft: (value: number) => void;
}

/**
 * Zustand store for shared scroll position
 */
export const useTimelineScrollStore = create<TimelineScrollState>((set) => ({
    scrollLeft: 0,
    setScrollLeft: (value) => set({ scrollLeft: value }),
}));

/**
 * Hook to bind a scrollable element to the shared timeline scroll
 * @returns Ref to attach to scrollable container and scroll handlers
 */
export function useTimelineScroll() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollLeft, setScrollLeft } = useTimelineScrollStore();
    const isUpdatingRef = useRef(false);

    /**
     * Handle local scroll events and sync to store
     */
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (isUpdatingRef.current) return;

        const target = e.currentTarget;
        setScrollLeft(target.scrollLeft);
    }, [setScrollLeft]);

    /**
     * Sync container scroll position when store updates
     */
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Only update if scroll position differs
        if (Math.abs(container.scrollLeft - scrollLeft) > 1) {
            isUpdatingRef.current = true;
            container.scrollLeft = scrollLeft;
            // Reset flag after a frame to allow future updates
            requestAnimationFrame(() => {
                isUpdatingRef.current = false;
            });
        }
    }, [scrollLeft]);

    return {
        containerRef,
        handleScroll,
        scrollLeft,
    };
}

/**
 * Hook to programmatically scroll to a specific frame
 * @param frameToPixel - Function to convert frame to pixel position
 */
export function useScrollToFrame(frameToPixel: (frame: number) => number) {
    const { setScrollLeft } = useTimelineScrollStore();

    const scrollToFrame = useCallback((frame: number, containerWidth: number) => {
        const pixelPosition = frameToPixel(frame);
        // Center the frame in the viewport
        const centeredScroll = Math.max(0, pixelPosition - containerWidth / 2);
        setScrollLeft(centeredScroll);
    }, [frameToPixel, setScrollLeft]);

    return scrollToFrame;
}
