'use client';

/**
 * Swipe Action Hook
 * Provides horizontal swipe gesture detection for touch devices.
 * Returns a ref to attach to the swipeable element, inline transform style,
 * and a swiping state flag.
 *
 * Only activates on touch devices — mouse events are ignored.
 */

import { useRef, useState, useCallback, useEffect } from 'react';

interface SwipeActionOptions {
    /** Minimum horizontal distance (px) to trigger an action */
    threshold?: number;
    /** Maximum vertical distance (px) before cancelling horizontal detection */
    maxVertical?: number;
    /** Callback fired when user swipes right past threshold */
    onSwipeRight?: () => void;
    /** Callback fired when user swipes left past threshold */
    onSwipeLeft?: () => void;
}

interface SwipeActionResult {
    /** Ref to attach to the swipeable container element */
    ref: React.RefCallback<HTMLDivElement>;
    /** Inline style to apply (handles translateX during swipe) */
    style: React.CSSProperties;
    /** True while actively dragging */
    isSwiping: boolean;
    /** Current horizontal offset (negative = left, positive = right) */
    offset: number;
}

export function useSwipeAction({
    threshold = 80,
    maxVertical = 40,
    onSwipeRight,
    onSwipeLeft,
}: SwipeActionOptions): SwipeActionResult {
    const elRef = useRef<HTMLDivElement | null>(null);
    const startX = useRef(0);
    const startY = useRef(0);
    const [offset, setOffset] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const isTracking = useRef(false);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        const touch = e.touches[0];
        startX.current = touch.clientX;
        startY.current = touch.clientY;
        isTracking.current = true;
    }, []);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isTracking.current) return;
        const touch = e.touches[0];
        const dx = touch.clientX - startX.current;
        const dy = Math.abs(touch.clientY - startY.current);

        // Cancel if user is scrolling vertically
        if (dy > maxVertical) {
            isTracking.current = false;
            setOffset(0);
            setIsSwiping(false);
            return;
        }

        // Only start reacting after a small horizontal move to avoid jitter
        if (Math.abs(dx) > 10) {
            setIsSwiping(true);
            // Clamp offset to max of threshold * 1.2 for rubberbanding feel
            const max = threshold * 1.2;
            setOffset(Math.max(-max, Math.min(max, dx)));
        }
    }, [maxVertical, threshold]);

    const handleTouchEnd = useCallback(() => {
        if (!isTracking.current && !isSwiping) return;
        isTracking.current = false;

        if (offset >= threshold && onSwipeRight) {
            onSwipeRight();
        } else if (offset <= -threshold && onSwipeLeft) {
            onSwipeLeft();
        }

        // Animate back
        setOffset(0);
        setIsSwiping(false);
    }, [offset, threshold, isSwiping, onSwipeRight, onSwipeLeft]);

    // Attach / detach listeners when ref changes
    const ref = useCallback((node: HTMLDivElement | null) => {
        // Cleanup old
        if (elRef.current) {
            elRef.current.removeEventListener('touchstart', handleTouchStart);
            elRef.current.removeEventListener('touchmove', handleTouchMove);
            elRef.current.removeEventListener('touchend', handleTouchEnd);
        }
        elRef.current = node;
        if (node) {
            node.addEventListener('touchstart', handleTouchStart, { passive: true });
            node.addEventListener('touchmove', handleTouchMove, { passive: false });
            node.addEventListener('touchend', handleTouchEnd);
        }
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (elRef.current) {
                elRef.current.removeEventListener('touchstart', handleTouchStart);
                elRef.current.removeEventListener('touchmove', handleTouchMove);
                elRef.current.removeEventListener('touchend', handleTouchEnd);
            }
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    const style: React.CSSProperties = {
        transform: offset !== 0 ? `translateX(${offset}px)` : undefined,
        transition: isSwiping ? 'none' : 'transform 0.25s ease-out',
    };

    return { ref, style, isSwiping, offset };
}
