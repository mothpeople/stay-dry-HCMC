// BUMPED TO v14 TO FORCE UPDATE AND FIX PREVIEWS
const CACHE_NAME = 'stay-dry-hcmc-v14';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  // We can optionally cache the script, but usually the index.html cache is sufficient
  // as long as the version query param (?v=...) changes in the HTML.
];

self.addEventListener('install', event => {
  // Force this new worker to become active immediately, skipping the wait
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches that don't match the current version
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Tell the active service worker to take control of the page immediately
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached file if found, otherwise fetch from network
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
