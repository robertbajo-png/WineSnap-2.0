/* WineSnap service worker — offline shell + asset caching */
const VERSION = "v2";
const ASSET_CACHE = `winesnap-assets-${VERSION}`;
const PAGE_CACHE = `winesnap-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.addAll([OFFLINE_URL])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("winesnap-") && k !== ASSET_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.cache === "no-store") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API traffic or server functions.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return;

  // Never persist authenticated HTML or revive a previous user's page offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Static assets: cache first, refresh in background.
  if (
    url.pathname.startsWith("/assets/") &&
    /\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (!res.ok || res.headers.get("Cache-Control")?.match(/no-store|private/i)) return res;
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
