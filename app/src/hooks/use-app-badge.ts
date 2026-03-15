/**
 * App Badge Hook
 * Updates the app icon badge with unread counts
 * 
 * Why: Shows users at a glance if they have unread items
 * without opening the app - native app behavior.
 */

'use client';

import { useEffect, useCallback } from 'react';
import { clientLogger } from '@/lib/client-logger';

/**
 * Check if Badging API is supported
 */
export function isBadgeSupported(): boolean {
    return typeof navigator !== 'undefined' && 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
}

/**
 * Set app badge count
 * @param count Number to display (0 clears the badge)
 */
export async function setAppBadge(count: number): Promise<boolean> {
    if (!isBadgeSupported()) {
        return false;
    }

    try {
        if (count <= 0) {
            await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
        } else {
            await (navigator as Navigator & { setAppBadge: (count: number) => Promise<void> }).setAppBadge(count);
        }
        return true;
    } catch (error) {
        // Badge API may fail silently on some platforms
        clientLogger.warn({ error }, '[Badge] Failed to set app badge');
        return false;
    }
}

/**
 * Clear app badge
 */
export async function clearAppBadge(): Promise<boolean> {
    return setAppBadge(0);
}

interface UseAppBadgeOptions {
    /** Count to display on badge */
    count: number;
    /** Whether to auto-update badge when count changes */
    autoUpdate?: boolean;
}

/**
 * Hook to manage app icon badge
 * Automatically updates badge when count changes
 */
export function useAppBadge({ count, autoUpdate = true }: UseAppBadgeOptions) {
    const updateBadge = useCallback(async (newCount: number) => {
        await setAppBadge(newCount);
    }, []);

    useEffect(() => {
        if (!autoUpdate) return;

        updateBadge(count);

        // Clear badge when component unmounts
        return () => {
            // Don't clear on unmount - badge should persist
        };
    }, [count, autoUpdate, updateBadge]);

    return {
        isSupported: isBadgeSupported(),
        setBadge: updateBadge,
        clearBadge: clearAppBadge,
    };
}
