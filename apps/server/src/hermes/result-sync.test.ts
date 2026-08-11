import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesResultSync, shouldNotifyHermesMessage, shouldNotifyHermesSession } from "./result-sync.js";
import type { HermesServerMessage } from "@workbench/contracts";
import { settings } from "../config/settings.js";

function testSync(pollEnabled = true) {
  const notifications = { create: vi.fn() } as unknown as { create: ReturnType<typeof vi.fn> };
  const sessions = {
    listSessions: vi.fn(async () => ({ sessions: [], nextCursor: null })),
  } as unknown as { listSessions: ReturnType<typeof vi.fn> };
  let subscriber: ((message: HermesServerMessage) => void) | null = null;
  const manager = {
    hasConnections: vi.fn(() => pollEnabled),
    subscribe: vi.fn((callback: (message: HermesServerMessage) => void) => { subscriber = callback; return () => { subscriber = null; }; }),
    session: vi.fn(() => undefined),
  } as unknown as { hasConnections: () => boolean; subscribe: (cb: (m: HermesServerMessage) => void) => () => void; session: (id: string) => { createdAt: string } | undefined };
  const sync = new HermesResultSync(sessions as never, manager as never, notifications as never);
  return { sync, notifications, sessions, manager, emit: (message: HermesServerMessage) => subscriber?.(message) };
}

afterEach(() => { vi.useRealTimers(); });

describe("Hermes-Benachrichtigungsfilter", () => {
  it("unterdrückt kurze Web- und ACP-Antworten ohne Werkzeuge", () => {
    expect(shouldNotifyHermesSession("web", 45, 120)).toBe(false);
    expect(shouldNotifyHermesSession("acp", 119, 120)).toBe(false);
    expect(shouldNotifyHermesMessage(45, 0, 120)).toBe(false);
  });

  it("meldet Cron, lange Sitzungen und Werkzeugläufe", () => {
    expect(shouldNotifyHermesSession("cron", 2, 120)).toBe(true);
    expect(shouldNotifyHermesSession("web", 120, 120)).toBe(true);
    expect(shouldNotifyHermesMessage(10, 1, 120)).toBe(true);
  });
});

describe("Hermes Task-Lebenszyklus-Benachrichtigungen", () => {
  it("meldet Freigaben als Warnung und mit Link zur Session", () => {
    const { sync, notifications, emit } = testSync(false);
    sync.start();
    emit({
      v: 1,
      type: "approval.requested",
      request: { requestId: "req-1", sessionId: "sess-1", toolCallId: "tool-1", title: "Terminal-Befehl ausführen", description: "", command: "rm -rf", risk: "high", options: ["allow_once", "allow_session", "deny"], expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: "hermes.approval",
      severity: "error",
      title: "Hermes braucht deine Freigabe",
      link: "/workbench/hermes-agent?path=%2Fchat%3Fresume%3Dsess-1",
      remoteId: "approval:req-1",
    }));
    sync.stop();
  });

  it("stuft Freigaben mit niedrigem Risiko als Warnung ein", () => {
    const { sync, notifications, emit } = testSync(false);
    sync.start();
    emit({
      v: 1,
      type: "approval.requested",
      request: { requestId: "req-2", sessionId: "sess-2", toolCallId: null, title: "Datei lesen", description: "", command: null, risk: "low", options: ["allow_once", "deny"], expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ kind: "hermes.approval", severity: "warning" }));
    sync.stop();
  });

  it("meldet eine neu gestartete Cron-Aufgabe über den Session-Poll", async () => {
    // Cursor vorseeden: Der Sync gilt als initialisiert, die laufende
    // Cron-Session ist ihm noch nicht bekannt.
    const cursorPath = join(settings.dataDirectory, "hermes/result-cursor.json");
    mkdirSync(dirname(cursorPath), { recursive: true });
    writeFileSync(cursorPath, JSON.stringify({ initialized: true, lastUpdatedAt: "2026-08-11T07:00:00.000Z", seenIds: [], startedIds: [], updateFinishedAt: null, dashboardReachable: null, gatewayState: null }));
    const { sync, notifications, sessions } = testSync();
    sessions.listSessions.mockResolvedValue({ sessions: [{ id: "cron-1", title: "T3-Updatecheck", source: "cron", status: "running", updatedAt: "2026-08-11T08:00:00.000Z", createdAt: "2026-08-11T08:00:00.000Z" }], nextCursor: null });
    sync.start();
    await vi.waitFor(() => expect(notifications.create).toHaveBeenCalled());
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: "hermes.started",
      severity: "info",
      title: "Hermes-Aufgabe gestartet",
      remoteId: expect.stringMatching(/^started:cron-1:/),
    }));
    sync.stop();
  });
});
