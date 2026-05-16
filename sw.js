// Service Worker - Mis Finanzas PWA
const CACHE_NAME = 'mis-finanzas-v10';
const SHARED_CACHE = 'mf-shared-data';
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

// Permitir que el cliente fuerce skipWaiting via postMessage (auto-reload flow)
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
  var url = new URL(e.request.url);

  // === Share Target API: capturar POST de "Compartir" de otras apps ===
  // El manifest declara action: "./share-target/" method: POST. Acá lo
  // interceptamos, guardamos la data en un cache temporal y redirigimos
  // al index con ?share=1 para que el cliente la lea y la procese.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target/')) {
    e.respondWith((async () => {
      try {
        const formData = await e.request.formData();
        const text = formData.get('text') || formData.get('title') || formData.get('url') || '';
        const files = formData.getAll('files');
        const file = files.find(function(f) { return f && f.size > 0; });
        const cache = await caches.open(SHARED_CACHE);
        // Limpiar cualquier share anterior
        await cache.delete('/shared/file');
        await cache.delete('/shared/text');
        if (file) {
          await cache.put('/shared/file', new Response(file, {
            headers: { 'Content-Type': file.type || 'image/jpeg' }
          }));
        }
        if (text) {
          await cache.put('/shared/text', new Response(String(text)));
        }
      } catch (err) { console.warn('share-target err:', err); }
      // Redirect a la raíz del scope con ?share=1
      var scope = self.registration.scope;
      return Response.redirect(scope + '?share=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  var urlStr = e.request.url;

  // For Supabase/API/DolarAPI calls: always network (no cache, no fallback)
  if (urlStr.includes('api.') || urlStr.includes('dolarapi.com')) return;
  // Para Supabase: el endpoint REST nunca se cachea, pero las imágenes de Storage sí (cache-first)
  if (urlStr.includes('supabase.co/rest/') || urlStr.includes('supabase.co/auth/')) return;

  // Tesseract.js assets (CDN + traineddata): cache-first, son grandes y rara vez cambian
  if (urlStr.includes('cdn.jsdelivr.net/npm/tesseract.js') ||
      urlStr.includes('cdn.jsdelivr.net/npm/tesseract.js-core') ||
      urlStr.includes('tessdata.projectnaptha.com') ||
      urlStr.includes('supabase.co/storage/')) {
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
