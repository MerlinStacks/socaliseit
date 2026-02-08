/**
 * SocialiseIT Service Worker
 * Handles caching, offline support, and push notifications
 * 
 * Update Strategy:
 * - Cache version is auto-updated via build timestamp
 * - Old caches are purged on activation
 * - Clients are notified of updates via postMessage
 * - No reinstallation required - just refresh
 */

// Dynamic cache version - update this or use build hash
const CACHE_VERSION = 'v2';
const CACHE_NAME = `overseek-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Assets to precache on install
const PRECACHE_ASSETS = [
    '/',
    '/manifest.json',
    '/offline.html',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// Install event - precache critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);
                // Use addAll with ignoreSearch to avoid query string issues
                await cache.addAll(PRECACHE_ASSETS);

                // Request persistent storage to prevent cache eviction
                if (navigator.storage && navigator.storage.persist) {
                    const isPersisted = await navigator.storage.persisted();
                    if (!isPersisted) {
                        await navigator.storage.persist();
                    }
                }
                console.info('[SW] Install complete, version:', CACHE_VERSION);
            } catch (error) {
                console.error('[SW] Install failed:', error);
                throw error; // Re-throw to fail the install
            }
        })()
    );
    // Activate immediately - don't wait for old SW to die
    self.skipWaiting();
});

/**
 * Check if a response can be safely cached
 * Why: Opaque responses (cross-origin no-cors) can bloat cache
 * and may contain error responses that look successful
 */
function isCacheableResponse(response) {
    // Only cache successful responses
    if (!response.ok && response.status !== 0) {
        return false;
    }

    // For opaque responses (status 0), only cache if same origin
    if (response.status === 0 && response.type === 'opaque') {
        return false; // Skip opaque cross-origin responses
    }

    return true;
}

// Activate event - clean up old caches and notify clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Clean up all old caches
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('overseek-') && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );

            // Take control of all clients immediately
            await self.clients.claim();

            // Notify all clients that an update happened
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach((client) => {
                client.postMessage({
                    type: 'SW_UPDATED',
                    version: CACHE_VERSION,
                });
            });
        })()
    );
});

// Fetch event - intelligent caching strategies
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip chrome-extension and other non-http(s) requests
    if (!event.request.url.startsWith('http')) return;

    // Skip API requests (they should always be fresh)
    if (event.request.url.includes('/api/')) return;

    const url = new URL(event.request.url);

    // Stale-while-revalidate for static assets (fast response + background update)
    const isStaticAsset =
        url.pathname.startsWith('/_next/static/') ||
        url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/);

    if (isStaticAsset) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }

    // Cache-first for immutable assets (icons, images in /public)
    const isImmutableAsset =
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/splash/') ||
        url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico)$/);

    if (isImmutableAsset) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // Network-first for everything else (pages, dynamic content)
    event.respondWith(networkFirst(event.request));
});

/**
 * Stale-while-revalidate strategy
 * Returns cached response immediately, then fetches fresh copy in background
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    // Fetch fresh copy in background
    const fetchPromise = fetch(request).then(async (networkResponse) => {
        if (isCacheableResponse(networkResponse)) {
            await cache.put(request, networkResponse.clone());
            await trimCache(cache, 100); // Limit cache size
        }
        return networkResponse;
    }).catch(() => {
        // Network failed, return cached if available
        return cachedResponse;
    });

    // Return cached immediately, or wait for network
    return cachedResponse || fetchPromise;
}

/**
 * Cache-first strategy
 * Returns cached response if available, otherwise fetches from network
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (isCacheableResponse(networkResponse)) {
            await cache.put(request, networkResponse.clone());
            await trimCache(cache, 100);
        }
        return networkResponse;
    } catch (e) {
        // Return offline fallback for navigation requests
        if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
        }
        throw e;
    }
}

/**
 * Network-first strategy
 * Tries network first, falls back to cache on failure
 */
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        const networkResponse = await fetch(request);
        if (isCacheableResponse(networkResponse)) {
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (e) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // For navigation requests, show offline page
        if (request.mode === 'navigate') {
            const offlinePage = await caches.match(OFFLINE_URL);
            if (offlinePage) return offlinePage;
        }

        return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
        });
    }
}

/**
 * Trim cache to prevent storage bloat
 * Removes oldest entries when cache exceeds limit
 */
async function trimCache(cache, maxItems) {
    const keys = await cache.keys();
    if (keys.length <= maxItems) return;

    // Delete oldest entries (first in list)
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
}

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');

    let data = {
        title: 'Overseek Socials',
        body: 'You have a new notification',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: 'default',
        data: { url: '/dashboard' },
    };

    // Parse push data if present
    if (event.data) {
        try {
            const pushData = event.data.json();
            data = { ...data, ...pushData };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icons/icon-192.png',
        badge: data.badge || '/icons/icon-72.png',
        tag: data.tag || 'default',
        data: data.data || { url: '/dashboard' },
        vibrate: [100, 50, 100],
        // Publish reminders stay visible until user acts on them
        requireInteraction: (data.tag || '').startsWith('publish-reminder-'),
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click - open or focus app
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/dashboard';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // Otherwise open new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Message event - handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    // Trigger sync from main thread
    if (event.data?.type === 'TRIGGER_SYNC') {
        event.waitUntil(doBackgroundSync());
    }
});

// Throttle: minimum 30 seconds between background syncs
let lastSyncTime = 0;
const SYNC_THROTTLE_MS = 30 * 1000;

// Background sync event - sync offline data when connection restored
self.addEventListener('sync', (event) => {
    console.debug('[SW] Sync event:', event.tag);

    if (event.tag === 'overseek-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

/**
 * Perform background sync.
 * Notifies all clients to trigger their sync managers.
 * Throttled to at most once per 30 seconds to prevent API spam.
 */
async function doBackgroundSync() {
    const now = Date.now();
    if (now - lastSyncTime < SYNC_THROTTLE_MS) {
        console.debug('[SW] Sync throttled, skipping (last sync', Math.round((now - lastSyncTime) / 1000), 's ago)');
        return;
    }
    lastSyncTime = now;

    console.debug('[SW] Starting background sync...');

    try {
        // Notify all clients to trigger their local sync
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => {
            client.postMessage({
                type: 'SYNC_REQUESTED',
                timestamp: now,
            });
        });

        console.debug('[SW] Sync notification sent to', clients.length, 'clients');
    } catch (error) {
        console.error('[SW] Background sync failed:', error);
    }
}

// =============================================================================
// BACKGROUND FETCH API
// Handles large downloads that continue even if user closes the tab
// =============================================================================

/**
 * Background Fetch success - download completed
 */
self.addEventListener('backgroundfetchsuccess', (event) => {
    console.log('[SW] Background fetch succeeded:', event.registration.id);

    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);
                const records = await event.registration.matchAll();

                // Cache all downloaded resources
                for (const record of records) {
                    const response = await record.responseReady;
                    if (isCacheableResponse(response)) {
                        await cache.put(record.request, response.clone());
                    }
                }

                // Notify clients of completion
                const clients = await self.clients.matchAll({ type: 'window' });
                clients.forEach((client) => {
                    client.postMessage({
                        type: 'BACKGROUND_FETCH_SUCCESS',
                        id: event.registration.id,
                        downloadedCount: records.length,
                    });
                });

                // Update UI (shows notification on mobile)
                await event.updateUI({
                    title: 'Download complete',
                    icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
                });
            } catch (error) {
                console.error('[SW] Background fetch success handling failed:', error);
            }
        })()
    );
});

/**
 * Background Fetch failure - download failed or was aborted
 */
self.addEventListener('backgroundfetchfail', (event) => {
    console.error('[SW] Background fetch failed:', event.registration.id);

    event.waitUntil(
        (async () => {
            // Notify clients of failure
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach((client) => {
                client.postMessage({
                    type: 'BACKGROUND_FETCH_FAILED',
                    id: event.registration.id,
                });
            });

            await event.updateUI({
                title: 'Download failed',
            });
        })()
    );
});

/**
 * Background Fetch click - user clicked on the download notification
 */
self.addEventListener('backgroundfetchclick', (event) => {
    console.log('[SW] Background fetch clicked:', event.registration.id);

    event.waitUntil(
        clients.openWindow('/media')
    );
});

// =============================================================================
// PERIODIC BACKGROUND SYNC
// Refreshes data periodically when the app is not open
// =============================================================================

/**
 * Periodic sync event - refresh data in background
 */
self.addEventListener('periodicsync', (event) => {
    console.debug('[SW] Periodic sync:', event.tag);

    if (event.tag === 'overseek-data-refresh') {
        event.waitUntil(doPeriodicDataRefresh());
    }
});

/**
 * Periodic data refresh - fetch and cache fresh data
 */
async function doPeriodicDataRefresh() {
    console.log('[SW] Starting periodic data refresh...');

    try {
        // Refresh key data endpoints
        const endpoints = [
            '/api/sidebar/badges',
            '/api/posts/upcoming',
        ];

        const cache = await caches.open(CACHE_NAME);

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, {
                    headers: { 'Cache-Control': 'no-cache' },
                });

                if (isCacheableResponse(response)) {
                    await cache.put(endpoint, response.clone());
                    console.log('[SW] Refreshed:', endpoint);
                }
            } catch {
                // Individual endpoint failure, continue with others
                console.warn('[SW] Failed to refresh:', endpoint);
            }
        }

        // Notify clients of fresh data
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => {
            client.postMessage({
                type: 'PERIODIC_SYNC_COMPLETE',
                timestamp: Date.now(),
            });
        });

        console.log('[SW] Periodic data refresh complete');
    } catch (error) {
        console.error('[SW] Periodic data refresh failed:', error);
    }
}
