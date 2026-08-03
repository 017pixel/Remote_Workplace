/* global self, caches */

const BASE = "/workbench";
const CACHE = "workbench-v18";
const SHELL = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/manifest.webmanifest?v=3",
  BASE + "/favicon.svg?v=3",
  BASE + "/icons/favicon-32.png?v=3",
  BASE + "/icons/icon-192.png?v=3",
  BASE + "/icons/icon-512.png?v=3",
  BASE + "/icons/icon-maskable-512.png?v=3",
  BASE + "/icons/apple-touch-icon.png?v=3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL)),
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
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () =>
          caches.match(BASE + "/index.html").then((r) => r || caches.match(BASE + "/")),
      ),
    );
    return;
  }

  // Ausschließlich Vite-Assets mit Inhalts-Hash werden zur Laufzeit gecacht.
  // API, T3, Editor, DevTools und sonstige dynamische Same-Origin-Antworten
  // gehen immer direkt ins Netz und können keine nutzerspezifischen Daten leaken.
  if (!url.pathname.startsWith(BASE + "/assets/")) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const cacheControl = res.headers.get("cache-control") || "";
          const contentType = res.headers.get("content-type") || "";
          // Ein SPA-Fallback darf niemals als JavaScript- oder CSS-Asset im
          // Cache landen. Der neue Server liefert dafür 404, alte Worker
          // können aber noch eine HTML-Antwort sehen.
          if (res && res.ok && res.type === "basic" && !/\bno-store\b/i.test(cacheControl) && !/^text\/html\b/i.test(contentType)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "Remote Workplace", body: "Neue Benachrichtigung", link: BASE + "/inbox" };
  try { payload = { ...payload, ...event.data.json() }; } catch { /* Standardtext verwenden. */ }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: BASE + "/icons/icon-192.png?v=3",
    badge: BASE + "/icons/favicon-32.png?v=3",
    tag: payload.id || "workbench-notification",
    data: { link: payload.link || BASE + "/inbox" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = event.notification.data?.link || BASE + "/inbox";
  const url = new URL(requested, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  }));
});
