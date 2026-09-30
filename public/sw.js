const CACHE = 'manger-offline-v5';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/offline-recipes.js'])).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('manger-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && url.origin === self.location.origin && url.pathname === '/offline-recipes.js') {
    event.respondWith(caches.match('/offline-recipes.js').then(cached => cached || fetch(event.request))); return;
  }
  // No API responses, backups or writes enter this cache; selected photo thumbnails live with local recipe copies.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin || !['/', '/offline.html'].includes(url.pathname)) return;
  event.respondWith(fetch(event.request, { signal: AbortSignal.timeout(5000) }).catch(() => caches.match('/offline.html')));
});
