/**
 * PWA Initializer Component
 * Registers advanced PWA features on app load:
 * - Periodic Background Sync
 * - SW message handlers (SYNC_REQUESTED triggers syncAll)
 * - Offline recovery on reconnect
 * 
 * Why: These features need to be registered from the main thread on app load.
 */

'use client';

import { useEffect } from 'react';
import { registerPeriodicSync, isPeriodicSyncSupported } from '@/lib/background-sync';
import { syncAll } from '@/lib/sync-manager';
import { useOrganization } from '@/hooks/use-organization';
import { useOnlineStatus } from '@/lib/compose-offline';
import { useOfflineRecovery } from '@/lib/offline-recovery';
import { logger } from '@/lib/logger';

/**
 * Initialize PWA features on mount.
 * Why: Centralizes all SW ↔ main-thread coordination in one component.
 */
export function PWAInitializer() {
    const { organization } = useOrganization();
    const isOnline = useOnlineStatus();

    // Why: Auto-recovers offline-queued posts when connectivity returns
    useOfflineRecovery({
        organizationId: organization?.id,
        isOnline,
    });

    useEffect(() => {
        // Register periodic background sync (12-hour interval)
        if (isPeriodicSyncSupported()) {
            registerPeriodicSync(12 * 60 * 60 * 1000).catch(() => {
                logger.warn('Periodic sync registration failed — non-critical');
            });
        }

        // Listen for SW messages
        const handleSWMessage = (event: MessageEvent) => {
            switch (event.data?.type) {
                case 'SYNC_REQUESTED':
                    // Why: SW fires this when background sync triggers — we run syncAll client-side
                    if (organization?.id) {
                        syncAll(organization.id).catch((err) => {
                            logger.error({ err }, 'Sync triggered by SW message failed');
                        });
                    }
                    break;
                case 'BACKGROUND_FETCH_SUCCESS':
                    logger.info({ id: event.data.id }, 'Background fetch complete');
                    break;
                case 'BACKGROUND_FETCH_FAILED':
                    logger.warn({ id: event.data.id }, 'Background fetch failed');
                    break;
                case 'PERIODIC_SYNC_COMPLETE':
                    logger.info('Periodic sync complete');
                    break;
            }
        };

        navigator.serviceWorker?.addEventListener('message', handleSWMessage);

        return () => {
            navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
        };
    }, [organization?.id]);

    return null;
}
