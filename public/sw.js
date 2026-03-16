/**
 * Service Worker for PWA
 * Handles caching, offline support, and background sync
 */

const CACHE_NAME = 'magpipe-v3';
// Never cache index.html here — Vercel sends no-cache for it and the SW
// must not override that, otherwise stale asset hashes cause chunk-load failures.
const STATIC_ASSETS = [
  '/manifest.json',
  '/styles/main.css',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );

  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Claim all clients
  return self.clients.claim();
});

// Fetch event
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Supabase API requests (always fetch from network)
  if (event.request.url.includes('supabase.co') || event.request.url.includes('api.magpipe.ai')) {
    return;
  }

  // Navigation requests (HTML pages): always network-first, never serve stale index.html.
  // This is critical — serving a cached index.html with old asset hashes causes chunk-load
  // failures on every deploy.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Only fall back to cached index.html when completely offline
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Content-hashed assets (/assets/...): cache-first, they're immutable.
  if (event.request.url.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first, cache as fallback.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Background sync:', event.tag);

  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // TODO: Implement message sync
  // This would send any queued messages when back online
  console.log('Syncing messages...');
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Maggie Notification';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  const urlPath = event.notification.data?.url || '/inbox';
  const fullUrl = new URL(urlPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open for our app
      for (const client of clientList) {
        // Check if it's our app (same origin)
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          // Navigate to the target URL and focus
          return client.navigate(fullUrl).then(() => client.focus());
        }
      }
      // No existing window, open a new one
      return clients.openWindow(fullUrl);
    })
  );
});