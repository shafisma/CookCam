/**
 * CookCam Service Worker — PWA offline support & asset caching
 */
const CACHE_NAME = 'cookcam-v2';
const ASSETS = [
    '/',
    '/static/css/styles.css',
    '/static/js/app.js',
    '/static/js/state.js',
    '/static/js/ui.js',
    '/static/js/audio.js',
    '/static/js/video.js',
    '/static/js/timers.js',
    '/static/js/recipes.js',
    '/static/js/preferences.js',
    '/static/audio-processor.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Skip API and WebSocket requests
    if (event.request.url.includes('/api/') ||
        event.request.url.includes('/ws') ||
        event.request.url.includes('/health')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
