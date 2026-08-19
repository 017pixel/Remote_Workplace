import {
  PREVIEW_DIAGNOSTIC_LIMITS,
  type PreviewDiagnosticEvent,
  type PreviewLocalStorageEntry,
  type PreviewSlotResetReport,
} from "@wrapt/contracts";
import { generateId } from "./id";

export interface BridgeStatus {
  connected: boolean;
  version: string | null;
  href: string | null;
  /** Wahr, sobald ein Dokument geladen wurde, das keine Bridge meldet. */
  unavailable: boolean;
}

export interface PreviewBridgeHandlers {
  onDiagnostics?: (events: PreviewDiagnosticEvent[], dropped: number) => void;
  onStatus?: (status: BridgeStatus) => void;
  onStorage?: (entries: PreviewLocalStorageEntry[]) => void;
}

interface BridgeMessage {
  type?: unknown;
  bridgeSessionId?: unknown;
  epoch?: unknown;
  version?: unknown;
  href?: unknown;
  dropped?: unknown;
  events?: unknown;
  entries?: unknown;
  report?: unknown;
  nonce?: unknown;
  requestId?: unknown;
  keyCount?: unknown;
  error?: unknown;
}

const maximumMessageBytes = 512 * 1024;

/**
 * Elternseite des Bridge-Protokolls. Sie akzeptiert ausschließlich Nachrichten
 * von genau `iframe.contentWindow` mit der erwarteten Slot-Origin, vergibt
 * `bridgeSessionId` und Navigationsepoche und vergleicht Sequenzen nur innerhalb
 * derselben Epoche. Preview-Inhalt kann darüber keine privilegierte Aktion
 * auslösen — es kommen nur Diagnose- und begrenzte Storage-Daten an.
 */
export class PreviewBridgeClient {
  private iframe: HTMLIFrameElement | null = null;
  private slotOrigin: string | null = null;
  private readonly handlers: PreviewBridgeHandlers;
  private storageHandler: ((entries: PreviewLocalStorageEntry[]) => void) | null = null;
  private bridgeSessionId = generateId();
  private epoch = 0;
  private lastSequence = 0;
  private connected = false;
  private readonly buffer: PreviewDiagnosticEvent[] = [];
  private droppedEvents = 0;
  private pendingResolvers = new Map<string, (value: unknown) => void>();
  private readonly listener = (event: MessageEvent) => this.receive(event);

  constructor(handlers: PreviewBridgeHandlers = {}) {
    this.handlers = handlers;
    window.addEventListener("message", this.listener);
  }

  dispose() {
    window.removeEventListener("message", this.listener);
    for (const resolve of this.pendingResolvers.values()) resolve(null);
    this.pendingResolvers.clear();
  }

  /** Bindet die Bridge an ein iframe-Element und dessen erwartete Origin. */
  attach(iframe: HTMLIFrameElement | null, slotUrl: string | null) {
    this.iframe = iframe;
    try {
      this.slotOrigin = slotUrl ? new URL(slotUrl).origin : null;
    } catch {
      this.slotOrigin = null;
    }
    this.connected = false;
  }

  /** Eine neue Dokumentnavigation beginnt eine neue Epoche. */
  beginEpoch() {
    this.epoch += 1;
    this.lastSequence = 0;
    this.connected = false;
    this.bridgeSessionId = generateId();
    this.handlers.onStatus?.({ connected: false, version: null, href: null, unavailable: false });
  }

  /** Meldet, dass kein Handshake zustande kam (Bridge deaktiviert oder blockiert). */
  markUnavailable() {
    if (this.connected) return;
    this.handlers.onStatus?.({ connected: false, version: null, href: null, unavailable: true });
  }

  get sessionId(): string {
    return this.bridgeSessionId;
  }

  /** Der Storage-Empfänger hängt am Opt-in und wechselt zur Laufzeit. */
  setStorageHandler(handler: ((entries: PreviewLocalStorageEntry[]) => void) | null) {
    this.storageHandler = handler;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private post(message: Record<string, unknown>) {
    const target = this.iframe?.contentWindow;
    if (!target || !this.slotOrigin) return;
    target.postMessage({ ...message, bridgeSessionId: this.bridgeSessionId, epoch: this.epoch }, this.slotOrigin);
  }

  private receive(event: MessageEvent) {
    if (!this.iframe || !this.slotOrigin) return;
    if (event.source !== this.iframe.contentWindow) return;
    if (event.origin !== this.slotOrigin) return;
    const message = event.data as BridgeMessage;
    if (!message || typeof message !== "object" || typeof message.type !== "string") return;
    if (JSON.stringify(message).length > maximumMessageBytes) return;

    if (message.type === "wrapt.preview.hello-request") {
      this.post({ type: "wrapt.preview.hello" });
      return;
    }
    // Alles Weitere zählt nur innerhalb der aktuellen Epoche.
    if (Number(message.epoch) !== this.epoch) return;

    switch (message.type) {
      case "wrapt.preview.ready": {
        this.connected = true;
        this.handlers.onStatus?.({
          connected: true,
          version: typeof message.version === "string" ? message.version : null,
          href: typeof message.href === "string" ? message.href : null,
          unavailable: false,
        });
        return;
      }
      case "wrapt.preview.diagnostics": {
        if (!Array.isArray(message.events)) return;
        const events = message.events.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
        const parsed: PreviewDiagnosticEvent[] = [];
        for (const entry of events) {
          const sequence = Number(entry.sequence ?? 0);
          // Sequenzen wachsen innerhalb einer Epoche; Rückschritte deuten auf Replays.
          if (sequence <= this.lastSequence) continue;
          this.lastSequence = sequence;
          parsed.push({
            id: generateId(),
            at: typeof entry.at === "string" ? entry.at : new Date().toISOString(),
            source: "client",
            category: (entry.category ?? "console") as PreviewDiagnosticEvent["category"],
            severity: (entry.severity ?? "info") as PreviewDiagnosticEvent["severity"],
            completeness: (entry.completeness ?? "complete") as PreviewDiagnosticEvent["completeness"],
            previewNodeId: null,
            sessionId: null,
            slotId: null,
            routingRevision: null,
            bridgeSessionId: this.bridgeSessionId,
            epoch: this.epoch,
            sequence,
            route: typeof entry.route === "string" ? entry.route : null,
            message: String(entry.message ?? "").slice(0, 8_192),
            metadata: (entry.metadata ?? {}) as Record<string, unknown>,
          });
        }
        this.pushEvents(parsed, Number(message.dropped ?? 0));
        return;
      }
      case "wrapt.preview.storage": {
        if (!Array.isArray(message.entries)) return;
        const entries = message.entries
          .filter((entry): entry is { key: string; value: string } => typeof entry === "object" && entry !== null && typeof (entry as { key?: unknown }).key === "string")
          .map((entry) => ({ key: String(entry.key), value: String(entry.value) }));
        (this.storageHandler ?? this.handlers.onStorage)?.(entries);
        return;
      }
      case "wrapt.preview.reset.report":
      case "wrapt.preview.inventory.report": {
        const resolve = this.pendingResolvers.get("reset");
        if (resolve) {
          this.pendingResolvers.delete("reset");
          resolve(message.report);
        }
        return;
      }
      case "wrapt.preview.storage.restored": {
        const requestId = typeof message.requestId === "string" ? message.requestId : "restore";
        const resolve = this.pendingResolvers.get(requestId);
        if (resolve) {
          this.pendingResolvers.delete(requestId);
          resolve(message.error ? null : Number(message.keyCount ?? 0));
        }
      }
    }
  }

  private pushEvents(events: PreviewDiagnosticEvent[], dropped: number) {
    this.droppedEvents += dropped;
    for (const event of events) {
      if (this.buffer.length >= PREVIEW_DIAGNOSTIC_LIMITS.clientRingBuffer) {
        // Unter Last fallen zuerst Debug- und Info-Ereignisse weg.
        const index = this.buffer.findIndex((entry) => entry.severity === "debug" || entry.severity === "info");
        this.buffer.splice(index >= 0 ? index : 0, 1);
        this.droppedEvents += 1;
      }
      this.buffer.push(event);
    }
    this.handlers.onDiagnostics?.(events, this.droppedEvents);
  }

  /** Entnimmt bis zu 100 Ereignisse für den nächsten Batch. */
  takeBatch(): { events: PreviewDiagnosticEvent[]; dropped: number } {
    const events = this.buffer.splice(0, PREVIEW_DIAGNOSTIC_LIMITS.maxEventsPerBatch);
    const dropped = this.droppedEvents;
    this.droppedEvents = 0;
    return { events, dropped };
  }

  /** Legt einen nicht bestätigten Batch verlustfrei wieder vor neue Ereignisse. */
  restoreBatch(batch: { events: PreviewDiagnosticEvent[]; dropped: number }) {
    this.buffer.unshift(...batch.events);
    this.droppedEvents += batch.dropped;
  }

  navigate(action: "reload" | "back" | "forward") {
    this.post({ type: "wrapt.preview.navigate", action });
  }

  restoreStorage(entries: PreviewLocalStorageEntry[]): Promise<number | null> {
    const requestId = generateId();
    return new Promise((resolve) => {
      this.pendingResolvers.set(requestId, (value) => resolve(value as number | null));
      this.post({ type: "wrapt.preview.storage.restore", entries, requestId });
      window.setTimeout(() => {
        if (this.pendingResolvers.delete(requestId)) resolve(null);
      }, 10_000);
    });
  }

  /** Startet den Reset im iframe und wartet auf die verifizierbare Inventur. */
  resetStorage(nonce: string): Promise<PreviewSlotResetReport | null> {
    return new Promise((resolve) => {
      this.pendingResolvers.set("reset", (value) => {
        const report = value as Partial<PreviewSlotResetReport> | undefined;
        resolve(report ? {
          nonce,
          serviceWorkers: Number(report.serviceWorkers ?? 0),
          cacheStorages: Number(report.cacheStorages ?? 0),
          localStorageKeys: Number(report.localStorageKeys ?? 0),
          sessionStorageKeys: Number(report.sessionStorageKeys ?? 0),
          indexedDatabases: Number(report.indexedDatabases ?? 0),
          verifiable: Boolean(report.verifiable),
        } : null);
      });
      this.post({ type: "wrapt.preview.reset", nonce });
      window.setTimeout(() => {
        if (this.pendingResolvers.delete("reset")) resolve(null);
      }, 30_000);
    });
  }
}
