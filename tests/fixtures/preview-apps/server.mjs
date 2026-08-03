#!/usr/bin/env node
// Deterministisches Preview-Harness für automatisierte Tests.
//
// Alle Apps binden ausschließlich Loopback, verwenden reservierte Testports aus
// `ports.json`, führen keinen fremden Projektcode aus und hinterlassen weder
// Prozesse noch Dateien. Start und Stopp übernimmt Playwright über `webServer`
// beziehungsweise `startPreviewFixtures()`.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const here = dirname(fileURLToPath(import.meta.url));
export const fixturePorts = JSON.parse(readFileSync(join(here, "ports.json"), "utf8"));

const html = (title, body) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

function send(response, status, type, body, headers = {}) {
  response.writeHead(status, { "content-type": type, ...headers });
  response.end(body);
}

/** SPA mit HMR-Socket. */
function spaApp() {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/assets/")) return send(response, 200, "application/javascript; charset=utf-8", "export const app = 'ok';");
    send(response, 200, "text/html; charset=utf-8", html("SPA", "<div id=\"root\">SPA bereit</div><script src=\"/assets/app.js\" type=\"module\"></script>"));
  });
  const sockets = new WebSocketServer({ server, path: "/hmr" });
  sockets.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "connected" }));
    socket.on("message", (message) => socket.send(message.toString()));
  });
  return server;
}

/** MPA mit `/`, `/login`, `/admin` und relativen Assets. */
function mpaApp() {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/styles.css") return send(response, 200, "text/css", "body{margin:0}");
    if (url.pathname === "/login") {
      if (request.method === "POST") return send(response, 302, "text/plain", "", { location: "/admin" });
      return send(response, 200, "text/html; charset=utf-8", html("Login", "<form method=\"post\" action=\"/login\"><button>Anmelden</button></form>"));
    }
    if (url.pathname === "/admin") return send(response, 200, "text/html; charset=utf-8", html("Admin", "<h1>Adminbereich</h1>"));
    send(response, 200, "text/html; charset=utf-8", html("Start", "<link rel=\"stylesheet\" href=\"styles.css\"><a href=\"/login\">Login</a>"));
  });
}

/** API mit CORS, Preflight und Redirect. */
function apiApp() {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const origin = request.headers.origin ?? "*";
    const cors = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" };
    if (request.method === "OPTIONS") {
      return send(response, 204, "text/plain", "", { ...cors, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
    }
    if (url.pathname === "/redirect") return send(response, 302, "text/plain", "", { location: `http://localhost:${fixturePorts.api}/data` });
    send(response, 200, "application/json", JSON.stringify({ ok: true, path: url.pathname }), cors);
  });
}

/** WebSocket- und EventSource-Dienst. */
function realtimeApp() {
  const server = createServer((request, response) => {
    if (request.url === "/events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      response.write("data: erster\n\n");
      const timer = setInterval(() => response.write("data: tick\n\n"), 250);
      request.on("close", () => clearInterval(timer));
      return;
    }
    send(response, 200, "text/html; charset=utf-8", html("Realtime", "<p>Realtime</p>"));
  });
  const sockets = new WebSocketServer({ server, path: "/socket" });
  sockets.on("connection", (socket) => socket.send("hallo"));
  return server;
}

/** Cookie-App zur Verifikation der dokumentierten Portgrenze. */
function cookieApp() {
  return createServer((request, response) => {
    const cookies = request.headers.cookie ?? "";
    send(response, 200, "text/html; charset=utf-8", html("Cookies", `<p id="cookies">${cookies}</p>`), {
      "set-cookie": "fixture=1; Path=/; Domain=localhost",
    });
  });
}

/** Service-Worker-App für Reset und Quarantäne. */
function serviceWorkerApp() {
  return createServer((request, response) => {
    if (request.url === "/sw.js") return send(response, 200, "application/javascript", "self.addEventListener('install', () => self.skipWaiting());");
    send(response, 200, "text/html; charset=utf-8", html("Service Worker",
      "<p>SW</p><script>navigator.serviceWorker&&navigator.serviceWorker.register('/sw.js');caches.open('fixture').then(c=>c.put('/x',new Response('y')));</script>"));
  });
}

/** localStorage-App für Snapshot und Konflikt. */
function storageApp() {
  return createServer((_request, response) => {
    send(response, 200, "text/html; charset=utf-8", html("Storage",
      "<p id=\"state\">bereit</p><script>localStorage.setItem('fixture-theme','dark');localStorage.setItem('fixture-auth','token');</script>"));
  });
}

/** Fehlerhafte App für Console, Ressourcenfehler und große Payloads. */
function brokenApp() {
  return createServer((request, response) => {
    if (request.url === "/huge") return send(response, 200, "text/html; charset=utf-8", html("Groß", "x".repeat(3 * 1024 * 1024)));
    send(response, 200, "text/html; charset=utf-8", html("Fehler",
      "<img src=\"/fehlt.png\" alt=\"\"><script>console.error('Testfehler');throw new Error('Absichtlicher Fehler');</script>"));
  });
}

const factories = {
  spa: spaApp,
  mpa: mpaApp,
  api: apiApp,
  realtime: realtimeApp,
  cookie: cookieApp,
  serviceWorker: serviceWorkerApp,
  storage: storageApp,
  broken: brokenApp,
};

export async function startPreviewFixtures() {
  const servers = [];
  for (const [name, factory] of Object.entries(factories)) {
    const server = factory();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(fixturePorts[name], "127.0.0.1", resolve);
    });
    servers.push(server);
  }
  return async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""))) {
  const stop = await startPreviewFixtures();
  const shutdown = () => { void stop().then(() => process.exit(0)); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(`Preview-Fixtures laufen auf ${Object.values(fixturePorts).join(", ")}`);
}
