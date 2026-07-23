/* global self, caches */

const BASE = "/workbench";
const CACHE = "workbench-v14";
const SHELL = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/manifest.webmanifest?v=2",
  BASE + "/favicon.svg?v=2",
  BASE + "/icons/icon-192.png?v=2",
  BASE + "/icons/icon-512.png?v=2",
  BASE + "/icons/apple-touch-icon.png?v=2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
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
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith(BASE + "/api/") ||
    url.pathname === BASE + "/sw.js" ||
    url.pathname === BASE + "/manifest.webmanifest"
  ) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () =>
          caches.match(BASE + "/index.html").then((r) => r || caches.match(BASE + "/")),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    }),
  );
});
