/**
 * Swipe Gesture Hook
 * Touch-based swipe detection for mobile interactions
 * Supports horizontal swipe with visual progress feedback
 */

'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { triggerHaptic } from './use-haptic';

interface SwipeConfig {
    /** Callback when swiped left past threshold */
    onSwipeLeft?: () => void;
    /** Callback when swiped right past threshold */
    onSwipeRight?: () => void;
    /** Minimum distance (px) to trigger swipe action. Default: 80 */
    threshold?: number;
    /** Distance (px) at which haptic feedback triggers. Default: 40 */
    hapticThreshold?: number;
    /** Prevent vertical scrolling during horizontal swipe. Default: true */
    preventScroll?: boolean;
    /** Disable swipe detection. Default: false */
    disabled?: boolean;
}

interface SwipeState {
    /** Ref to attach to the swipeable element */
    ref: React.RefObject<HTMLDivElement | null>;
    /** Whether user is currently swiping */
    isSwiping: boolean;
    /** Swipe progress from -1 (full left) to 1 (full right), 0 = center */
    swipeProgress: number;
    /** Current X offset in pixels for transform */
    offsetX: number;
}

/**
 * Hook for detecting and responding to horizontal swipe gestures
 * 
 * @example
 * ```tsx
 * const { ref, isSwiping, offsetX } = useSwipeGesture({
 *   onSwipeRight: () => openRescheduleModal(),
 *   threshold: 80,
 * });
 * 
 * <div 
 *   ref={ref}
 *   style={{ transform: `translateX(${offsetX}px)` }}
 * >
 *   Content
 * </div>
 * ```
 */
export function useSwipeGesture(config: SwipeConfig): SwipeState {
    const {
        onSwipeLeft,
        onSwipeRight,
        threshold = 80,
        hapticThreshold = 40,
        preventScroll = true,
        disabled = false,
    } = config;

    const ref = useRef<HTMLDivElement>(null);
    const [isSwiping, setIsSwiping] = useState(false);
    const [offsetX, setOffsetX] = useState(0);

    // Track touch state
    const touchState = useRef({
        startX: 0,
        startY: 0,
        currentX: 0,
        isHorizontalSwipe: false,
        hasTriggeredHaptic: false,
    });

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (disabled) return;

        const touch = e.touches[0];
        touchState.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            currentX: touch.clientX,
            isHorizontalSwipe: false,
            hasTriggeredHaptic: false,
        };
    }, [disabled]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (disabled) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - touchState.current.startX;
        const deltaY = touch.clientY - touchState.current.startY;

        // Determine swipe direction on first significant movement
        if (!touchState.current.isHorizontalSwipe && !isSwiping) {
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);

            // Only consider horizontal if X movement is greater than Y
            if (absX > 10 && absX > absY * 1.5) {
                touchState.current.isHorizontalSwipe = true;
                setIsSwiping(true);
            } else if (absY > 10) {
                // Vertical scroll - don't interfere
                return;
            }
        }

        if (touchState.current.isHorizontalSwipe) {
            // Prevent scroll during horizontal swipe
            if (preventScroll) {
                e.preventDefault();
            }

            touchState.current.currentX = touch.clientX;

            // Apply resistance at edges (reduce movement past threshold)
            const resistance = Math.abs(deltaX) > threshold ? 0.3 : 1;
            const resistedDelta = deltaX > threshold
                ? threshold + (deltaX - threshold) * resistance
                : deltaX < -threshold
                    ? -threshold + (deltaX + threshold) * resistance
                    : deltaX;

            setOffsetX(resistedDelta);

            // Trigger haptic when passing the haptic threshold
            if (!touchState.current.hasTriggeredHaptic && Math.abs(deltaX) >= hapticThreshold) {
                triggerHaptic('light');
                touchState.current.hasTriggeredHaptic = true;
            }
        }
    }, [disabled, isSwiping, preventScroll, threshold, hapticThreshold]);

    const handleTouchEnd = useCallback(() => {
        if (!touchState.current.isHorizontalSwipe) {
            setIsSwiping(false);
            return;
        }

        const deltaX = touchState.current.currentX - touchState.current.startX;

        // Check if threshold was reached
        if (deltaX >= threshold && onSwipeRight) {
            triggerHaptic('medium');
            onSwipeRight();
        } else if (deltaX <= -threshold && onSwipeLeft) {
            triggerHaptic('medium');
            onSwipeLeft();
        }

        // Reset state with animation
        setOffsetX(0);
        setIsSwiping(false);
        touchState.current.isHorizontalSwipe = false;
    }, [threshold, onSwipeLeft, onSwipeRight]);

    // Attach event listeners
    useEffect(() => {
        const element = ref.current;
        if (!element || disabled) return;

        element.addEventListener('touchstart', handleTouchStart, { passive: true });
        element.addEventListener('touchmove', handleTouchMove, { passive: false });
        element.addEventListener('touchend', handleTouchEnd, { passive: true });
        element.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        return () => {
            element.removeEventListener('touchstart', handleTouchStart);
            element.removeEventListener('touchmove', handleTouchMove);
            element.removeEventListener('touchend', handleTouchEnd);
            element.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

    // Calculate normalized progress (-1 to 1)
    const swipeProgress = Math.max(-1, Math.min(1, offsetX / threshold));

    return {
        ref,
        isSwiping,
        swipeProgress,
        offsetX,
    };
}
