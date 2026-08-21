/* global self, caches */

const BASE = "/wrapt";
const CACHE = "wrapt-v21";
const SHELL = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/manifest.webmanifest?v=8",
  BASE + "/favicon.svg?v=8",
  BASE + "/icons/favicon-32.png?v=8",
  BASE + "/icons/icon-192.png?v=8",
  BASE + "/icons/icon-512.png?v=8",
  BASE + "/icons/icon-maskable-512.png?v=8",
  BASE + "/icons/apple-touch-icon.png?v=8",
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

function safeNotificationLink(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return BASE + "/inbox";
  if ([...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return BASE + "/inbox";
  try {
    const url = new URL(value, self.location.origin);
    const allowed = url.origin === self.location.origin
      && (url.pathname === BASE || url.pathname.startsWith(BASE + "/") || url.pathname === "/t3" || url.pathname.startsWith("/t3/"));
    return allowed ? `${url.pathname}${url.search}${url.hash}` : BASE + "/inbox";
  } catch {
    return BASE + "/inbox";
  }
}

function pushPayload(event) {
  const fallback = {
    id: null,
    title: "Wrapt",
    body: "Neue Benachrichtigung",
    link: BASE + "/inbox",
    severity: "info",
  };
  try {
    const value = event.data?.json();
    if (!value || value.version !== 1 || typeof value.id !== "string" || typeof value.title !== "string"
      || !value.title.trim() || typeof value.body !== "string") return fallback;
    return {
      id: value.id,
      title: value.title.slice(0, 200),
      body: value.body.slice(0, 1_000),
      link: safeNotificationLink(value.link),
      severity: value.severity === "error" || value.severity === "warning" || value.severity === "success" ? value.severity : "info",
    };
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  const payload = pushPayload(event);
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: BASE + "/icons/icon-192.png?v=8",
    badge: BASE + "/icons/favicon-32.png?v=8",
    tag: payload.id || `wrapt-notification-${Date.now()}`,
    silent: false,
    requireInteraction: payload.severity === "error",
    data: { link: payload.link, notificationId: payload.id },
  }));
});

async function markNotificationRead(notificationId) {
  if (typeof notificationId !== "string" || !/^[0-9a-f-]{36}$/i.test(notificationId)) return;
  try {
    await fetch(`/api/v1/notifications/${encodeURIComponent(notificationId)}`, {
      method: "PATCH",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ read: true }),
    });
  } catch {
    // Der Deep Link bleibt nutzbar; die geöffnete Inbox synchronisiert später erneut.
  }
}

async function openNotificationLink(requested) {
  const link = safeNotificationLink(requested);
  const target = new URL(link, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // Bevorzugt das zuletzt sichtbare Workbench-Fenster; ein Hintergrund-Tab
  // soll nicht einfach überschrieben werden, solange ein sichtbares existiert.
  const existing = windows
    .filter((client) => {
      try {
        const clientUrl = new URL(client.url);
        return clientUrl.origin === self.location.origin && (clientUrl.pathname === BASE || clientUrl.pathname.startsWith(BASE + "/"));
      } catch { return false; }
    })
    .sort((a, b) => Number(b.visibilityState === "visible") - Number(a.visibilityState === "visible"))[0];
  if (existing) {
    try {
      await existing.navigate(target);
      return existing.focus();
    } catch {
      return self.clients.openWindow(target);
    }
  }
  return self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link;
  const notificationId = event.notification.data?.notificationId;
  event.waitUntil(Promise.allSettled([
    markNotificationRead(notificationId),
    openNotificationLink(link),
  ]));
});
