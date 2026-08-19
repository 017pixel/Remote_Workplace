import type { ClientMessage, ServerMessage } from "../terminal-types";
import { createUuid } from "../terminal-utils";
import { terminalTransport } from "../transport/TerminalTransport";
import type { RendererCoreDeps, RendererRefs } from "./rendererTypes";

export interface RendererCore {
  syncMouseModes(): void;
  applyGeometry(cols: number, rows: number, owns: boolean): void;
  resync(): void;
  createSession(): void;
  subscribeNow(): void;
  handleMessage(message: ServerMessage): void;
  attach(): void;
  detach(): void;
}

/** Baut den protokollnahen Sync-Kern eines Renderers. Alle Funktionen arbeiten
 *  über die übergebenen Refs — der Hook bleibt dadurch schlank und die
 *  Snapshot/Deltas-Logik ist isoliert testbar. */
export function createRendererCore(refs: RendererRefs, deps: RendererCoreDeps): RendererCore {
  const { terminalRef, fitRef, sessionRef, epochRef, sequenceRef, ownsGeometryRef, hasLiveStateRef, snapshotReplayRef, mouseTrackingRef, disposedRef, closedRef, createRetriesRef, subscriptionRef, cwdRef } = refs;

  /** Liest den tatsächlichen Maus-Modus direkt aus der xterm-Emulation. */
  const syncMouseModes = () => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    mouseTrackingRef.current = terminal.modes.mouseTrackingMode !== "none";
  };

  const applyGeometry = (cols: number, rows: number, owns: boolean) => {
    ownsGeometryRef.current = owns;
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (terminal.cols !== cols || terminal.rows !== rows) terminal.resize(cols, rows);
    if (owns) deps.fitAndReport();
  };

  const resync = () => {
    deps.sendMessage({ type: "terminal.sync", runtimeId: deps.instanceId, state: { epoch: epochRef.current, lastSequence: sequenceRef.current } });
  };

  /** Erstellt beziehungsweise reaktiviert die Runtime (idempotent je Runtime-ID). */
  const createSession = () => {
    const terminal = terminalRef.current;
    const preferred = fitRef.current?.proposeDimensions();
    deps.sendMessage({
      type: "terminal.create",
      requestId: createUuid(),
      runtimeId: deps.instanceId,
      kind: deps.kind,
      mode: deps.mode,
      ...(deps.accountId ? { accountId: deps.accountId } : {}),
      ...(deps.projectId ? { projectId: deps.projectId } : {}),
      ...(deps.initialCwd ? { cwd: deps.initialCwd } : {}),
      cols: preferred?.cols ?? terminal?.cols ?? 120,
      rows: preferred?.rows ?? terminal?.rows ?? 30,
    });
  };

  /** Abonnieren mit optionalem Fast-Reconnect-Zustand (nur gesetzte Werte). */
  const subscribeNow = () => {
    const preferred = fitRef.current?.proposeDimensions();
    const message: ClientMessage = {
      type: "terminal.subscribe",
      runtimeId: deps.instanceId,
      ...(preferred ? { cols: preferred.cols, rows: preferred.rows } : {}),
      ...(hasLiveStateRef.current ? { state: { epoch: epochRef.current, lastSequence: sequenceRef.current } } : {}),
    };
    deps.sendMessage(message);
  };

  const handleMessage = (message: ServerMessage) => {
    const terminal = terminalRef.current;
    switch (message.type) {
      case "terminal.created": {
        sessionRef.current = message.sessionId;
        cwdRef.current = message.cwd;
        deps.setCwd(message.cwd);
        deps.reportMeta({ status: "connected" });
        subscribeNow();
        break;
      }
      case "terminal.snapshot": {
        if (!terminal) return;
        sessionRef.current = message.sessionId;
        epochRef.current = message.epoch;
        sequenceRef.current = message.sequence;
        hasLiveStateRef.current = true;
        cwdRef.current = message.cwd;
        deps.setCwd(message.cwd);
        createRetriesRef.current = 0;
        applyGeometry(message.cols, message.rows, message.ownsGeometry);
        if (message.status === "exited") { deps.setStatus("exited"); deps.reportMeta({ status: "exited" }); break; }
        snapshotReplayRef.current = true;
        terminal.reset();
        // Der serialisierte Zustand enthält den exakten Bildschirm inklusive
        // Alternate Screen, Maus-Modi und Cursor — kein manuelles Raten mehr.
        terminal.write(message.serialized, () => {
          snapshotReplayRef.current = false;
          syncMouseModes();
          deps.flushReplayBuffer();
          deps.reportMeta({ status: "connected" });
        });
        break;
      }
      case "terminal.deltas": {
        if (!terminal) return;
        epochRef.current = message.epoch;
        for (const delta of message.deltas) {
          if (delta.sequence <= sequenceRef.current) continue;
          sequenceRef.current = delta.sequence;
          terminal.write(delta.data);
        }
        syncMouseModes();
        hasLiveStateRef.current = true;
        deps.reportMeta({ status: "connected" });
        break;
      }
      case "terminal.output": {
        if (message.sequence <= sequenceRef.current) return; // alte Nachricht
        // Sequenzlücke: Zustand ist unsicher → Resync statt kaputt weiterlaufen.
        if (message.sequence > sequenceRef.current + 1) { resync(); return; }
        sequenceRef.current = message.sequence;
        deps.queueOutput(message.data);
        break;
      }
      case "terminal.geometry": applyGeometry(message.cols, message.rows, message.ownsGeometry); break;
      case "terminal.cwd": cwdRef.current = message.cwd; deps.setCwd(message.cwd); deps.reportMeta({}); break;
      case "terminal.cleared": {
        sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
        terminal?.reset();
        break;
      }
      case "terminal.exited": {
        sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
        deps.setStatus("exited");
        deps.reportMeta({ status: "exited" });
        break;
      }
      case "terminal.restarting": {
        sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
        deps.setRestartBanner({ message: message.reason });
        break;
      }
      case "terminal.error": {
        // Die Runtime wurde serverseitig entfernt (z. B. anderes Gerät hat sie
        // beendet): höchstens dreimal neu erzeugen, danach sauberer Fehlerzustand.
        if (message.code === "SESSION_NOT_FOUND" && !closedRef.current && createRetriesRef.current < 3) {
          sessionRef.current = null;
          createRetriesRef.current += 1;
          window.setTimeout(createSession, 350);
          break;
        }
        deps.setError(message.message);
        deps.setStatus("error");
        deps.reportMeta({ status: "error", error: message.message });
        break;
      }
      default: break;
    }
  };

  const attach = () => {
    if (disposedRef.current || subscriptionRef.current) return;
    const subscription = terminalTransport.subscribe(deps.instanceId);
    subscriptionRef.current = subscription;
    subscription.onMessage(handleMessage);
    subscription.onStatus((connected) => {
      if (!connected) {
        deps.setStatus("disconnected");
        deps.reportMeta({ status: "disconnected" });
        return;
      }
      // `subscribe()` kann den Socket erst öffnen. In diesem Fall war der
      // erste create-Aufruf noch zu früh und wurde nicht gesendet. Nach dem
      // Open wird deshalb genau einmal der idempotente Create-/Resume-Flow
      // gestartet; bei einem späteren Reconnect wird die bestehende Runtime
      // direkt wieder abonniert und mit Epoch/Sequenz synchronisiert.
      if (sessionRef.current) subscribeNow();
      else createSession();
    });
    // Ist der gemeinsame Socket bereits offen, kommt kein neuer onStatus-
    // Callback für diese Subscription — dann kann create sofort raus.
    if (subscriptionRef.current === subscription) createSession();
  };

  const detach = () => {
    subscriptionRef.current?.dispose();
    subscriptionRef.current = null;
  };

  return { syncMouseModes, applyGeometry, resync, createSession, subscribeNow, handleMessage, attach, detach };
}

export type { RendererCoreDeps, RendererRefs } from "./rendererTypes";
