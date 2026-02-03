---
name: pwa-expertise
description: Master Progressive Web App development with service workers, offline-first strategies, caching patterns, and installability. Use when building PWAs, implementing offline functionality, or optimizing web app performance.
---

# PWA Expertise

Expert guide for building production-grade Progressive Web Apps. Covers service workers, caching strategies, offline functionality, and native-like experiences.

## When to Use This Skill

- Building installable web applications
- Implementing offline-first functionality
- Optimizing cache strategies for performance
- Setting up push notifications
- Creating native-like mobile web experiences
- Debugging service worker issues

## Core Concepts

### Service Worker Lifecycle

```typescript
// public/sw.ts
/// <reference lib="webworker" />

const CACHE_NAME = 'app-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192.png',
];

/**
 * Install: Pre-cache static assets.
 * Why: Ensures critical resources are available immediately after install.
 */
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Skip waiting to activate immediately
  (self as ServiceWorkerGlobalScope).skipWaiting();
});

/**
 * Activate: Clean up old caches.
 * Why: Prevents stale data from accumulating across updates.
 */
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Claim all clients immediately
  (self as ServiceWorkerGlobalScope).clients.claim();
});
```

---

## Caching Strategies

### 1. Cache-First (Offline Priority)

Best for: Static assets, fonts, images that rarely change.

```typescript
self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
  }
});
```

### 2. Network-First (Freshness Priority)

Best for: API calls, dynamic content, user data.

```typescript
async function networkFirst(request: Request): Promise<Response> {
  try {
    const networkResponse = await fetch(request);
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Fallback to cache if offline
    const cached = await caches.match(request);
    if (cached) return cached;
    
    // Return offline fallback for navigation
    if (request.mode === 'navigate') {
      return caches.match('/offline') as Promise<Response>;
    }
    throw error;
  }
}
```

### 3. Stale-While-Revalidate

Best for: Content that benefits from fast loads but needs updates.

```typescript
async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  // Revalidate in background
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });
  
  // Return cached immediately, or wait for network
  return cached || fetchPromise;
}
```

---

## Workbox Integration

Simplified service worker with Workbox:

```typescript
// sw.ts with Workbox
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache build assets (injected by build tool)
precacheAndRoute(self.__WB_MANIFEST);

// Cache images with Cache-First
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// API calls with Network-First
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
  })
);

// Static assets with Stale-While-Revalidate
registerRoute(
  ({ request }) => 
    request.destination === 'script' || 
    request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
  })
);
```

---

## Web App Manifest

```json
{
  "name": "SocialiseIT - Social Media Manager",
  "short_name": "SocialiseIT",
  "description": "Professional social media management platform",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#8b5cf6",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/dashboard.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    },
    {
      "src": "/screenshots/mobile.png",
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow"
    }
  ],
  "shortcuts": [
    {
      "name": "Compose Post",
      "url": "/compose",
      "icons": [{ "src": "/icons/compose.png", "sizes": "96x96" }]
    },
    {
      "name": "Calendar",
      "url": "/calendar",
      "icons": [{ "src": "/icons/calendar.png", "sizes": "96x96" }]
    }
  ]
}
```

---

## Service Worker Registration

```typescript
// lib/pwa/register-sw.ts

/**
 * Registers service worker with update detection.
 * Why: Enables offline functionality and prompts users about updates.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    // Check for updates periodically
    setInterval(() => {
      registration.update();
    }, 60 * 60 * 1000); // Every hour

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available
          dispatchEvent(new CustomEvent('sw-update-available'));
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('SW registration failed:', error);
    return null;
  }
}
```

---

## Background Sync

Retry failed requests when back online:

```typescript
// In service worker
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPendingPosts());
  }
});

async function syncPendingPosts(): Promise<void> {
  const db = await openIndexedDB('pending-posts');
  const posts = await db.getAll('posts');
  
  for (const post of posts) {
    try {
      await fetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify(post.data),
        headers: { 'Content-Type': 'application/json' },
      });
      await db.delete('posts', post.id);
    } catch (error) {
      // Will retry on next sync
      console.error('Sync failed for post:', post.id);
    }
  }
}

// Register sync from main app
async function queuePostForSync(postData: PostData): Promise<void> {
  const db = await openIndexedDB('pending-posts');
  await db.add('posts', { data: postData, timestamp: Date.now() });
  
  const registration = await navigator.serviceWorker.ready;
  await registration.sync.register('sync-posts');
}
```

---

## Push Notifications

```typescript
// lib/pwa/push.ts

/**
 * Requests push notification permission and subscribes.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });

  // Send subscription to server
  await fetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
    headers: { 'Content-Type': 'application/json' },
  });

  return subscription;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
```

```typescript
// In service worker: Handle push events
self.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() ?? {};
  
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Notification', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: data.url },
      actions: data.actions ?? [],
    })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      // Focus existing window or open new
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
```

---

## Install Prompt

```typescript
// hooks/use-install-prompt.ts
import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    setDeferredPrompt(null);
    setIsInstallable(false);
    
    return outcome === 'accepted';
  };

  return { isInstallable, promptInstall };
}
```

---

## Next.js PWA Setup

```typescript
// next.config.ts
import withPWA from 'next-pwa';

const config = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
      },
    },
  ],
})({
  // Your Next.js config
});

export default config;
```

---

## Debugging Tips

1. **Chrome DevTools** → Application → Service Workers
2. **Update on reload** checkbox for development
3. **Cache Storage** section shows cached assets
4. **Manifest** section validates installability
5. Use `chrome://serviceworker-internals` for low-level debugging

## Best Practices

1. **Version your caches** - Include version in cache name for easy updates
2. **Limit cache size** - Use expiration plugins to prevent storage bloat
3. **Graceful degradation** - App should work without service worker
4. **Test offline** - Use DevTools Network throttling
5. **Monitor cache hit rates** - Track performance in production
