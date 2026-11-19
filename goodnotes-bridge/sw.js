/* Service Worker: Offline-Hülle + Empfang geteilter Dateien (Android/Chromium). */
const HUELLE = 'ib-huelle-v1';
const DATEIEN = ['./', 'index.html', 'app.css', 'app.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(HUELLE).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ib-huelle') && k !== HUELLE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(url.origin !== location.origin) return;

  if(e.request.method === 'POST' && url.pathname.endsWith('/teilen')){
    e.respondWith((async () => {
      const form = await e.request.formData();
      const c = await caches.open('ib-geteilt');
      let i = 0;
      for(const f of form.getAll('dateien')){
        if(!(f instanceof File)) continue;
        await c.put(`geteilt/${Date.now()}-${i++}?n=${encodeURIComponent(f.name)}`,
          new Response(f, { headers: { 'Content-Type': f.type } }));
      }
      return Response.redirect('./?geteilt=1', 303);
    })());
    return;
  }

  if(e.request.method !== 'GET' || url.pathname.includes('/api/')) return;
  // Netz zuerst, Hülle als Rückfall
  e.respondWith(fetch(e.request).then(r => {
    if(r.ok){ const kopie = r.clone(); caches.open(HUELLE).then(c => c.put(e.request, kopie)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
