// Service Worker - Mis Finanzas PWA
const CACHE_NAME = 'mis-finanzas-v7';
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

  // For Supabase/API/DolarAPI calls: always network (no cache, no fallback)
  if (url.includes('api.') || url.includes('dolarapi.com')) return;
  // Para Supabase: el endpoint REST nunca se cachea, pero las imágenes de Storage sí (cache-first)
  if (url.includes('supabase.co/rest/') || url.includes('supabase.co/auth/')) return;

  // Tesseract.js assets (CDN + traineddata): cache-first, son grandes y rara vez cambian
  if (url.includes('cdn.jsdelivr.net/npm/tesseract.js') ||
      url.includes('cdn.jsdelivr.net/npm/tesseract.js-core') ||
      url.includes('tessdata.projectnaptha.com') ||
      url.includes('supabase.co/storage/')) {
    e.respondWith(
      caches.match(e.request).then(function(hit){
        if(hit)return hit;
        return fetch(e.request).then(function(response){
          if(response&&response.status===200){
            var clone=response.clone();
            caches.open(CACHE_NAME).then(function(cache){cache.put(e.request,clone)});
          }
          return response;
        });
      })
    );
    return;
  }

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
