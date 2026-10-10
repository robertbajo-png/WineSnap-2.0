/* WineSnap service worker — offline shell + asset caching */
const VERSION = "2026-10-10-release-hardening";
const ASSET_CACHE = `winesnap-assets-${VERSION}`;
const PAGE_CACHE = `winesnap-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.addAll([OFFLINE_URL])));
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
      ),
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API traffic or server functions.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return;

  // Never persist account pages or old HTML that references deleted asset hashes.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  // Static assets: cache first, refresh in background.
  if (/\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)) {
    const network = fetch(req).then(async (res) => {
      if (res.ok && res.type === "basic")
        await (await caches.open(ASSET_CACHE)).put(req, res.clone());
      return res;
    });
    event.waitUntil(network.catch(() => undefined));
    event.respondWith(caches.match(req).then((cached) => cached || network));
  }
});
