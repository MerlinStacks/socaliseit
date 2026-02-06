/**
 * App Badge Sync Component
 * Syncs engagement counts with the PWA app icon badge
 * 
 * Why: Shows unread count on the app icon on home screen,
 * giving users at-a-glance visibility of pending items.
 */

'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppBadge, isBadgeSupported } from '@/hooks/use-app-badge';
import type { SidebarBadges } from '@/app/api/sidebar/badges/route';

/**
 * Component that syncs engagement badge count to app icon
 * Should be mounted once at app root level
 */
export function AppBadgeSync() {
    const { data: badges } = useQuery<SidebarBadges>({
        queryKey: ['sidebar-badges'],
        queryFn: async () => {
            const res = await fetch('/api/sidebar/badges');
            if (!res.ok) throw new Error('Failed to fetch badges');
            return res.json();
        },
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        staleTime: 30_000,
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
                // Since iOS Safari doesn't support background sync
                if (navigator.onLine && 'serviceWorker' in navigator) {
                    // Notify service worker to trigger sync
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
