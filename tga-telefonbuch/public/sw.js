/*
 * Offline-Cache für das TGA Telefonbuch.
 *
 * Die Kontaktdaten selbst liegen im LocalStorage. Dieser Service Worker sorgt
 * dafür, dass auch die Anwendung selbst (HTML, JS, CSS) ohne Netz startet –
 * alles, was einmal geladen oder vorgeladen wurde, bleibt verfügbar.
 */

const CACHE = "tga-telefonbuch-v1";
const SHELL = ["/", "/kontakte", "/firmen", "/projekte", "/admin", "/mehr", "/download"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Einzeln ablegen: eine fehlende Seite darf die Installation nicht kippen.
      .then((cache) =>
        Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build-Dateien sind unveränderlich – zuerst aus dem Cache bedienen.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Seiten und Datenanfragen: erst Netz, dann Cache.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
