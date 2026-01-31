/**
 * Haptic Feedback Hook
 * PWA utility for triggering haptic/vibration feedback on mobile devices
 * Falls back gracefully on unsupported browsers
 */

'use client';

import { useCallback } from 'react';

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/** Vibration patterns in milliseconds */
const hapticPatterns: Record<HapticPattern, number | number[]> = {
    light: 10,
    medium: 25,
    heavy: 50,
    success: [10, 50, 10],
    warning: [25, 30, 25],
    error: [50, 25, 50, 25, 50],
};

/**
 * Returns a function to trigger haptic feedback.
 * Uses the Vibration API with graceful fallback.
 * 
 * @example
 * ```tsx
 * const haptic = useHaptic();
 * 
 * <Button onClick={() => {
 *   haptic('success');
 *   handleSubmit();
 * }}>
 *   Submit
 * </Button>
 * ```
 */
export function useHaptic() {
    const trigger = useCallback((pattern: HapticPattern = 'light') => {
        // Check if Vibration API is available
        if (typeof navigator === 'undefined' || !navigator.vibrate) {
            return false;
        }

        try {
            const vibrationPattern = hapticPatterns[pattern];
            navigator.vibrate(vibrationPattern);
            return true;
        } catch {
            // Silently fail if vibration is not supported
            return false;
        }
    }, []);

    return trigger;
}

/**
 * Imperative haptic trigger for use outside of React components
 * @param pattern - The haptic pattern to use
 */
export function triggerHaptic(pattern: HapticPattern = 'light'): boolean {
    if (typeof navigator === 'undefined' || !navigator.vibrate) {
        return false;
    }

    try {
        const vibrationPattern = hapticPatterns[pattern];
        navigator.vibrate(vibrationPattern);
        return true;
    } catch {
        return false;
    }
}

/**
 * Hook that provides both haptic feedback and a button event handler wrapper
 * Useful for adding haptic feedback to existing click handlers
 * 
 * @example
 * ```tsx
 * const { withHaptic } = useHapticButton();
 * 
 * <Button onClick={withHaptic(handleClick, 'medium')}>
 *   Click me
 * </Button>
 * ```
 */
export function useHapticButton() {
    const haptic = useHaptic();

    const withHaptic = useCallback(
        <T extends (...args: Parameters<T>) => ReturnType<T>>(
            handler: T,
            pattern: HapticPattern = 'light'
        ) => {
            return (...args: Parameters<T>): ReturnType<T> => {
                haptic(pattern);
                return handler(...args);
            };
        },
        [haptic]
    );

    return { haptic, withHaptic };
}
