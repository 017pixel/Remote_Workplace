import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import WebSocket from "ws";
import { BROWSER_CLIPBOARD_MAX_BYTES, type ClientBrowserMessage, type ServerBrowserMessage } from "./protocol.js";
import type { BrowserDatabase } from "./database.js";

interface CdpResponse {
  id?: number;
  sessionId?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

type BrowserListener = (message: ServerBrowserMessage) => void;

export class BrowserFailure extends Error {
  constructor(
    readonly code: "SESSION_NOT_FOUND" | "SESSION_NOT_OWNED" | "TOO_MANY_SESSIONS" | "BROWSER_START_FAILED" | "INTERNAL_ERROR",
    message: string,
  ) {
    super(message);
  }
}

export function resolveChromiumPath(configuredPath: string): string {
  if (configuredPath !== "auto") return configuredPath;
  // Systempakete verwenden die Sandbox-Konfiguration des Servers. Gecachte
  // Playwright-Binaries können trotz vorhandenem Binary an AppArmor oder
  // deaktivierten User-Namespaces des Hosts scheitern.
  for (const executable of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/snap/bin/chromium", "/usr/bin/chromium-browser"]) {
    if (existsSync(executable)) return executable;
  }
  const cacheCandidates = [
    { root: join(homedir(), ".cache", "ms-playwright"), suffixes: ["chrome-linux64/chrome", "chrome-linux/chrome"] },
    { root: join(homedir(), ".cache", "puppeteer", "chrome"), suffixes: ["chrome-linux64/chrome", "chrome-linux/chrome"] },
  ];
  for (const candidate of cacheCandidates) {
    if (!existsSync(candidate.root)) continue;
    const versions = readdirSync(candidate.root).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of versions) {
      for (const suffix of candidate.suffixes) {
        const executable = join(candidate.root, version, suffix);
        if (existsSync(executable)) return executable;
      }
    }
  }
  throw new BrowserFailure("BROWSER_START_FAILED", "Auf dem Server wurde kein Chromium-Binary gefunden.");
}

class CdpConnection {
  private sequence = 0;
  private readonly pending = new Map<number, {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private readonly eventListeners = new Set<(message: CdpResponse) => void>();

  private constructor(
    private readonly socket: WebSocket,
    private readonly commandTimeoutMilliseconds: number,
  ) {
    socket.on("message", (raw) => {
      let message: CdpResponse;
      try { message = JSON.parse(raw.toString()) as CdpResponse; } catch { return; }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message ?? "Chromium-Befehl fehlgeschlagen."));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.eventListeners) listener(message);
    });
    socket.on("close", () => this.rejectPending(new Error("Chromium-Verbindung wurde geschlossen.")));
    socket.on("error", (error) => this.rejectPending(error));
  }

  static connect(url: string, timeoutMilliseconds: number): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => { socket.terminate(); reject(new Error("Chromium-Verbindung hat nicht rechtzeitig geantwortet.")); }, timeoutMilliseconds);
      socket.once("open", () => { clearTimeout(timeout); resolve(new CdpConnection(socket, timeoutMilliseconds)); });
      socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    });
  }

  onEvent(listener: (message: CdpResponse) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      // Hintergrund-Befehle (Captures, Cleanup nach Shutdown) erwarten die
      // Antwort nicht mehr; ohne Abfänger würden ihre Fehler als unhandled
      // rejections den Testlauf kippen.
      const closed = Promise.reject(new Error("Chromium ist nicht verbunden."));
      closed.catch(() => {});
      return closed;
    }
    const id = ++this.sequence;
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chromium-Befehl ${method} hat das Zeitlimit überschritten.`));
      }, this.commandTimeoutMilliseconds);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }), (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        reject(error);
      });
    });
    // Hintergrund-Befehle (Captures, Cleanup nach Shutdown) erwarten die
    // Antwort nicht mehr; ohne diesen Abfänger würden ihre Fehler als
    // unhandled rejections den Testlauf kippen.
    promise.catch(() => {});
    return promise;
  }

  close() { this.socket.close(); }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

interface BrowserState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

const clipboardSelectionExpression = `(() => {
  const active = document.activeElement;
  if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== null && active.selectionEnd !== null && active.selectionStart !== active.selectionEnd) {
    return active.value.slice(active.selectionStart, active.selectionEnd);
  }
  return globalThis.getSelection?.().toString() ?? "";
})()`;

export function validateBrowserClipboardText(value: unknown): { text: string | null; error: string | null } {
  if (typeof value !== "string") return { text: null, error: "Die Browserauswahl konnte nicht gelesen werden." };
  if (!value) return { text: null, error: "Wähle zuerst Text im Browser aus." };
  if (Buffer.byteLength(value, "utf8") > BROWSER_CLIPBOARD_MAX_BYTES) return { text: null, error: "Die Browserauswahl ist größer als 1 MiB und wurde nicht kopiert." };
  return { text: value, error: null };
}

export interface BrowserCaptureOptions {
  captureMaxWidth: number;
  captureMaxHeight: number;
  captureMaxScale: number;
  captureJpegQuality: number;
  captureEveryNthFrame: number;
}

export function browserCaptureMetrics(width: number, height: number, options: BrowserCaptureOptions) {
  const logicalWidth = Math.max(320, Math.min(2_400, Math.round(width)));
  const logicalHeight = Math.max(220, Math.min(1_600, Math.round(height)));
  const scale = Math.max(1, Math.min(options.captureMaxScale, options.captureMaxWidth / logicalWidth, options.captureMaxHeight / logicalHeight));
  return {
    width: logicalWidth,
    height: logicalHeight,
    scale,
    captureWidth: Math.round(logicalWidth * scale),
    captureHeight: Math.round(logicalHeight * scale),
  };
}

class BrowserSession {
  readonly id = randomUUID();
  readonly listeners = new Set<BrowserListener>();
  lastUsedAt = Date.now();
  private targetSessionId = "";
  private targetId = "";
  private width = 1_280;
  private height = 720;
  private state: BrowserState = { url: "about:blank", title: "Neuer Tab", loading: false, canGoBack: false, canGoForward: false };
  private lastFrame: { data: string; width: number; height: number } | null = null;
  private refreshTimer: NodeJS.Timeout | undefined;
  private screencastStarted = false;
  private captureQueue = Promise.resolve();
  private resizeQueue = Promise.resolve();
  private disposed = false;
  private unexpectedExitHandler: (() => void) | undefined;

  private constructor(
    readonly userId: string,
    readonly instanceId: string,
    readonly profileKey: string,
    private readonly process: ChildProcessWithoutNullStreams,
    private readonly cdp: CdpConnection,
    private readonly devtoolsBrowserUrl: string,
    private readonly managerOptions: BrowserCaptureOptions,
    private readonly onStateChange: (state: BrowserState) => void,
  ) {}

  static async create(options: { userId: string; instanceId: string; profileKey: string; profileDirectory: string; initialUrl: string; chromiumPath: string; startupTimeoutMilliseconds: number; width: number; height: number; allowNoSandbox?: boolean; onStateChange: (state: BrowserState) => void } & BrowserCaptureOptions) {
    const profileDirectory = options.profileDirectory;
    await mkdir(profileDirectory, { recursive: true, mode: 0o700 });
    await chmod(profileDirectory, 0o700);
    const process = spawn(options.chromiumPath, [
      "--headless=new",
      ...(options.allowNoSandbox ? ["--no-sandbox"] : []),
      "--disable-gpu",
      "--high-dpi-support=1",
      `--force-device-scale-factor=${options.captureMaxScale}`,
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-default-apps",
      "--no-first-run",
      "--no-default-browser-check",
      "--password-store=basic",
      "--restore-last-session",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      `--window-size=${options.width},${options.height}`,
      options.initialUrl,
    ], { stdio: "pipe" });
    try {
      const websocketUrl = await readDevtoolsUrl(process, options.startupTimeoutMilliseconds);
      // Erst nach dem DevTools-Handshake dauerhaft lesen. Vorher muss
      // `readDevtoolsUrl` jedes Startsignal zuverlässig sehen können.
      // Danach werden die Pipes weiter abgeholt, damit Chromium bei großen
      // Logbursts nicht an stdout/stderr blockiert.
      process.stdout.resume();
      process.stderr.resume();
      const cdp = await CdpConnection.connect(websocketUrl, options.startupTimeoutMilliseconds);
      const session = new BrowserSession(options.userId, options.instanceId, options.profileKey, process, cdp, websocketUrl, options, options.onStateChange);
      await session.initialize(options.width, options.height);
      return session;
    } catch (error) {
      process.kill("SIGTERM");
      throw new BrowserFailure("BROWSER_START_FAILED", error instanceof Error ? error.message : "Chromium konnte nicht gestartet werden.");
    }
  }

  attach(listener: BrowserListener, width: number, height: number, requestId?: string): () => void {
    this.lastUsedAt = Date.now();
    this.listeners.add(listener);
    void this.activateCapture();
    void this.resize(width, height);
    listener({ type: "browser.ready", ...(requestId ? { requestId } : {}), sessionId: this.id, ...this.state, width: this.width, height: this.height });
    listener({ type: "browser.state", sessionId: this.id, ...this.state });
    if (this.lastFrame) listener({ type: "browser.frame", sessionId: this.id, ...this.lastFrame });
    return () => {
      this.listeners.delete(listener);
      this.lastUsedAt = Date.now();
      if (this.listeners.size === 0) void this.deactivateCapture();
    };
  }

  onUnexpectedExit(handler: () => void) {
    this.unexpectedExitHandler = handler;
  }

  openDevtoolsSocket() {
    if (!this.targetId) throw new BrowserFailure("INTERNAL_ERROR", "Das DevTools-Ziel ist noch nicht verfügbar.");
    return { browserUrl: this.devtoolsBrowserUrl, targetId: this.targetId };
  }

  async command(message: Exclude<ClientBrowserMessage, { type: "browser.create" | "browser.attach" | "browser.close" | "browser.ping" }>) {
    this.lastUsedAt = Date.now();
    switch (message.type) {
      case "browser.resize": await this.resize(message.width, message.height); break;
      case "browser.navigate": await this.cdp.send("Page.navigate", { url: message.url }, this.targetSessionId); break;
      case "browser.reload": await this.cdp.send("Page.reload", { ignoreCache: true }, this.targetSessionId); break;
      case "browser.back": await this.navigateHistory(-1); break;
      case "browser.forward": await this.navigateHistory(1); break;
      case "browser.pointer": await this.pointer(message); break;
      case "browser.wheel": await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: message.x, y: message.y, deltaX: message.deltaX, deltaY: message.deltaY }, this.targetSessionId); break;
      case "browser.key": await this.key(message.key, message.code, message.modifiers); break;
      case "browser.text": await this.cdp.send("Input.insertText", { text: message.text }, this.targetSessionId); break;
      case "browser.copy": {
        try {
          const result = await this.cdp.send("Runtime.evaluate", { expression: clipboardSelectionExpression, returnByValue: true }, this.targetSessionId);
          const evaluation = result.result as { value?: unknown } | undefined;
          this.broadcast({ type: "browser.clipboard", sessionId: this.id, requestId: message.requestId, ...validateBrowserClipboardText(evaluation?.value) });
        } catch {
          this.broadcast({ type: "browser.clipboard", sessionId: this.id, requestId: message.requestId, text: null, error: "Die Browserauswahl konnte nicht gelesen werden." });
        }
        break;
      }
      case "browser.screenshot": {
        const result = await this.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, this.targetSessionId);
        if (typeof result.data === "string") this.broadcast({ type: "browser.screenshot", sessionId: this.id, data: result.data });
        break;
      }
      case "browser.source": {
        const result = await this.cdp.send("Runtime.evaluate", { expression: "document.documentElement?.outerHTML ?? ''", returnByValue: true }, this.targetSessionId);
        const evaluation = result.result as { value?: unknown } | undefined;
        const source = typeof evaluation?.value === "string" ? evaluation.value : "";
        const limitedSource = source.length > 4_000_000 ? `${source.slice(0, 4_000_000)}\n<!-- Ausgabe aus Sicherheitsgründen gekürzt. -->` : source;
        this.broadcast({ type: "browser.source", sessionId: this.id, source: limitedSource, url: this.state.url });
        break;
      }
    }
  }

  async close() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    for (const listener of this.listeners) listener({ type: "browser.closed", sessionId: this.id });
    this.listeners.clear();
    await Promise.all([this.captureQueue.catch(() => undefined), this.resizeQueue.catch(() => undefined)]);
    if (this.screencastStarted) await this.cdp.send("Page.stopScreencast", {}, this.targetSessionId).catch(() => undefined);
    await this.cdp.send("Browser.close").catch(() => undefined);
    await this.terminateProcess();
    this.cdp.close();
  }

  private async terminateProcess() {
    if (this.process.exitCode !== null || this.process.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => this.process.once("exit", () => resolve()));

    // Chromium schreibt Cookies und Local Storage des Profils erst beim eigenen
    // Beenden auf die Platte. Nach `Browser.close` deshalb erst auf den regulären
    // Exit warten — das direkt folgende SIGTERM hat sonst genau diese Daten
    // gekostet, angemeldete Sitzungen waren nach einem Neustart wieder ausgeloggt.
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3_000))]);
    if (this.process.exitCode !== null || this.process.signalCode !== null) return;

    this.process.kill("SIGTERM");
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 1_500))]);
    if (this.process.exitCode === null && this.process.signalCode === null) {
      this.process.kill("SIGKILL");
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 500))]);
    }
  }

  private async initialize(width: number, height: number) {
    const targets = await this.cdp.send("Target.getTargets");
    const targetInfos = (targets.targetInfos as Array<{ targetId: string; type: string }> | undefined) ?? [];
    let targetId = targetInfos.find((target) => target.type === "page")?.targetId;
    if (!targetId) {
      const created = await this.cdp.send("Target.createTarget", { url: "about:blank" });
      targetId = String(created.targetId ?? "");
    }
    this.targetId = targetId;
    const attached = await this.cdp.send("Target.attachToTarget", { targetId, flatten: true });
    this.targetSessionId = String(attached.sessionId ?? "");
    if (!this.targetSessionId) throw new Error("Chromium-Seite konnte nicht verbunden werden.");
    this.cdp.onEvent((message) => this.handleEvent(message));
    await Promise.all([
      this.cdp.send("Page.enable", {}, this.targetSessionId),
      this.cdp.send("Runtime.enable", {}, this.targetSessionId),
      this.cdp.send("Security.enable", {}, this.targetSessionId),
    ]);
    await this.resize(width, height);
    await this.refreshState();
    this.process.once("exit", () => {
      if (this.disposed) return;
      this.disposed = true;
      for (const listener of this.listeners) listener({ type: "browser.closed", sessionId: this.id });
      this.listeners.clear();
      const handler = this.unexpectedExitHandler;
      this.unexpectedExitHandler = undefined;
      handler?.();
    });
  }

  private resize(width: number, height: number) {
    const metrics = browserCaptureMetrics(width, height, this.captureOptions());
    if (metrics.width === this.width && metrics.height === this.height && this.screencastStarted) return this.resizeQueue;
    this.width = metrics.width;
    this.height = metrics.height;
    this.resizeQueue = this.resizeQueue.then(async () => {
      await this.cdp.send("Emulation.setDeviceMetricsOverride", {
        width: metrics.width,
        height: metrics.height,
        deviceScaleFactor: metrics.scale,
        mobile: false,
      }, this.targetSessionId);
      if (this.screencastStarted) {
        await this.cdp.send("Page.stopScreencast", {}, this.targetSessionId).catch(() => undefined);
        this.screencastStarted = false;
        await this.startScreencast(metrics);
      }
      // Läuft ein Größenwechsel nach der Verbindungsfreigabe (z. B. ein letzter
      // Screencast-Frame während des Shutdowns), schlägt der CDP-Befehl fehl.
      // Die Kette darf nicht als unhandled rejection enden, weil niemand mehr
      // auf sie wartet.
    }).catch(() => undefined);
    return this.resizeQueue;
  }

  private async startScreencast(metrics = browserCaptureMetrics(this.width, this.height, this.captureOptions())) {
    const pixelCount = metrics.captureWidth * metrics.captureHeight;
    const baseQuality = this.captureOptions().captureJpegQuality;
    const quality = pixelCount > 1_000_000 ? Math.max(40, baseQuality - 30) : pixelCount > 500_000 ? Math.max(50, baseQuality - 15) : baseQuality;
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality,
      maxWidth: metrics.captureWidth,
      maxHeight: metrics.captureHeight,
      everyNthFrame: this.captureOptions().captureEveryNthFrame,
    }, this.targetSessionId);
    this.screencastStarted = true;
  }

  private activateCapture() {
    this.captureQueue = this.captureQueue.then(async () => {
      if (this.disposed || this.listeners.size === 0 || this.screencastStarted) return;
      await this.startScreencast();
    }).catch(() => undefined);
    return this.captureQueue;
  }

  private deactivateCapture() {
    this.captureQueue = this.captureQueue.then(async () => {
      if (this.disposed || this.listeners.size > 0 || !this.screencastStarted) return;
      await this.cdp.send("Page.stopScreencast", {}, this.targetSessionId).catch(() => undefined);
      this.screencastStarted = false;
    }).catch(() => undefined);
    return this.captureQueue;
  }

  private captureOptions(): BrowserCaptureOptions {
    return this.managerOptions;
  }

  private handleEvent(message: CdpResponse) {
    if (message.sessionId !== this.targetSessionId || !message.method) return;
    if (message.method === "Page.screencastFrame") {
      const data = typeof message.params?.data === "string" ? message.params.data : null;
      const frameSessionId = Number(message.params?.sessionId);
      if (Number.isFinite(frameSessionId)) void this.cdp.send("Page.screencastFrameAck", { sessionId: frameSessionId }, this.targetSessionId).catch(() => undefined);
      if (data) {
        this.lastUsedAt = Date.now();
        this.lastFrame = { data, width: this.width, height: this.height };
        this.broadcast({ type: "browser.frame", sessionId: this.id, ...this.lastFrame });
      }
      return;
    }
    if (message.method === "Page.frameStartedLoading") this.setState({ loading: true });
    if (message.method === "Page.loadEventFired" || message.method === "Page.frameStoppedLoading" || message.method === "Page.frameNavigated") {
      this.scheduleStateRefresh();
    }
  }

  private scheduleStateRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => { void this.refreshState(); }, 60);
  }

  private async refreshState() {
    if (this.disposed) return;
    const [history, titleResult] = await Promise.all([
      this.cdp.send("Page.getNavigationHistory", {}, this.targetSessionId),
      this.cdp.send("Runtime.evaluate", { expression: "document.title || location.hostname || 'Neuer Tab'", returnByValue: true }, this.targetSessionId),
    ]);
    const entries = (history.entries as Array<{ id: number; url: string }> | undefined) ?? [];
    const currentIndex = Number(history.currentIndex ?? -1);
    const current = entries[currentIndex];
    const evaluation = titleResult.result as { value?: unknown } | undefined;
    this.state = {
      url: current?.url ?? this.state.url,
      title: typeof evaluation?.value === "string" ? evaluation.value : this.state.title,
      loading: false,
      canGoBack: currentIndex > 0,
      canGoForward: currentIndex >= 0 && currentIndex < entries.length - 1,
    };
    this.onStateChange(this.state);
    this.broadcast({ type: "browser.state", sessionId: this.id, ...this.state });
  }

  private setState(patch: Partial<BrowserState>) {
    this.state = { ...this.state, ...patch };
    this.broadcast({ type: "browser.state", sessionId: this.id, ...this.state });
  }

  private broadcast(message: ServerBrowserMessage) {
    for (const listener of this.listeners) listener(message);
  }

  private async navigateHistory(delta: number) {
    const history = await this.cdp.send("Page.getNavigationHistory", {}, this.targetSessionId);
    const entries = (history.entries as Array<{ id: number }> | undefined) ?? [];
    const target = entries[Number(history.currentIndex ?? -1) + delta];
    if (target) await this.cdp.send("Page.navigateToHistoryEntry", { entryId: target.id }, this.targetSessionId);
  }

  private async pointer(message: Extract<ClientBrowserMessage, { type: "browser.pointer" }>) {
    const type = message.action === "move" ? "mouseMoved" : message.action === "down" ? "mousePressed" : "mouseReleased";
    await this.cdp.send("Input.dispatchMouseEvent", {
      type, x: message.x, y: message.y, button: message.button, buttons: message.buttons,
      ...(message.action === "down" ? { clickCount: 1 } : {}),
    }, this.targetSessionId);
  }

  private async key(key: string, code: string, names: Array<"Alt" | "Control" | "Meta" | "Shift">) {
    const modifiers = (names.includes("Alt") ? 1 : 0) | (names.includes("Control") ? 2 : 0) | (names.includes("Meta") ? 4 : 0) | (names.includes("Shift") ? 8 : 0);
    const virtualKeys: Record<string, number> = { Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Escape: 27, " ": 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46 };
    const oemKeys: Record<string, number> = { ";": 186, "=": 187, ",": 188, "-": 189, ".": 190, "/": 191, "`": 192, "[": 219, "\\": 220, "]": 221, "'": 222 };
    const printable = key.length === 1 && (modifiers & 7) === 0;
    const params = { key, code, modifiers, windowsVirtualKeyCode: virtualKeys[key] ?? oemKeys[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0), ...(printable ? { text: key, unmodifiedText: key } : {}) };
    await this.cdp.send("Input.dispatchKeyEvent", { type: printable ? "keyDown" : "rawKeyDown", ...params }, this.targetSessionId);
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params, text: undefined, unmodifiedText: undefined }, this.targetSessionId);
  }
}

function readDevtoolsUrl(process: ChildProcessWithoutNullStreams, timeoutMilliseconds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Chromium-Start hat das Zeitlimit überschritten.")); }, timeoutMilliseconds);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buffer);
      if (match?.[1]) { cleanup(); resolve(match[1]); }
      if (buffer.length > 16_384) buffer = buffer.slice(-8_192);
    };
    const onExit = () => {
      cleanup();
      const detail = buffer.trim().replace(/\s+/g, " ").slice(-1_000);
      reject(new Error(detail ? `Chromium wurde während des Starts beendet: ${detail}` : "Chromium wurde während des Starts beendet."));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      process.stderr.off("data", onData);
      process.stdout.off("data", onData);
      process.off("exit", onExit);
    };
    process.stderr.on("data", onData);
    process.stdout.on("data", onData);
    process.once("exit", onExit);
  });
}

export class BrowserManager {
  private readonly sessions = new Map<string, BrowserSession>();
  private readonly instances = new Map<string, string>();
  private readonly profiles = new Map<string, string>();
  private readonly creatingProfiles = new Map<string, Promise<BrowserSession>>();
  private readonly creatingInstances = new Map<string, Promise<void>>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private readonly chromiumPath: string;

  constructor(private readonly options: { chromiumPath: string; profilesRoot: string; maxSessions: number; startupTimeoutMilliseconds: number; idleTimeoutMilliseconds: number; allowNoSandbox?: boolean; database?: BrowserDatabase } & BrowserCaptureOptions) {
    this.chromiumPath = resolveChromiumPath(options.chromiumPath);
    this.cleanupTimer = setInterval(() => void this.closeIdleSessions(), 60_000);
    this.cleanupTimer.unref();
  }

  private async withInstanceCreationLock<T>(instanceKey: string, work: () => Promise<T>): Promise<T> {
    const previous = this.creatingInstances.get(instanceKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.creatingInstances.set(instanceKey, queued);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.creatingInstances.get(instanceKey) === queued) this.creatingInstances.delete(instanceKey);
    }
  }

  async createOrAttach(userId: string, instanceId: string, width: number, height: number, listener: BrowserListener, requestId?: string, requestedProfileKey?: string, requestedInitialUrl?: string) {
    const instanceKey = `${userId}:${instanceId}`;
    return this.withInstanceCreationLock(instanceKey, () => this.createOrAttachUnlocked(userId, instanceId, width, height, listener, requestId, requestedProfileKey, requestedInitialUrl));
  }

  private async createOrAttachUnlocked(userId: string, instanceId: string, width: number, height: number, listener: BrowserListener, requestId?: string, requestedProfileKey?: string, requestedInitialUrl?: string) {
    const existingId = this.instances.get(`${userId}:${instanceId}`);
    const stored = this.options.database?.get(userId, instanceId);
    const profileKey = requestedProfileKey ?? stored?.profileKey ?? instanceId;
    const profileMapKey = `${userId}:${profileKey}`;
    let session = existingId ? this.sessions.get(existingId) : this.sessions.get(this.profiles.get(profileMapKey) ?? "");
    if (!session) {
      let creation = this.creatingProfiles.get(profileMapKey);
      if (!creation) {
        if (this.sessions.size + this.creatingProfiles.size >= this.options.maxSessions) {
          throw new BrowserFailure("TOO_MANY_SESSIONS", "Die maximale Anzahl paralleler Browser ist erreicht.");
        }
        const profileDirectory = join(this.options.profilesRoot, createHash("sha256").update(`${userId}\u0000${profileKey}`).digest("hex"));
        const initialUrl = requestedInitialUrl ?? (stored?.lastUrl && stored.lastUrl !== "about:blank" ? stored.lastUrl : "about:blank");
        creation = BrowserSession.create({
          userId,
          instanceId,
          profileKey,
          profileDirectory,
          initialUrl,
          chromiumPath: this.chromiumPath,
          startupTimeoutMilliseconds: this.options.startupTimeoutMilliseconds,
          ...(this.options.allowNoSandbox === undefined ? {} : { allowNoSandbox: this.options.allowNoSandbox }),
          width,
          height,
          captureMaxWidth: this.options.captureMaxWidth,
          captureMaxHeight: this.options.captureMaxHeight,
          captureMaxScale: this.options.captureMaxScale,
          captureJpegQuality: this.options.captureJpegQuality,
          captureEveryNthFrame: this.options.captureEveryNthFrame,
          onStateChange: (state) => this.options.database?.save({ userId, instanceId, profileKey, lastUrl: state.url, updatedAt: Date.now() }),
        }).then((created) => {
          this.sessions.set(created.id, created);
          this.profiles.set(profileMapKey, created.id);
          created.onUnexpectedExit(() => this.removeSession(created));
          return created;
        }).finally(() => this.creatingProfiles.delete(profileMapKey));
        this.creatingProfiles.set(profileMapKey, creation);
      }
      session = await creation;
    }
    this.instances.set(`${userId}:${instanceId}`, session.id);
    this.options.database?.save({ userId, instanceId, profileKey, lastUrl: stored?.lastUrl ?? requestedInitialUrl ?? "about:blank", updatedAt: Date.now() });
    const detach = session.attach(listener, width, height, requestId);
    return { session, detach };
  }

  attach(userId: string, sessionId: string, width: number, height: number, listener: BrowserListener) {
    const session = this.ownedSession(userId, sessionId);
    return { session, detach: session.attach(listener, width, height) };
  }

  command(userId: string, message: Exclude<ClientBrowserMessage, { type: "browser.create" | "browser.attach" | "browser.close" | "browser.ping" }>) {
    return this.ownedSession(userId, message.sessionId).command(message);
  }

  openDevtoolsSocket(userId: string, sessionId: string) {
    return this.ownedSession(userId, sessionId).openDevtoolsSocket();
  }

  async closeSession(userId: string, sessionId: string) {
    const session = this.ownedSession(userId, sessionId);
    this.removeSession(session);
    await session.close();
  }

  async shutdown() {
    clearInterval(this.cleanupTimer);
    await Promise.allSettled(this.creatingProfiles.values());
    await Promise.all([...this.sessions.values()].map((session) => session.close()));
    this.sessions.clear();
    this.instances.clear();
    this.profiles.clear();
    this.creatingProfiles.clear();
  }

  private ownedSession(userId: string, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new BrowserFailure("SESSION_NOT_FOUND", "Die Browser-Sitzung existiert nicht mehr.");
    if (session.userId !== userId) throw new BrowserFailure("SESSION_NOT_OWNED", "Diese Browser-Sitzung gehört einem anderen Benutzer.");
    return session;
  }

  private async closeIdleSessions() {
    const expired = [...this.sessions.values()].filter((session) => Date.now() - session.lastUsedAt > this.options.idleTimeoutMilliseconds);
    await Promise.all(expired.map(async (session) => {
      this.removeSession(session);
      await session.close();
    }));
  }

  private removeSession(session: BrowserSession) {
    if (this.sessions.get(session.id) !== session) return;
    this.sessions.delete(session.id);
    for (const [key, value] of this.instances) if (value === session.id) this.instances.delete(key);
    if (this.profiles.get(`${session.userId}:${session.profileKey}`) === session.id) {
      this.profiles.delete(`${session.userId}:${session.profileKey}`);
    }
  }
}
