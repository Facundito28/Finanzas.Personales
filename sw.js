// Service Worker - Mis Finanzas PWA
const CACHE_NAME = 'mis-finanzas-v8';
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

// Web Push: notif que llega aunque la app esté cerrada
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) { data = { title: e.data && e.data.text() }; }
  var title = data.title || '¿Cargaste lo de hoy? 💰';
  var body = data.body || 'Apuntá tus gastos antes de que se te olviden.';
  var url = data.url || '/';
  e.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: 'icon-192x192.png',
    badge: 'icon-192x192.png',
    tag: 'mf-daily-reminder',
    renotify: false,
    data: { url: url },
    requireInteraction: false
  }));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(target) >= 0 && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
