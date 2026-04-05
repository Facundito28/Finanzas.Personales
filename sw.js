// Service Worker - Mis Finanzas PWA
const CACHE_NAME = 'mis-finanzas-v5';
const PRECACHE = [
  './',
  './index.html'
];

// Install: cache shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first strategy (always fresh data from Supabase)
self.addEventListener('fetch', function(e) {
  // Skip non-GET and Supabase API calls
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  
  // For Supabase/API/DolarAPI calls: always network
  if (url.includes('supabase') || url.includes('api.') || url.includes('dolarapi.com')) return;
  
  // For app shell: network first, fallback to cache
  e.respondWith(
    fetch(e.request).then(function(response) {
      // Cache the fresh response
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(e.request, clone);
      });
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
