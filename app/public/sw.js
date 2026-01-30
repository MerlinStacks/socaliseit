/**
 * SocialiseIT Service Worker
 * Handles caching, offline support, and push notifications
 */

const CACHE_NAME = 'socialiseit-v1';
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
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Precaching assets');
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    // Activate immediately without waiting
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // Take control of all pages immediately
    self.clients.claim();
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip chrome-extension and other non-http(s) requests
    if (!event.request.url.startsWith('http')) return;

    // Skip API requests (they should always be fresh)
    if (event.request.url.includes('/api/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone response before caching
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(async () => {
                // Try to return cached response
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }

                // For navigation requests, show offline page
                if (event.request.mode === 'navigate') {
                    const offlinePage = await caches.match(OFFLINE_URL);
                    if (offlinePage) return offlinePage;
                }

                // Return basic offline response
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable',
                });
            })
    );
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');

    let data = {
        title: 'SocialiseIT',
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
        requireInteraction: false,
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
});
