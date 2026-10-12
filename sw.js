/* Offline-Zwischenspeicher: sofort aus dem Cache laden, im Hintergrund aktualisieren. */
const CACHE = "zeiterfassung-v3";
const DATEIEN = ["./", "index.html", "logik.js", "pdf.js","manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  if (ev.request.method !== "GET" || new URL(ev.request.url).origin !== location.origin) return;
  ev.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(ev.request, { ignoreSearch: true }).then((treffer) => {
        const netz = fetch(ev.request)
          .then((antwort) => { if (antwort.ok) cache.put(ev.request, antwort.clone()); return antwort; })
          .catch(() => treffer);
        return treffer || netz;
      })
    )
  );
});
