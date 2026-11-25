/* Offline-Hülle: Oberfläche aus dem Cache, Daten immer frisch vom Netz. */
const CACHE = 'puls-v6';
const HUELLE = ['/', '/index.html', '/app.css', '/app.js', '/diagramme.js', '/kern/rechnen.mjs', '/kern/analyse.mjs', '/kern/erkenntnis.mjs', '/kern/ki.mjs', '/kern/mahlzeiten.mjs', '/import-worker.js', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(HUELLE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp')) return;
  e.respondWith(fetch(e.request).then(r => { const k = r.clone(); caches.open(CACHE).then(c => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
