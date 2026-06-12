const CACHE_VERSION = "cyberslash-stage7-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const APP_SHELL = [
  "/offline.html",
  "/ui-refactor.css",
  "/auth.css",
  "/style.css",
  "/index.css",
  "/directs.css",
  "/app-enhancements.js",
  "/favicon.ico",
  "/title.png",
  "/app.webmanifest"
];

const PRIVATE_PATH_PREFIXES = [
  "/api/",
  "/storage/",
  "/uploads/",
  "/pfps/",
  "/banners/",
  "/backgrounds/",
  "/cyberbites/"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("cyberslash-") && key !== STATIC_CACHE)
        .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (PRIVATE_PATH_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  if (/\.(?:css|js|ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        }).catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
