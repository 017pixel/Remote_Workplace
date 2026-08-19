import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";

type Document = DefaultTreeAdapterMap["document"];
type Element = DefaultTreeAdapterMap["element"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];

export const PREVIEW_BRIDGE_VERSION = "v1";
/** Reservierte Slot-Route. Sie wird nie an den Devserver weitergereicht. */
export const PREVIEW_BRIDGE_ROUTE = "/__wrapt/preview-bridge.v1.js";
/** Reservierte Route für den verifizierten Storage-Reset einer Slot-Origin. */
export const PREVIEW_RESET_ROUTE = "/__wrapt/preview-reset";
export const PREVIEW_BRIDGE_MARKER = "data-wrapt-preview-bridge";

export interface BridgeConfig {
  version: string;
  slotId: number;
  /** Zielport → öffentliche Slot-Origin. */
  mapping: Record<string, string>;
  /** Erlaubte Workbench-Origins für den `postMessage`-Handshake. */
  workbenchOrigins: string[];
  resetRoute: string;
  diagnosticsEnabled: boolean;
  storageSyncEnabled: boolean;
  maxStorageBytes: number;
  maxStorageKeys: number;
}

export type BridgeInjectionStatus = "injected" | "already-present" | "too-large" | "unsupported-charset" | "unparsable";

export interface BridgeInjectionResult {
  status: BridgeInjectionStatus;
  html: string | null;
}

/** Liest das Charset aus einem Content-Type-Header. */
export function charsetOf(contentType: string | undefined): string {
  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType ?? "");
  return (match?.[1] ?? "utf-8").toLowerCase();
}

export function isInjectableContentType(contentType: string | undefined): boolean {
  return String(contentType ?? "").toLowerCase().includes("text/html");
}

function findElement(node: ParentNode, tagName: string): Element | null {
  for (const child of node.childNodes) {
    if (!("tagName" in child)) continue;
    const element = child as Element;
    if (element.tagName === tagName) return element;
    const nested = findElement(element, tagName);
    if (nested) return nested;
  }
  return null;
}

function hasMarker(node: ParentNode): boolean {
  for (const child of node.childNodes) {
    if (!("tagName" in child)) continue;
    const element = child as Element;
    if (element.tagName === "script" && element.attrs.some((attribute: { name: string }) => attribute.name === PREVIEW_BRIDGE_MARKER)) return true;
    if (hasMarker(element)) return true;
  }
  return false;
}

/**
 * Injiziert genau ein externes Bridge-Script in `head`. Antworten ohne `head`,
 * ohne UTF-8 oder oberhalb des Limits bleiben unverändert; sie werden als
 * `bridgeUnavailable` diagnostiziert statt beschädigt zu werden.
 */
export function injectBridgeScript(html: Buffer, options: { maxBytes: number; charset: string; scriptSource: string }): BridgeInjectionResult {
  if (html.byteLength > options.maxBytes) return { status: "too-large", html: null };
  if (options.charset !== "utf-8" && options.charset !== "utf8") return { status: "unsupported-charset", html: null };
  let document: Document;
  try {
    document = parse(html.toString("utf8"));
  } catch {
    return { status: "unparsable", html: null };
  }
  if (hasMarker(document)) return { status: "already-present", html: null };
  const scriptElement: Element = {
    nodeName: "script",
    tagName: "script",
    attrs: [
      { name: "src", value: options.scriptSource },
      { name: PREVIEW_BRIDGE_MARKER, value: "" },
    ],
    namespaceURI: "http://www.w3.org/1999/xhtml",
    childNodes: [],
    parentNode: null,
  } as unknown as Element;
  // parse5 ergänzt fehlende html/head/body-Knoten selbst, deshalb genügt der Zugriff auf `head`.
  const head = findElement(document, "head") ?? findElement(document, "body") ?? findElement(document, "html");
  if (!head) return { status: "unparsable", html: null };
  scriptElement.parentNode = head;
  head.childNodes.unshift(scriptElement);
  return { status: "injected", html: serialize(document) };
}

export function bridgeScriptSource(config: BridgeConfig): string {
  return `${bridgeRuntime}\n;__wraptPreviewBridge(${JSON.stringify(config)});\n`;
}

// Der folgende Quelltext läuft im fremden Preview-Dokument. Er ist bewusst als
// String gehalten: dort gibt es weder unsere Modulauflösung noch unsere Typen.
// Die Bridge ist kein Sicherheitsprincipal — sie liefert Diagnose und begrenzte
// localStorage-Daten und kann keine privilegierten Aktionen auslösen.
const bridgeRuntime = String.raw`
function __wraptPreviewBridge(config) {
  if (window.__wraptPreviewBridgeInstalled) return;
  window.__wraptPreviewBridgeInstalled = true;

  var parentOrigin = null;
  var bridgeSessionId = null;
  var epoch = 0;
  var sequence = 0;
  var dropped = 0;
  var queue = [];
  var maxQueue = 400;

  function post(message) {
    if (!parentOrigin) return;
    try { window.parent.postMessage(message, parentOrigin); } catch (error) { void error; }
  }

  function describe(value, depth) {
    if (depth > 4) return "[…]";
    if (value === null) return null;
    var kind = typeof value;
    if (kind === "string") return value.length > 8192 ? value.slice(0, 8192) + "…" : value;
    if (kind === "number" || kind === "boolean") return value;
    if (kind === "bigint") return String(value) + "n";
    if (kind === "function") return "[Funktion " + (value.name || "anonym") + "]";
    if (kind === "symbol") return String(value);
    if (kind === "undefined") return "[undefined]";
    if (value instanceof Error) return { name: value.name, message: value.message, stack: String(value.stack || "").slice(0, 4096) };
    if (typeof Node !== "undefined" && value instanceof Node) return "[DOM " + (value.nodeName || "Knoten") + "]";
    if (Array.isArray(value)) {
      var list = [];
      for (var index = 0; index < value.length && index < 100; index += 1) list.push(describe(value[index], depth + 1));
      if (value.length > 100) list.push("[… " + (value.length - 100) + " weitere]");
      return list;
    }
    var result = {};
    var count = 0;
    var names;
    try { names = Object.keys(value); } catch (error) { void error; return "[nicht lesbar]"; }
    for (var position = 0; position < names.length; position += 1) {
      if (count >= 100) { result["…"] = "weitere Eigenschaften ausgelassen"; break; }
      var name = names[position];
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, name); } catch (error) { void error; continue; }
      if (!descriptor || descriptor.get) { result[name] = "[Getter]"; count += 1; continue; }
      try { result[name] = describe(descriptor.value, depth + 1); } catch (error) { void error; result[name] = "[nicht lesbar]"; }
      count += 1;
    }
    return result;
  }

  function safeDescribe(value) {
    var seen = [];
    function walk(input, depth) {
      if (input && typeof input === "object") {
        if (seen.indexOf(input) !== -1) return "[Zyklus]";
        seen.push(input);
      }
      return describe(input, depth);
    }
    try { return walk(value, 0); } catch (error) { void error; return "[nicht serialisierbar]"; }
  }

  function emit(category, severity, message, metadata, completeness) {
    if (!config.diagnosticsEnabled) return;
    sequence += 1;
    var event = {
      at: new Date().toISOString(),
      source: "client",
      category: category,
      severity: severity,
      completeness: completeness || "complete",
      epoch: epoch,
      sequence: sequence,
      route: String(location.pathname + location.search).slice(0, 2048),
      message: String(message).slice(0, 8192),
      metadata: metadata || {}
    };
    if (queue.length >= maxQueue) {
      var removable = -1;
      for (var index = 0; index < queue.length; index += 1) {
        if (queue[index].severity === "debug" || queue[index].severity === "info") { removable = index; break; }
      }
      if (removable >= 0) queue.splice(removable, 1); else queue.shift();
      dropped += 1;
    }
    queue.push(event);
  }

  function flush() {
    if (!parentOrigin || queue.length === 0) return;
    var batch = queue.splice(0, 100);
    post({ type: "wrapt.preview.diagnostics", bridgeSessionId: bridgeSessionId, epoch: epoch, dropped: dropped, events: batch });
    dropped = 0;
  }
  setInterval(flush, 2000);

  // ── URL-Umschreibung ───────────────────────────────────────────────────────
  function rewrite(value) {
    try {
      var url = new URL(String(value), location.href);
      var local = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", location.hostname];
      if (local.indexOf(url.hostname) === -1) return String(value);
      var replacement = config.mapping[url.port];
      if (!replacement) return String(value);
      var base = new URL(replacement);
      base.pathname = url.pathname;
      base.search = url.search;
      base.hash = url.hash;
      if (url.protocol === "ws:" || url.protocol === "wss:") base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
      return base.href;
    } catch (error) { void error; return String(value); }
  }

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var started = Date.now();
      var target = input instanceof Request ? rewrite(input.url) : rewrite(input);
      var request = input instanceof Request ? new Request(target, input) : target;
      return nativeFetch(request, init).then(function (response) {
        emit("network", response.ok ? "debug" : "warn", "fetch " + response.status + " " + target,
          { status: response.status, durationMs: Date.now() - started, url: target });
        return response;
      }, function (error) {
        emit("network", "error", "fetch fehlgeschlagen: " + target, { url: target, error: String(error && error.message) });
        throw error;
      });
    };
  }

  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var rewritten = rewrite(url);
    this.addEventListener("loadend", function () {
      emit("network", this.status >= 400 || this.status === 0 ? "warn" : "debug",
        "xhr " + this.status + " " + rewritten, { status: this.status, url: rewritten });
    });
    var rest = Array.prototype.slice.call(arguments, 2);
    return nativeOpen.apply(this, [method, rewritten].concat(rest));
  };

  var NativeWebSocket = window.WebSocket;
  if (NativeWebSocket) {
    window.WebSocket = function (url, protocols) {
      var target = rewrite(url);
      var socket = protocols === undefined ? new NativeWebSocket(target) : new NativeWebSocket(target, protocols);
      socket.addEventListener("open", function () { emit("network", "info", "WebSocket verbunden: " + target, { url: target }); });
      socket.addEventListener("close", function (event) {
        emit("network", event.wasClean ? "info" : "warn", "WebSocket geschlossen: " + target, { url: target, code: event.code });
      });
      socket.addEventListener("error", function () { emit("network", "error", "WebSocket-Fehler: " + target, { url: target }); });
      return socket;
    };
    window.WebSocket.prototype = NativeWebSocket.prototype;
    window.WebSocket.OPEN = NativeWebSocket.OPEN;
    window.WebSocket.CLOSED = NativeWebSocket.CLOSED;
    window.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    window.WebSocket.CLOSING = NativeWebSocket.CLOSING;
  }

  var NativeEventSource = window.EventSource;
  if (NativeEventSource) {
    window.EventSource = function (url, options) {
      var target = rewrite(url);
      var source = options === undefined ? new NativeEventSource(target) : new NativeEventSource(target, options);
      source.addEventListener("error", function () { emit("network", "warn", "EventSource-Fehler: " + target, { url: target }); });
      return source;
    };
    window.EventSource.prototype = NativeEventSource.prototype;
  }

  if (navigator.sendBeacon) {
    var nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) { return nativeBeacon(rewrite(url), data); };
  }

  // Import-Maps und absolute Localhost-Attribute im bereits geparsten Dokument.
  function rewriteAttributes() {
    var nodes = document.querySelectorAll("[src], [href], [action]");
    for (var index = 0; index < nodes.length; index += 1) {
      var node = nodes[index];
      ["src", "href", "action"].forEach(function (attribute) {
        var value = node.getAttribute && node.getAttribute(attribute);
        if (!value || value.indexOf("//") === -1) return;
        var next = rewrite(value);
        if (next !== value) node.setAttribute(attribute, next);
      });
    }
  }

  // ── Diagnose ───────────────────────────────────────────────────────────────
  ["debug", "log", "info", "warn", "error"].forEach(function (level) {
    var native = console[level] ? console[level].bind(console) : null;
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      var severity = level === "log" ? "info" : level === "debug" ? "debug" : level;
      emit("console", severity, args.map(function (item) { return typeof item === "string" ? item : "[" + typeof item + "]"; }).join(" "),
        { arguments: args.slice(0, 8).map(safeDescribe) });
      if (native) native.apply(console, args);
    };
  });

  window.addEventListener("error", function (event) {
    if (event.target && event.target !== window && event.target.tagName) {
      emit("error", "error", "Ressource konnte nicht geladen werden: " + (event.target.src || event.target.href || event.target.tagName),
        { tagName: event.target.tagName });
      return;
    }
    emit("error", "error", String(event.message), { filename: event.filename, line: event.lineno, column: event.colno });
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    emit("error", "error", "Unbehandelte Promise-Ablehnung", { reason: safeDescribe(event.reason) });
  });

  window.addEventListener("DOMContentLoaded", function () { rewriteAttributes(); emit("lifecycle", "info", "DOMContentLoaded", {}); });
  window.addEventListener("load", function () {
    rewriteAttributes();
    emit("lifecycle", "info", "Load abgeschlossen", {});
    try {
      var navigation = performance.getEntriesByType("navigation")[0];
      if (navigation) {
        emit("performance", "info", "Navigationszeiten", {
          domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
          loadEnd: Math.round(navigation.loadEventEnd),
          transferSize: navigation.transferSize
        }, "partial");
      }
    } catch (error) { void error; }
    // Requests aus Workern und Service Workern erscheinen hier nicht.
    emit("network", "debug", "Netzwerksicht der Bridge ist unvollständig", {}, "partial");
  });
  window.addEventListener("pagehide", function () { scheduleSnapshot(true); flush(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { scheduleSnapshot(true); flush(); }
  });

  // ── localStorage-Snapshot ──────────────────────────────────────────────────
  function readStorage() {
    var entries = [];
    var bytes = 0;
    try {
      for (var index = 0; index < localStorage.length; index += 1) {
        var key = localStorage.key(index);
        if (key === null) continue;
        var value = localStorage.getItem(key);
        if (value === null) continue;
        entries.push({ key: key, value: value });
        bytes += key.length + value.length;
        if (entries.length > config.maxStorageKeys || bytes > config.maxStorageBytes) {
          return { entries: entries, bytes: bytes, exceeded: true };
        }
      }
    } catch (error) { void error; return { entries: [], bytes: 0, exceeded: false, unavailable: true }; }
    entries.sort(function (left, right) { return left.key < right.key ? -1 : left.key > right.key ? 1 : 0; });
    return { entries: entries, bytes: bytes, exceeded: false };
  }

  var snapshotTimer = null;
  var lastSignature = "";
  function signature(entries) {
    var parts = [];
    for (var index = 0; index < entries.length; index += 1) parts.push(entries[index].key + " " + entries[index].value.length);
    return parts.join("");
  }
  function snapshotSignature(entries) {
    return JSON.stringify(entries);
  }
  function scheduleSnapshot(immediate) {
    if (!config.storageSyncEnabled || !parentOrigin) return;
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(function () {
      var state = readStorage();
      if (state.unavailable) return;
      if (state.exceeded) {
        emit("storage", "warn", "localStorage überschreitet die Snapshot-Grenzen", { keys: state.entries.length, bytes: state.bytes });
        return;
      }
      var current = snapshotSignature(state.entries);
      if (current === lastSignature) return;
      lastSignature = current;
      post({ type: "wrapt.preview.storage", bridgeSessionId: bridgeSessionId, epoch: epoch, entries: state.entries, bytes: state.bytes });
    }, immediate ? 0 : 800);
  }

  if (config.storageSyncEnabled) {
    var nativeSetItem = Storage.prototype.setItem;
    var nativeRemoveItem = Storage.prototype.removeItem;
    var nativeClear = Storage.prototype.clear;
    Storage.prototype.setItem = function (key, value) { var result = nativeSetItem.apply(this, arguments); if (this === localStorage) scheduleSnapshot(false); return result; };
    Storage.prototype.removeItem = function (key) { var result = nativeRemoveItem.apply(this, arguments); if (this === localStorage) scheduleSnapshot(false); return result; };
    Storage.prototype.clear = function () { var result = nativeClear.apply(this, arguments); if (this === localStorage) scheduleSnapshot(false); return result; };
    window.addEventListener("storage", function () { scheduleSnapshot(false); });
    // Direktzuweisungen (localStorage.foo = "bar") lösen keinen Hook aus; im
    // sichtbaren Dokument wird deshalb zusätzlich verglichen.
    setInterval(function () { if (document.visibilityState === "visible") scheduleSnapshot(false); }, 5000);
  }

  // ── Storage-Reset und Inventur ─────────────────────────────────────────────
  function inventory() {
    var report = { serviceWorkers: 0, cacheStorages: 0, localStorageKeys: 0, sessionStorageKeys: 0, indexedDatabases: 0, verifiable: true };
    var steps = [];
    try { report.localStorageKeys = localStorage.length; } catch (error) { void error; report.verifiable = false; }
    try { report.sessionStorageKeys = sessionStorage.length; } catch (error) { void error; report.verifiable = false; }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      steps.push(navigator.serviceWorker.getRegistrations().then(function (registrations) { report.serviceWorkers = registrations.length; })
        .catch(function () { report.verifiable = false; }));
    }
    if (window.caches && caches.keys) {
      steps.push(caches.keys().then(function (keys) { report.cacheStorages = keys.length; }).catch(function () { report.verifiable = false; }));
    }
    if (window.indexedDB && indexedDB.databases) {
      steps.push(indexedDB.databases().then(function (databases) { report.indexedDatabases = databases.length; }).catch(function () { report.verifiable = false; }));
    } else {
      report.verifiable = false;
    }
    return Promise.all(steps).then(function () { return report; });
  }

  function purge() {
    var steps = [];
    try { localStorage.clear(); } catch (error) { void error; }
    try { sessionStorage.clear(); } catch (error) { void error; }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      steps.push(navigator.serviceWorker.getRegistrations().then(function (registrations) {
        return Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
      }).catch(function () { }));
    }
    if (window.caches && caches.keys) {
      steps.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      }).catch(function () { }));
    }
    if (window.indexedDB && indexedDB.databases) {
      steps.push(indexedDB.databases().then(function (databases) {
        return Promise.all(databases.map(function (database) {
          return new Promise(function (resolve) {
            if (!database.name) return resolve(null);
            var request = indexedDB.deleteDatabase(database.name);
            request.onsuccess = function () { resolve(null); };
            request.onerror = function () { resolve(null); };
            request.onblocked = function () { resolve(null); };
          });
        }));
      }).catch(function () { }));
    }
    return Promise.all(steps).then(function () {
      // Die reservierte Netzwerkroute bestätigt den Abschluss; Cookies bleiben ausgenommen.
      return fetch(config.resetRoute || "/__wrapt/preview-reset", { method: "POST", credentials: "same-origin" }).catch(function () { });
    }).then(inventory);
  }

  // ── Handshake ──────────────────────────────────────────────────────────────
  window.addEventListener("message", function (event) {
    if (!event.data || typeof event.data !== "object") return;
    if (config.workbenchOrigins.indexOf(event.origin) === -1) return;
    if (event.source !== window.parent) return;
    var message = event.data;
    if (message.type === "wrapt.preview.hello") {
      parentOrigin = event.origin;
      bridgeSessionId = String(message.bridgeSessionId || "").slice(0, 120);
      epoch = Number(message.epoch) || 0;
      post({ type: "wrapt.preview.ready", bridgeSessionId: bridgeSessionId, epoch: epoch, version: config.version, slotId: config.slotId, href: location.href });
      rewriteAttributes();
      scheduleSnapshot(true);
      return;
    }
    if (parentOrigin !== event.origin) return;
    if (message.type === "wrapt.preview.navigate") {
      if (message.action === "reload") location.reload();
      else if (message.action === "back") history.back();
      else if (message.action === "forward") history.forward();
      return;
    }
    if (message.type === "wrapt.preview.storage.restore" && config.storageSyncEnabled && Array.isArray(message.entries)) {
      try {
        localStorage.clear();
        for (var index = 0; index < message.entries.length; index += 1) {
          localStorage.setItem(String(message.entries[index].key), String(message.entries[index].value));
        }
        post({ type: "wrapt.preview.storage.restored", bridgeSessionId: bridgeSessionId, keyCount: localStorage.length, requestId: message.requestId });
      } catch (error) {
        post({ type: "wrapt.preview.storage.restored", bridgeSessionId: bridgeSessionId, error: String(error), requestId: message.requestId });
      }
      return;
    }
    if (message.type === "wrapt.preview.reset") {
      purge().then(function (report) {
        post({ type: "wrapt.preview.reset.report", bridgeSessionId: bridgeSessionId, epoch: epoch, nonce: message.nonce, report: report });
      });
      return;
    }
    if (message.type === "wrapt.preview.inventory") {
      inventory().then(function (report) {
        post({ type: "wrapt.preview.inventory.report", bridgeSessionId: bridgeSessionId, epoch: epoch, report: report });
      });
    }
  });

  // Die Workbench kennt das iframe-Element; die Bridge meldet sich zuerst bei
  // allen erlaubten Origins und bindet sich danach an die antwortende Origin.
  for (var index = 0; index < config.workbenchOrigins.length; index += 1) {
    try { window.parent.postMessage({ type: "wrapt.preview.hello-request", version: config.version, slotId: config.slotId }, config.workbenchOrigins[index]); } catch (error) { void error; }
  }
}
`;
