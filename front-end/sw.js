const CACHE_NAME = 'academic-notebook-v3';

// We explicitly cache ONLY the main shell files.
// Additional files requested during runtime will be added dynamically.
const PRECACHE_URLS = [
    '/',
    '/app',
    '/login',
    '/library',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    '/assets/icon.svg',
    '/assets/icon-192.png',
    '/assets/icon-512.png',
    'https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Kalam:wght@300;400;700&display=swap'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    // Delete old caches if we bump CACHE_NAME version
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Stale-While-Revalidate Strategy
self.addEventListener('fetch', event => {
    // Skip cross-origin requests unless they are fonts/cdns explicitly
    if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('fonts.googleapis') && !event.request.url.includes('cdnjs')) {
        return;
    }
    
    // Do not intercept API calls (which handle their own offline resilience via IndexedDB fallback)
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(response => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    // Cache the new response if valid
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(err => {
                    // Ignore network errors (we use the cache)
                    console.log('Serving from cache exclusively due to offline status:', event.request.url);
                });

                // Return the cached response immediately, or wait for network if not in cache
                return response || fetchPromise;
            });
        })
    );
});
