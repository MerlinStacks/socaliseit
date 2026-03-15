/**
 * Screen Wake Lock Hook
 * Prevents screen from sleeping during video playback/editing
 * 
 * Why: Users need screen to stay on during long video previews
 * or when reviewing content. Auto-releases when component unmounts.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { clientLogger } from '@/lib/client-logger';

interface WakeLockState {
    /** Whether wake lock is currently active */
    isActive: boolean;
    /** Whether wake lock API is supported */
    isSupported: boolean;
    /** Request wake lock */
    request: () => Promise<boolean>;
    /** Release wake lock */
    release: () => Promise<void>;
}

/**
 * Check if Wake Lock API is supported
 */
export function isWakeLockSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Hook to manage screen wake lock
 * @param autoRequest - Whether to automatically request on mount
 */
export function useWakeLock(autoRequest = false): WakeLockState {
    const [isActive, setIsActive] = useState(false);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const isSupported = isWakeLockSupported();

    const request = useCallback(async (): Promise<boolean> => {
        if (!isSupported) {
            clientLogger.warn('[WakeLock] Not supported in this browser');
            return false;
        }

        try {
            // Release existing lock first
            if (wakeLockRef.current) {
                await wakeLockRef.current.release();
            }

            wakeLockRef.current = await navigator.wakeLock.request('screen');
            setIsActive(true);

            // Handle release event (e.g., when tab becomes inactive)
            wakeLockRef.current.addEventListener('release', () => {
                setIsActive(false);
                wakeLockRef.current = null;
            });

            clientLogger.info('[WakeLock] Acquired');
            return true;
        } catch (error) {
            // Wake lock can fail if:
            // - Low battery mode
            // - Tab not visible
            // - User denied permission
            clientLogger.warn({ error }, '[WakeLock] Failed to acquire');
            setIsActive(false);
            return false;
        }
    }, [isSupported]);

    const release = useCallback(async (): Promise<void> => {
        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release();
                clientLogger.info('[WakeLock] Released');
            } catch {
                // Already released, ignore
            }
            wakeLockRef.current = null;
            setIsActive(false);
        }
    }, []);

    // Auto-request on mount if enabled
    useEffect(() => {
        if (autoRequest && isSupported) {
            request();
        }

        // Cleanup on unmount
        return () => {
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => { });
                wakeLockRef.current = null;
            }
        };
    }, [autoRequest, isSupported, request]);

    // Re-acquire wake lock when page becomes visible again
    useEffect(() => {
        if (!isSupported) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isActive && !wakeLockRef.current) {
                // Re-acquire if we had it before and lost it
                request();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isSupported, isActive, request]);

    return {
        isActive,
        isSupported,
        request,
        release,
    };
}

/**
 * Imperative wake lock request for use outside React
 */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
    if (!isWakeLockSupported()) {
        return null;
    }

    try {
        return await navigator.wakeLock.request('screen');
    } catch {
        return null;
    }
}
