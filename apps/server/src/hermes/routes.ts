import { access, constants as fsConstants, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { hermesClientMessageSchema, hermesErrorCodeSchema, type HermesErrorCode, type HermesSessionSource, type HermesServerMessage } from "@wrapt/contracts";
import { z, ZodError } from "zod";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";
import { isSameOriginRequest } from "../security/same-origin.js";
import { requestIdentity } from "../security/workbench-identity.js";
import { createWebSocketSendQueue } from "../utils/websocketSendQueue.js";
import { HermesClientError } from "./client.js";
import type { HermesDashboardClient } from "./client.js";
import type { HermesAcpManager } from "./acp/Manager.js";
import type { HermesSessionService } from "./session-service.js";
import { readHermesUpdateState } from "./status-service.js";
import type { HermesStatusService } from "./status-service.js";
import { performServiceAction, startUpdateService } from "./service-control.js";

const execFileAsync = promisify(execFile);

function ensureEnabled() {
  if (!settings.hermes.enabled) throw new AppError(503, "HERMES_DISABLED", "Hermes ist in der Workbench-Konfiguration deaktiviert.");
}

function errorCode(error: unknown): HermesErrorCode {
  if (error instanceof HermesClientError && hermesErrorCodeSchema.safeParse(error.code).success) return error.code;
  if (error instanceof ZodError) return "INVALID_MESSAGE";
  return "INTERNAL_ERROR";
}

function errorText(error: unknown): string {
  if (error instanceof HermesClientError) return error.message;
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Die Hermes-Anfrage konnte nicht verarbeitet werden.";
}

function queryParams(request: FastifyRequest) {
  const raw = request.query && typeof request.query === "object" ? request.query as Record<string, unknown> : {};
  return z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    cursor: z.string().max(200).optional(),
    q: z.string().max(200).optional(),
    source: z.enum(["web", "cli", "telegram", "cron", "acp", "other"]).optional(),
    status: z.enum(["success", "failed"]).optional(),
  }).parse(raw);
}

function isSafeCwd(cwd: string): boolean {
  const normalized = resolve(cwd);
  return settings.terminalAllowedRoots.some((root) => {
    const allowed = resolve(root);
    return normalized === allowed || normalized.startsWith(`${allowed}/`);
  });
}

function websocketIdentity(request: FastifyRequest): string {
  // The development fallback is the same identity path used by the global
  // Workbench hook. Production keeps it empty and therefore still requires
  // the Tailscale header on every WebSocket handshake.
  const identity = requestIdentity(request) ?? settings.developmentTailscaleUser;
  if (!identity || (settings.terminalAllowedUsers.length > 0 && !settings.terminalAllowedUsers.includes(identity))) throw new AppError(403, "WRAPT_FORBIDDEN", "Dieser Benutzer darf den Hermes-Chat nicht verwenden.");
  return identity;
}

export async function registerHermesRoutes(app: FastifyInstance, options: {
  client: HermesDashboardClient;
  manager: HermesAcpManager;
  sessions: HermesSessionService;
  status: HermesStatusService;
  resolveProjectCwd: (projectId: string | null) => Promise<string>;
}) {
  app.get("/hermes/status", async () => { ensureEnabled(); return options.status.get(); });
  app.get("/hermes/sessions", async (request) => { ensureEnabled(); const query = queryParams(request); return options.sessions.listSessions({ limit: query.limit, offset: query.offset, ...(query.q ? { query: query.q } : {}), ...(query.source ? { source: query.source as HermesSessionSource } : {}) }); });
  app.get("/hermes/sessions/:id", async (request) => { ensureEnabled(); const id = z.object({ id: z.string().min(1).max(200) }).parse(request.params).id; return options.sessions.getSession(id); });
  app.get("/hermes/sessions/:id/messages", async (request) => { ensureEnabled(); const id = z.object({ id: z.string().min(1).max(200) }).parse(request.params).id; return options.sessions.getMessages(id); });
  app.delete("/hermes/sessions/:id", async (request, reply) => { ensureEnabled(); const id = z.object({ id: z.string().min(1).max(200) }).parse(request.params).id; await options.sessions.deleteSession(id); return reply.status(204).send(); });
  app.get("/hermes/tasks", async () => { ensureEnabled(); return options.sessions.tasks(); });
  app.post("/hermes/tasks/:id/cancel", async (request, reply) => {
    ensureEnabled();
    const id = z.object({ id: z.string().min(1).max(200) }).parse(request.params).id;
    await options.manager.cancel(id);
    return reply.status(204).send();
  });
  app.get("/hermes/cron", async () => { ensureEnabled(); return options.sessions.cron(); });
  app.get("/hermes/results", async (request) => { ensureEnabled(); const query = queryParams(request); return options.sessions.results({ ...(query.source ? { source: query.source as HermesSessionSource } : {}), ...(query.status ? { status: query.status } : {}), offset: query.offset, limit: query.limit }); });
  app.get("/hermes/models", async () => { ensureEnabled(); return options.sessions.models(); });
  app.post("/hermes/models/select", async (request) => { ensureEnabled(); const model = z.object({ model: z.string().min(1).max(200) }).parse(request.body); await options.sessions.selectModel(model.model); return options.sessions.models(); });
  app.post("/hermes/services/action", async (request) => { ensureEnabled(); return performServiceAction(request.body); });
  app.get("/hermes/update/status", async () => { ensureEnabled(); return readHermesUpdateState(); });
  app.post("/hermes/update/check", async () => { ensureEnabled(); return checkUpdate(); });
  app.post("/hermes/update/run", async () => { ensureEnabled(); await startUpdateService(true); return readHermesUpdateState(); });
  app.get("/hermes/diagnostics", async () => { ensureEnabled(); return diagnostics(options); });
  app.post("/hermes/diagnostics/run", async () => { ensureEnabled(); return diagnostics(options); });

  app.get("/hermes/chat", { websocket: true }, (socket, request) => {
    try {
      if (!settings.hermes.enabled) throw new AppError(503, "HERMES_DISABLED", "Hermes ist deaktiviert.");
      if (!isSameOriginRequest(request)) throw new AppError(403, "WRAPT_CROSS_ORIGIN", "Der Hermes-Chat ist nur vom Wrapt-Origin erreichbar.");
      websocketIdentity(request);
    } catch (error) {
      socket.send(JSON.stringify({ v: 1, type: "error", code: errorCode(error), message: errorText(error), sessionId: null } satisfies HermesServerMessage));
      socket.close(1008, errorCode(error));
      return;
    }
    const queue = createWebSocketSendQueue<HermesServerMessage>({ socket, maxQueueBytes: 8 * 1024 * 1024 });
    const send = (message: HermesServerMessage) => queue.send(message);
    let sessionId: string | null = null;
    options.manager.openConnection();
    const unsubscribe = options.manager.subscribe((message) => {
      const messageSessionId = message.type === "approval.requested" ? message.request.sessionId : message.type === "session.ready" ? message.session.id : "sessionId" in message ? message.sessionId : null;
      if (sessionId && messageSessionId === sessionId) send(message);
    });
    socket.on("message", (raw: unknown) => {
      void (async () => {
        try {
          const value = typeof raw === "string" || Buffer.isBuffer(raw) ? JSON.parse(raw.toString()) as unknown : null;
          const message = hermesClientMessageSchema.parse(value);
          switch (message.type) {
            case "session.create": {
              const cwd = await options.resolveProjectCwd(message.projectId);
              if (!isSafeCwd(cwd)) throw new HermesClientError("PROJECT_FORBIDDEN", "Das Projekt liegt außerhalb der erlaubten Projektpfade.", 403, false);
              const session = await options.manager.createSession(cwd, message.title);
              sessionId = session.id;
              send({ v: 1, type: "session.ready", session, replayComplete: true });
              break;
            }
            case "session.attach": {
              const summary = await options.sessions.getSessionSummary(message.sessionId);
              const cwd = summary.cwd ?? settings.terminalDefaultCwd;
              if (!isSafeCwd(cwd)) throw new HermesClientError("PROJECT_FORBIDDEN", "Die Session-Arbeitsumgebung liegt außerhalb der erlaubten Projektpfade.", 403, false);
              // `session/load` streamt die Historie noch vor seiner Antwort. Die
              // Socket-Zuordnung muss deshalb vor dem ACP-Aufruf stehen, sonst
              // gehen die Replay-Updates beim ersten Attach verloren.
              sessionId = message.sessionId;
              const session = await options.manager.attachSession(message.sessionId, cwd, summary, send);
              send({ v: 1, type: "session.ready", session, replayComplete: true });
              break;
            }
            case "session.detach": sessionId = null; break;
            case "message.send": {
              if (sessionId !== message.sessionId) throw new HermesClientError("SESSION_NOT_FOUND", "Die Session ist in diesem Chat nicht verbunden.", 404, false);
              await options.manager.prompt(message.sessionId, message.content, message.clientMessageId);
              break;
            }
            case "task.cancel": {
              if (sessionId !== message.sessionId) throw new HermesClientError("SESSION_NOT_FOUND", "Die Session ist in diesem Chat nicht verbunden.", 404, false);
              await options.manager.cancel(message.sessionId);
              break;
            }
            case "approval.respond": {
              if (!sessionId || !options.manager.respondApproval(message.requestId, message.option, sessionId)) throw new HermesClientError("APPROVAL_EXPIRED", "Diese Freigabe ist nicht mehr aktiv oder gehört zu einer anderen Session.", 410, false);
              break;
            }
            case "model.set": {
              if (sessionId !== message.sessionId) throw new HermesClientError("SESSION_NOT_FOUND", "Die Session ist in diesem Chat nicht verbunden.", 404, false);
              await options.manager.setModel(message.sessionId, message.model);
              break;
            }
            case "ping": send({ v: 1, type: "pong" }); break;
          }
        } catch (error) {
          send({ v: 1, type: "error", code: errorCode(error), message: errorText(error), sessionId });
        }
      })();
    });
    socket.on("close", () => { unsubscribe(); queue.dispose(); options.manager.closeConnection(); });
  });
}

async function checkUpdate() {
  try {
    const result = await execFileAsync(settings.hermes.cliPath, ["update", "--check"], { cwd: settings.hermes.checkoutDirectory, timeout: settings.hermes.requestTimeoutSeconds * 1_000, maxBuffer: 256 * 1024, env: { ...process.env, HERMES_HOME: settings.hermes.homeDirectory } });
    const available = /update available|new version|behind/i.test(`${result.stdout}\n${result.stderr}`);
    return { available, checkedAt: new Date().toISOString(), output: "Der Hermes-Updatecheck wurde ausgeführt." };
  } catch {
    throw new AppError(502, "DASHBOARD_UNREACHABLE", "Der Hermes-Updatecheck konnte nicht ausgeführt werden.");
  }
}

async function diagnostics(options: { client: HermesDashboardClient; manager: HermesAcpManager; status: HermesStatusService }) {
  const status = await options.status.get();
  type DiagnosticStatus = "ok" | "warn" | "fail" | "skipped";
  type DiagnosticItem = { id: string; label: string; status: DiagnosticStatus; detail: string; hint: string };
  const passed = (id: string, label: string, detail = "Prüfung erfolgreich."): DiagnosticItem => ({ id, label, status: "ok", detail, hint: "Keine Aktion erforderlich." });
  const warned = (id: string, label: string, hint: string, detail = "Prüfung benötigt Aufmerksamkeit."): DiagnosticItem => ({ id, label, status: "warn", detail, hint });
  const skipped = (id: string, label: string, hint: string): DiagnosticItem => ({ id, label, status: "skipped", detail: "Prüfung wurde übersprungen.", hint });
  const safe = async (id: string, label: string, action: () => Promise<boolean>, hint: string): Promise<DiagnosticItem> => {
    try { return await action() ? passed(id, label) : warned(id, label, hint); }
    catch { return warned(id, label, hint, "Die Prüfung konnte nicht abgeschlossen werden."); }
  };
  const items: DiagnosticItem[] = [];
  items.push(existsSync(settings.hermes.cliPath) ? passed("cli", "Hermes-CLI gefunden") : warned("cli", "Hermes-CLI gefunden", "Hermes installieren oder HERMES_CLI_PATH prüfen."));
  items.push(existsSync(settings.hermes.checkoutDirectory) && existsSync(settings.hermes.pythonPath) ? passed("checkout", "Hermes-Checkout und Python-Umgebung") : warned("checkout", "Hermes-Checkout und Python-Umgebung", "Die Hermes-Umgebung neu installieren."));
  items.push(await safe("home", "HERMES_HOME erkannt und beschreibbar", async () => { await new Promise<void>((resolvePromise, reject) => access(settings.hermes.homeDirectory, fsConstants.R_OK | fsConstants.W_OK, (error) => error ? reject(error) : resolvePromise())); return true; }, "HERMES_HOME prüfen und Schreibrechte wiederherstellen."));
  items.push(await safe("git", "Checkout und Git-Zustand sauber", async () => {
    const result = await execFileAsync("git", ["-C", settings.hermes.checkoutDirectory, "status", "--short"], { timeout: 5_000, maxBuffer: 64 * 1024 });
    return result.stdout.trim().length === 0;
  }, "Lokale Hermes-Änderungen prüfen, bevor ein Update ausgeführt wird."));
  items.push(status.dashboard.state === "active" ? passed("dashboard-unit", "Dashboard-Unit aktiv") : warned("dashboard-unit", "Dashboard-Unit aktiv", "Dashboard starten oder Diagnose öffnen."));
  items.push(status.dashboard.reachable ? passed("dashboard-http", "Dashboard-HTTP erreichbar") : warned("dashboard-http", "Dashboard-HTTP erreichbar", "Dashboard neu starten."));
  items.push(existsSync(join(settings.hermes.checkoutDirectory, "hermes_cli/web_dist/index.html")) ? passed("dashboard-spa", "Dashboard-SPA gebaut") : warned("dashboard-spa", "Dashboard-SPA gebaut", "Dashboard neu bauen und den Update-Lauf erneut ausführen."));
  items.push(await safe("token", "Session-Token abrufbar", async () => { await options.client.get("/api/config"); return true; }, "Dashboard neu starten und Token-Diagnose wiederholen."));
  items.push(await safe("proxy", "Proxy-Präfix erreichbar", async () => {
    const identity = settings.terminalAllowedUsers[0] ?? settings.developmentTailscaleUser ?? "";
    if (!identity) return false;
    const response = await fetch(`http://127.0.0.1:${settings.port}${settings.hermes.proxyPrefix}/`, { headers: { "tailscale-user-login": identity } });
    return response.ok;
  }, "Workbench-Proxy und Hermes-Host-Header prüfen."));
  items.push(status.chat.transport === "acp" ? passed("chat-transport", "Chat-Transport ACP verfügbar") : skipped("chat-transport", "Chat-Transport ACP verfügbar", "Hermes-ACP installieren oder prüfen."));
  items.push(status.chat.ready ? passed("acp-process", "ACP-Prozess läuft") : warned("acp-process", "ACP-Prozess läuft", "Im Chat erneut verbinden oder Hermes-ACP prüfen."));
  items.push(await safe("acp-check", "ACP-Abhängigkeiten", async () => {
    await execFileAsync(settings.hermes.cliPath, ["acp", "--check"], { cwd: settings.hermes.checkoutDirectory, env: { ...process.env, HERMES_HOME: settings.hermes.homeDirectory }, timeout: 15_000, maxBuffer: 128 * 1024 });
    return true;
  }, "Hermes-ACP-Abhängigkeiten reparieren."));
  items.push(status.gateway.state === "active" ? passed("gateway-unit", "Gateway-Unit aktiv") : warned("gateway-unit", "Gateway-Unit aktiv", "Gateway starten."));
  items.push(status.gateway.telegramConnected === true ? passed("telegram", "Telegram verbunden") : status.gateway.telegramConnected === null ? warned("telegram", "Telegram verbunden", "Gateway-Status und Telegram-Konfiguration prüfen.") : warned("telegram", "Telegram verbunden", "Gateway neu starten und Telegram-Verbindung prüfen."));
  items.push(status.provider && status.model ? passed("model", "Anbieter und Modell gesetzt") : warned("model", "Anbieter und Modell gesetzt", "In der Verwaltung ein Modell auswählen."));
  items.push(await safe("sessions", "Sessions-Datenbank erreichbar", async () => { await options.client.get("/api/sessions?limit=1"); return true; }, "Dashboard-Sessions-API prüfen."));
  items.push(await safe("cron", "Cron-Scheduler erreichbar", async () => { await options.client.get("/api/cron/jobs"); return true; }, "Cron-Verwaltung und Dashboard-Token prüfen."));
  items.push(await safe("skills", "Skills erreichbar", async () => { await options.client.get("/api/skills"); return true; }, "Skills-Seite in der offiziellen Verwaltung öffnen."));
  const update = readHermesUpdateState();
  items.push(update.lastResult === "failed" ? warned("update", "Update-Zustand", "Update-Logs prüfen und bei Bedarf den Rollback ausführen.", "Der letzte Hermes-Update-Lauf ist fehlgeschlagen.") : passed("update", "Update-Zustand"));
  items.push(update.logTail.length > 0 ? passed("update-logs", "Letzte Update-Logs vorhanden") : skipped("update-logs", "Letzte Update-Logs vorhanden", "Nach dem nächsten Update-Lauf stehen redigierte Logs bereit."));
  items.push(await safe("doctor", "Hermes Doctor", async () => {
    await execFileAsync(settings.hermes.cliPath, ["doctor"], { cwd: settings.hermes.checkoutDirectory, env: { ...process.env, HERMES_HOME: settings.hermes.homeDirectory }, timeout: 30_000, maxBuffer: 256 * 1024 });
    return true;
  }, "Hermes Doctor ausführen und die Konfiguration prüfen."));
  items.push(await safe("cursor", "Ergebnis-Synchronisierung aktuell", async () => {
    const cursorPath = join(settings.dataDirectory, "hermes/result-cursor.json");
    if (!existsSync(cursorPath)) return true;
    const cursor = JSON.parse(readFileSync(cursorPath, "utf8")) as { initialized?: unknown };
    return cursor.initialized === true;
  }, "Ergebnis-Synchronisierung starten oder Dashboard-Erreichbarkeit prüfen."));
  items.push(await safe("approvals", "Approval-Konfiguration", async () => {
    const yaml = readFileSync(join(settings.hermes.homeDirectory, "config.yaml"), "utf8");
    return /(^|\n)\s*mode:\s*ask\s*(?:\n|$)/.test(yaml) && !/command_allowlist:\s*\n\s+-/.test(yaml);
  }, "approvals.mode auf ask setzen und dauerhafte gefährliche Freigaben entfernen."));
  return { checkedAt: new Date().toISOString(), items };
}
