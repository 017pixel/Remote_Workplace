import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HermesServerMessage } from "@wrapt/contracts";
import { settings } from "../config/settings.js";
import type { NotificationDatabase } from "../notifications/database.js";
import type { HermesAcpManager } from "./acp/Manager.js";
import type { HermesSessionService } from "./session-service.js";
import { readHermesUpdateState } from "./status-service.js";

interface ResultCursor {
  initialized: boolean;
  lastUpdatedAt: string | null;
  seenIds: string[];
  startedIds: string[];
  updateFinishedAt: string | null;
  dashboardReachable: boolean | null;
  gatewayState: string | null;
}

const defaultCursor: ResultCursor = {
  initialized: false,
  lastUpdatedAt: null,
  seenIds: [],
  startedIds: [],
  updateFinishedAt: null,
  dashboardReachable: null,
  gatewayState: null,
};

function cursorPath(): string { return join(settings.dataDirectory, "hermes/result-cursor.json"); }

async function loadCursor(): Promise<ResultCursor> {
  try {
    const value = JSON.parse(await readFile(cursorPath(), "utf8")) as Partial<ResultCursor>;
    return {
      initialized: value.initialized === true,
      lastUpdatedAt: typeof value.lastUpdatedAt === "string" ? value.lastUpdatedAt : null,
      seenIds: Array.isArray(value.seenIds) ? value.seenIds.filter((id): id is string => typeof id === "string").slice(-200) : [],
      startedIds: Array.isArray(value.startedIds) ? value.startedIds.filter((id): id is string => typeof id === "string").slice(-200) : [],
      updateFinishedAt: typeof value.updateFinishedAt === "string" ? value.updateFinishedAt : null,
      dashboardReachable: typeof value.dashboardReachable === "boolean" ? value.dashboardReachable : null,
      gatewayState: typeof value.gatewayState === "string" ? value.gatewayState : null,
    };
  } catch { return { ...defaultCursor }; }
}

async function saveCursor(cursor: ResultCursor): Promise<void> {
  const path = cursorPath();
  try {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ ...cursor, seenIds: cursor.seenIds.slice(-200), startedIds: cursor.startedIds.slice(-200) }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  } catch { /* Best Effort — der Sync kommt beim nächsten Poll erneut. */ }
}

function later(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function hermesSessionLink(sessionId: string): string {
  const path = `/chat?resume=${encodeURIComponent(sessionId)}`;
  return `/wrapt/hermes-agent?path=${encodeURIComponent(path)}`;
}

export function shouldNotifyHermesSession(source: "cron" | "web" | "acp", durationSeconds: number, minimumSeconds: number): boolean {
  return source === "cron" || durationSeconds >= minimumSeconds;
}

export function shouldNotifyHermesMessage(durationSeconds: number, toolCallCount: number, minimumSeconds: number): boolean {
  return toolCallCount > 0 || durationSeconds >= minimumSeconds;
}

export class HermesResultSync {
  private timer: NodeJS.Timeout | null = null;
  private cursor: ResultCursor | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly sessions: HermesSessionService,
    private readonly manager: HermesAcpManager,
    private readonly notifications: NotificationDatabase,
  ) {}

  start(): void {
    if (this.timer) return;
    this.unsubscribe = this.manager.subscribe((message) => this.handleManagerMessage(message));
    this.timer = setInterval(() => { void this.poll(); }, settings.hermes.resultPollSeconds * 1_000);
    this.timer.unref();
    void this.poll();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async poll(): Promise<void> {
    if (!settings.hermes.enabled) return;
    if (!this.manager.hasConnections()) return;
    if (!this.cursor) this.cursor = await loadCursor();
    const cursor = this.cursor;
    try {
      const response = await this.sessions.listSessions({ limit: 100, offset: 0 });
      if (!cursor.initialized) {
        cursor.initialized = true;
        cursor.lastUpdatedAt = new Date().toISOString();
        cursor.seenIds = response.sessions.map((session) => session.id).slice(-200);
        cursor.startedIds = response.sessions.filter((session) => session.source === "cron" && session.status === "running").map((session) => session.id).slice(-200);
      } else {
        const runningIds: string[] = [];
        for (const session of response.sessions) {
          // Geplante Cron-Aufgaben melden ihren Start, damit der Lauf nicht
          // unsichtbar im Hintergrund passiert.
          if (session.source === "cron" && session.status === "running") {
            runningIds.push(session.id);
            if (!cursor.startedIds.includes(session.id)) {
              this.notifications.create({
                source: "hermes",
                category: "hermes",
                sourceIcon: "hermes",
                kind: "hermes.started",
                severity: "info",
                title: "Hermes-Aufgabe gestartet",
                body: session.title,
                link: hermesSessionLink(session.id),
                remoteId: `started:${session.id}:${session.updatedAt ?? session.createdAt ?? session.id}`,
                meta: { sessionId: session.id, source: session.source },
                report: null,
              });
              cursor.startedIds.push(session.id);
            }
          }
          if (session.status === "running" || !session.updatedAt) continue;
          if (session.source !== "cron" && session.source !== "web" && session.source !== "acp") continue;
          const remoteId = `result:${session.id}:${session.updatedAt}`;
          if (cursor.seenIds.includes(remoteId)) continue;
          if (cursor.lastUpdatedAt && Date.parse(session.updatedAt) <= Date.parse(cursor.lastUpdatedAt)) {
            cursor.seenIds.push(remoteId);
            continue;
          }
          const durationSeconds = session.createdAt ? Math.max(0, (Date.parse(session.updatedAt) - Date.parse(session.createdAt)) / 1_000) : 0;
          if (!shouldNotifyHermesSession(session.source, durationSeconds, settings.notifications.hermesCompletionMinimumSeconds)) {
            cursor.seenIds.push(remoteId);
            cursor.lastUpdatedAt = later(cursor.lastUpdatedAt, session.updatedAt);
            continue;
          }
          this.notifications.create({
            source: "hermes",
            category: "hermes",
            sourceIcon: "hermes",
            kind: "hermes.result",
            severity: session.status === "failed" ? "error" : "success",
            title: session.status === "failed" ? "Hermes-Aufgabe fehlgeschlagen" : "Hermes-Ergebnis verfügbar",
            body: session.title,
            link: hermesSessionLink(session.id),
            remoteId,
            meta: { sessionId: session.id, durationSeconds: Math.round(durationSeconds), source: session.source },
            report: session.status === "failed" ? { message: session.title, stack: null, context: { Quelle: "Hermes", Sitzung: session.id }, logs: [], environment: {} } : null,
          });
          cursor.seenIds.push(remoteId);
          cursor.lastUpdatedAt = later(cursor.lastUpdatedAt, session.updatedAt);
        }
        cursor.startedIds = cursor.startedIds.filter((id) => runningIds.includes(id));
      }
      cursor.dashboardReachable = true;
    } catch {
      cursor.dashboardReachable = false;
    }
    const update = readHermesUpdateState();
    if (update.lastFinishedAt && update.lastFinishedAt !== cursor.updateFinishedAt) {
      const unchanged = update.lastResult === "success" && update.previousVersion !== null && update.previousVersion === update.newVersion;
      if ((update.lastResult === "success" || update.lastResult === "failed") && !unchanged) {
        this.notifications.create({
          source: "update",
          category: "hermes",
          sourceIcon: "hermes",
          kind: "hermes.update",
          severity: update.lastResult === "failed" ? "error" : "success",
          title: update.lastResult === "failed" ? "Hermes-Update fehlgeschlagen" : "Hermes wurde aktualisiert",
          body: update.lastResult === "failed" ? "Die Update-Diagnose enthält die letzten redigierten Schritte." : `${update.previousVersion ?? "Unbekannt"} → ${update.newVersion ?? "aktuell"}`,
          link: "/wrapt/hermes-agent",
          remoteId: `update:${update.lastFinishedAt}:${update.lastResult}`,
          meta: { previousVersion: update.previousVersion, newVersion: update.newVersion },
          report: update.lastResult === "failed" ? { message: "Das Hermes-Update ist fehlgeschlagen.", stack: null, context: { Quelle: "Hermes Update" }, logs: update.logTail, environment: {} } : null,
        });
      }
      cursor.updateFinishedAt = update.lastFinishedAt;
    }
    await saveCursor(cursor);
  }

  private handleManagerMessage(message: HermesServerMessage): void {
    if (message.type === "approval.requested") {
      const request = message.request;
      this.notifications.create({
        source: "hermes",
        category: "hermes",
        sourceIcon: "hermes",
        kind: "hermes.approval",
        severity: request.risk === "high" ? "error" : "warning",
        title: "Hermes braucht deine Freigabe",
        body: request.title,
        link: hermesSessionLink(request.sessionId),
        remoteId: `approval:${request.requestId}`,
        meta: { sessionId: request.sessionId, requestId: request.requestId, risk: request.risk },
        report: null,
      });
      return;
    }
    if (message.type !== "message.complete") return;
    const session = this.manager.session(message.sessionId);
    const durationSeconds = session?.createdAt ? Math.max(0, (Date.now() - Date.parse(session.createdAt)) / 1_000) : 0;
    if (!shouldNotifyHermesMessage(durationSeconds, message.message.toolCalls.length, settings.notifications.hermesCompletionMinimumSeconds)) return;
    this.notifications.create({
      source: "hermes",
      category: "hermes",
      sourceIcon: "hermes",
      kind: "hermes.result",
      severity: "success",
      title: "Hermes-Antwort abgeschlossen",
      body: message.message.content,
      link: hermesSessionLink(message.sessionId),
      remoteId: `acp:${message.sessionId}:${message.message.id}`,
      meta: { sessionId: message.sessionId, durationSeconds: Math.round(durationSeconds), toolCalls: message.message.toolCalls.length },
    });
  }
}
