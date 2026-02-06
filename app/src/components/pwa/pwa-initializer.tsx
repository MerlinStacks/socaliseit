/**
 * PWA Initializer Component
 * Registers advanced PWA features on app load:
 * - Periodic Background Sync
 * - SW message handlers
 * 
 * Why: These features need to be registered from the main thread on app load.
 */

'use client';

import { useEffect } from 'react';
import { registerPeriodicSync, isPeriodicSyncSupported } from '@/lib/background-sync';

/**
 * Initialize PWA features on mount
 */
export function PWAInitializer() {
    useEffect(() => {
        // Register periodic background sync (12-hour interval)
        if (isPeriodicSyncSupported()) {
            registerPeriodicSync(12 * 60 * 60 * 1000).catch(console.warn);
        }

        // Listen for SW messages
        const handleSWMessage = (event: MessageEvent) => {
            switch (event.data?.type) {
                case 'BACKGROUND_FETCH_SUCCESS':
                    console.info('[PWA] Background fetch complete:', event.data.id);
                    break;
                case 'BACKGROUND_FETCH_FAILED':
                    console.warn('[PWA] Background fetch failed:', event.data.id);
                    break;
                case 'PERIODIC_SYNC_COMPLETE':
                    console.info('[PWA] Periodic sync complete');
                    break;
            }
        };

        navigator.serviceWorker?.addEventListener('message', handleSWMessage);

        return () => {
            navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
        };
    }, []);

    return null;
}
