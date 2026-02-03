/**
 * Pull-to-Refresh Hook
 * Touch-based pull gesture with visual feedback for data refresh
 */

'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { triggerHaptic } from './use-haptic';

interface PullToRefreshConfig {
    /** Async callback to refresh data */
    onRefresh: () => Promise<void>;
    /** Distance (px) to trigger refresh. Default: 80 */
    threshold?: number;
    /** Distance (px) at which haptic feedback triggers. Default: 60 */
    hapticThreshold?: number;
    /** Disable pull-to-refresh. Default: false */
    disabled?: boolean;
}

interface PullToRefreshState {
    /** Ref to attach to the scrollable container */
    containerRef: React.RefObject<HTMLDivElement | null>;
    /** Whether refresh is in progress */
    isRefreshing: boolean;
    /** Pull progress from 0 (start) to 1 (threshold reached) */
    pullProgress: number;
    /** Current pull distance in pixels */
    pullDistance: number;
    /** Whether the threshold has been reached (can release to refresh) */
    canRefresh: boolean;
}

/**
 * Hook for implementing pull-to-refresh gesture
 */
export function usePullToRefresh(config: PullToRefreshConfig): PullToRefreshState {
    const {
        onRefresh,
        threshold = 80,
        hapticThreshold = 60,
        disabled = false,
    } = config;

    const containerRef = useRef<HTMLDivElement>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [canRefresh, setCanRefresh] = useState(false);

    const touchState = useRef({
        startY: 0,
        isPulling: false,
        hasTriggeredHaptic: false,
    });

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (disabled || isRefreshing) return;

        const container = containerRef.current;
        if (!container) return;

        if (container.scrollTop > 0) return;

        const touch = e.touches[0];
        touchState.current = {
            startY: touch.clientY,
            isPulling: true,
            hasTriggeredHaptic: false,
        };
    }, [disabled, isRefreshing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!touchState.current.isPulling || disabled || isRefreshing) return;

        const container = containerRef.current;
        if (!container) return;

        if (container.scrollTop > 0) {
            touchState.current.isPulling = false;
            setPullDistance(0);
            return;
        }

        const touch = e.touches[0];
        const deltaY = touch.clientY - touchState.current.startY;

        if (deltaY < 0) {
            setPullDistance(0);
            return;
        }

        e.preventDefault();

        const resistance = Math.min(1, threshold / (deltaY + threshold));
        const resistedDistance = deltaY * resistance;

        setPullDistance(resistedDistance);

        const thresholdReached = resistedDistance >= threshold;
        setCanRefresh(thresholdReached);

        if (!touchState.current.hasTriggeredHaptic && resistedDistance >= hapticThreshold) {
            triggerHaptic('medium');
            touchState.current.hasTriggeredHaptic = true;
        }
    }, [disabled, isRefreshing, threshold, hapticThreshold]);

    const handleTouchEnd = useCallback(async () => {
        if (!touchState.current.isPulling || disabled) return;

        touchState.current.isPulling = false;

        if (canRefresh && !isRefreshing) {
            setIsRefreshing(true);
            setPullDistance(threshold * 0.5);
            triggerHaptic('success');

            try {
                await onRefresh();
            } catch (error) {
                console.error('Refresh failed:', error);
                triggerHaptic('error');
            } finally {
                setIsRefreshing(false);
                setPullDistance(0);
                setCanRefresh(false);
            }
        } else {
            setPullDistance(0);
            setCanRefresh(false);
        }
    }, [canRefresh, isRefreshing, onRefresh, threshold, disabled]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || disabled) return;

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });
        container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

    const pullProgress = Math.min(1, pullDistance / threshold);

    return {
        containerRef,
        isRefreshing,
        pullProgress,
        pullDistance,
        canRefresh,
    };
}

/**
 * Pull Indicator Component
 * Visual feedback for pull-to-refresh gesture
 */
interface PullIndicatorProps {
    progress: number;
    isRefreshing: boolean;
    pullDistance: number;
}

export function PullIndicator({ progress, isRefreshing, pullDistance }: PullIndicatorProps) {
    if (pullDistance === 0 && !isRefreshing) return null;

    const containerStyle = {
        transform: `translateY(${pullDistance - 40}px)`,
        opacity: Math.min(1, progress * 2),
    };

    const spinnerStyle = {
        transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)`,
    };

    const spinnerClass = `flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)] shadow-lg border border-[var(--border)] ${isRefreshing ? 'animate-spin' : ''}`;

    return (
        <div
            className= "absolute left-0 right-0 top-0 flex items-center justify-center pointer-events-none z-10"
    style = { containerStyle }
        >
        <div className={ spinnerClass } style = { spinnerStyle } >
            {
                isRefreshing?(
                    <svg className = "h-5 w-5 text-[var(--accent-gold)]" fill = "none" viewBox = "0 0 24 24" >
                        <circle className="opacity-25" cx = "12" cy = "12" r = "10" stroke = "currentColor" strokeWidth = "4" />
                            <path className="opacity-75" fill = "currentColor" d = "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                ): (
                        <svg className = "h-5 w-5 text-[var(--text-muted)]" fill = "none" viewBox = "0 0 24 24" stroke = "currentColor">
                        <path strokeLinecap = "round" strokeLinejoin = "round" strokeWidth = { 2 } d = "M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
                )
}
</div>
    </div>
    );
}


