/**
 * Background Sync & Fetch Utilities
 * Client-side API for registering periodic sync and triggering background fetch
 * 
 * Why: These APIs need to be registered from the main thread,
 * not the service worker. This provides a clean interface.
 */

import { logger } from '@/lib/logger';

// =============================================================================
// PERIODIC BACKGROUND SYNC
// =============================================================================

/**
 * Check if Periodic Background Sync is supported
 */
export function isPeriodicSyncSupported(): boolean {
    return 'periodicSync' in ServiceWorkerRegistration.prototype;
}

/**
 * Request permission and register periodic sync
 * @param minInterval - Minimum interval between syncs in milliseconds (default: 12 hours)
 */
export async function registerPeriodicSync(
    minInterval: number = 12 * 60 * 60 * 1000
): Promise<boolean> {
    if (!isPeriodicSyncSupported()) {
        logger.info('Periodic background sync not supported in this browser');
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        // Check permission status
        const status = await (navigator.permissions?.query?.({
            name: 'periodic-background-sync' as PermissionName,
        }));

        if (status?.state === 'denied') {
            logger.info('Periodic sync permission denied — this is normal in most browsers');
            return false;
        }

        // Register periodic sync
        await (registration as ServiceWorkerRegistration & {
            periodicSync: {
                register: (tag: string, options: { minInterval: number }) => Promise<void>;
            };
        }).periodicSync.register('overseek-data-refresh', {
            minInterval,
        });

        logger.info({ minInterval }, 'Periodic sync registered');
        return true;
    } catch (error) {
        logger.error({ err: error }, 'Periodic sync registration failed');
        return false;
    }
}

/**
 * Unregister periodic sync
 */
export async function unregisterPeriodicSync(): Promise<void> {
    if (!isPeriodicSyncSupported()) return;

    try {
        const registration = await navigator.serviceWorker.ready;
        await (registration as ServiceWorkerRegistration & {
            periodicSync: {
                unregister: (tag: string) => Promise<void>;
            };
        }).periodicSync.unregister('overseek-data-refresh');
        logger.info('Periodic sync unregistered');
    } catch {
        // Not registered, ignore
    }
}

// =============================================================================
// BACKGROUND FETCH
// =============================================================================

/**
 * Check if Background Fetch is supported
 */
export function isBackgroundFetchSupported(): boolean {
    return 'BackgroundFetchManager' in self;
}

export interface BackgroundFetchOptions {
    /** Unique ID for this download */
    id: string;
    /** URLs to download */
    urls: string[];
    /** Title shown in download notification */
    title: string;
    /** Icons for the notification */
    icons?: Array<{ src: string; sizes: string; type?: string }>;
    /** Total expected download size in bytes */
    downloadTotal?: number;
}

/**
 * Start a background fetch (download that continues when tab is closed)
 */
export async function startBackgroundFetch(
    options: BackgroundFetchOptions
): Promise<BackgroundFetchRegistration | null> {
    if (!isBackgroundFetchSupported()) {
        logger.info('Background fetch not supported in this browser');
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        const bgFetch = await (registration as ServiceWorkerRegistration & {
            backgroundFetch: {
                fetch: (
                    id: string,
                    requests: string[],
                    options: {
                        title: string;
                        icons?: Array<{ src: string; sizes: string; type?: string }>;
                        downloadTotal?: number;
                    }
                ) => Promise<BackgroundFetchRegistration>;
            };
        }).backgroundFetch.fetch(options.id, options.urls, {
            title: options.title,
            icons: options.icons || [
                { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            ],
            downloadTotal: options.downloadTotal,
        });

        logger.info({ id: options.id }, 'Background fetch started');
        return bgFetch;
    } catch (error) {
        logger.error({ err: error }, 'Failed to start background fetch');
        return null;
    }
}

/**
 * Get active background fetch by ID
 */
export async function getBackgroundFetch(
    id: string
): Promise<BackgroundFetchRegistration | null> {
    if (!isBackgroundFetchSupported()) return null;

    try {
        const registration = await navigator.serviceWorker.ready;
        return await (registration as ServiceWorkerRegistration & {
            backgroundFetch: {
                get: (id: string) => Promise<BackgroundFetchRegistration | undefined>;
            };
        }).backgroundFetch.get(id) || null;
    } catch {
        return null;
    }
}

/**
 * Get all active background fetches
 */
export async function getActiveBackgroundFetches(): Promise<string[]> {
    if (!isBackgroundFetchSupported()) return [];

    try {
        const registration = await navigator.serviceWorker.ready;
        return await (registration as ServiceWorkerRegistration & {
            backgroundFetch: {
                getIds: () => Promise<string[]>;
            };
        }).backgroundFetch.getIds();
    } catch {
        return [];
    }
}

// Type definitions for Background Fetch API
interface BackgroundFetchRegistration {
    id: string;
    uploadTotal: number;
    uploaded: number;
    downloadTotal: number;
    downloaded: number;
    result: 'success' | 'failure' | '';
    failureReason: string;
    recordsAvailable: boolean;
    abort: () => Promise<boolean>;
    matchAll: () => Promise<BackgroundFetchRecord[]>;
}

interface BackgroundFetchRecord {
    request: Request;
    responseReady: Promise<Response>;
}
