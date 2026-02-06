/**
 * Swipe-Back Gesture Hook
 * iOS-style edge swipe to navigate back
 * 
 * Why: Provides native-feeling navigation on mobile without 
 * relying on browser back button.
 */

'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { triggerHaptic } from '@/hooks/use-haptic';

interface UseSwipeBackOptions {
    /** Custom back handler (overrides router.back) */
    onBack?: () => void;
    /** Edge zone width in pixels */
    edgeWidth?: number;
    /** Distance to trigger navigation */
    threshold?: number;
    /** Whether swipe-back is enabled */
    enabled?: boolean;
}

interface SwipeBackState {
    /** Current swipe distance */
    swipeDistance: number;
    /** Whether actively swiping */
    isSwiping: boolean;
}

/**
 * Hook for edge swipe-back gesture
 */
export function useSwipeBack({
    onBack,
    edgeWidth = 30,
    threshold = 100,
    enabled = true,
}: UseSwipeBackOptions = {}) {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const startX = useRef(0);
    const startY = useRef(0);
    const [state, setState] = useState<SwipeBackState>({
        swipeDistance: 0,
        isSwiping: false,
    });

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (!enabled) return;

        const touch = e.touches[0];
        // Only trigger from left edge
        if (touch.clientX > edgeWidth) return;

        startX.current = touch.clientX;
        startY.current = touch.clientY;
        setState(prev => ({ ...prev, isSwiping: true }));
    }, [enabled, edgeWidth]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!state.isSwiping || !enabled) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - startX.current;
        const deltaY = Math.abs(touch.clientY - startY.current);

        // Cancel if swiping more vertically than horizontally
        if (deltaY > Math.abs(deltaX)) {
            setState({ swipeDistance: 0, isSwiping: false });
            return;
        }

        // Only allow right swipe
        if (deltaX < 0) {
            setState(prev => ({ ...prev, swipeDistance: 0 }));
            return;
        }

        // Haptic when crossing threshold
        if (deltaX >= threshold && state.swipeDistance < threshold) {
            triggerHaptic('light');
        }

        setState(prev => ({ ...prev, swipeDistance: deltaX }));
        e.preventDefault();
    }, [state.isSwiping, state.swipeDistance, enabled, threshold]);

    const handleTouchEnd = useCallback(() => {
        if (!state.isSwiping) return;

        if (state.swipeDistance >= threshold) {
            triggerHaptic('medium');
            if (onBack) {
                onBack();
            } else {
                router.back();
            }
        }

        setState({ swipeDistance: 0, isSwiping: false });
    }, [state.isSwiping, state.swipeDistance, threshold, onBack, router]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);
        container.addEventListener('touchcancel', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    return {
        containerRef,
        ...state,
        progress: Math.min(state.swipeDistance / threshold, 1),
    };
}

interface SwipeBackOverlayProps {
    swipeDistance: number;
    isSwiping: boolean;
}

/**
 * Visual overlay for swipe-back gesture
 */
export function SwipeBackOverlay({ swipeDistance, isSwiping }: SwipeBackOverlayProps) {
    if (!isSwiping || swipeDistance === 0) {
        return null;
    }

    const opacity = Math.min(swipeDistance / 200, 0.3);

    return (
        <>
            {/* Dark overlay */}
            <div
                className="fixed inset-0 bg-black pointer-events-none z-40 transition-opacity"
                style={{ opacity }}
            />

            {/* Edge indicator */}
            <div
                className="fixed left-0 top-0 bottom-0 w-1 bg-[var(--accent-gold)] z-50 pointer-events-none"
                style={{
                    transform: `scaleX(${Math.min(swipeDistance / 20, 3)})`,
                    transformOrigin: 'left',
                    opacity: Math.min(swipeDistance / 50, 1),
                }}
            />
        </>
    );
}
