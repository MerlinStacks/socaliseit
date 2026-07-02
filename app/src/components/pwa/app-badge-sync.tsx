/**
 * App Badge Sync Component
 * Syncs engagement counts with the PWA app icon badge
 * 
 * Why: Shows unread count on the app icon on home screen,
 * giving users at-a-glance visibility of pending items.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppBadge, isBadgeSupported } from '@/hooks/use-app-badge';
import type { SidebarBadges } from '@/app/api/sidebar/badges/route';
import { throwApiResponseError } from '@/lib/api-error';

// Cooldown between TRIGGER_SYNC messages (30s)
const SYNC_COOLDOWN_MS = 30_000;

/**
 * Component that syncs engagement badge count to app icon
 * Should be mounted once at app root level
 */
export function AppBadgeSync() {
    const lastSyncTrigger = useRef(0);

    const { data: badges } = useQuery<SidebarBadges>({
        queryKey: ['sidebar-badges'],
        queryFn: async () => {
            const res = await fetch('/api/sidebar/badges');
            if (!res.ok) throwApiResponseError(res, 'Failed to fetch badges');
            return res.json();
        },
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        staleTime: 2 * 60_000, // 2 min — badge counts change infrequently
    });

    // Calculate total unread count for badge
    const totalUnread = badges?.engagement ?? 0;

    // Sync badge count
    useAppBadge({ count: totalUnread, autoUpdate: true });

    // Also update when page becomes visible (iOS workaround for no background sync)
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                // Re-sync badge when page becomes visible
                if (badges && isBadgeSupported()) {
                    const { setAppBadge } = await import('@/hooks/use-app-badge');
                    setAppBadge(badges.engagement ?? 0);
                }

                // iOS workaround: Trigger offline queue sync on visibility
                // Throttled to prevent sync spam when rapidly switching tabs
                const now = Date.now();
                if (now - lastSyncTrigger.current < SYNC_COOLDOWN_MS) return;

                if (navigator.onLine && 'serviceWorker' in navigator) {
                    lastSyncTrigger.current = now;
                    navigator.serviceWorker.ready.then(registration => {
                        registration.active?.postMessage({ type: 'TRIGGER_SYNC' });
                    }).catch(() => {
                        // SW not ready, ignore
                    });
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [badges]);

    // This component doesn't render anything
    return null;
}
