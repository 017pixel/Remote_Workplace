import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { ZodError, z } from "zod";
import { saveTerminalWorkspaceRequestSchema, terminalWorkspaceOpsRequestSchema, terminalWorkspaceSchema, terminalWorkspaceV2Schema } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { TerminalFailure } from "./Manager.js";
import type { TerminalManager } from "./Manager.js";
import type { TerminalDatabase } from "./database.js";
import { clientTerminalMessageSchema, type ServerTerminalMessage, type TerminalErrorCode } from "./protocol.js";
import { TerminalWorkspaceService } from "./workspace/TerminalWorkspaceService.js";
import { migrateTerminalWorkspaceV1 } from "./workspace/terminalWorkspaceMigrations.js";
import { isSameOriginRequest } from "../security/same-origin.js";
import { createWebSocketSendQueue } from "../utils/websocketSendQueue.js";

function terminalIdentity(request: FastifyRequest, allowedUsers: readonly string[], developmentUser?: string): string {
  const rawIdentity = request.headers["tailscale-user-login"];
  const identity = ((Array.isArray(rawIdentity) ? rawIdentity[0] : rawIdentity)?.trim().toLowerCase() || developmentUser?.trim().toLowerCase());
  if (!identity) throw new TerminalFailure("UNAUTHORIZED", "Für den Terminalzugriff ist eine Tailscale-Anmeldung erforderlich.");
  if (!allowedUsers.includes(identity)) throw new TerminalFailure("FORBIDDEN", "Dieser Benutzer darf kein Terminal öffnen.");
  return identity;
}

function errorMessage(error: unknown): { code: TerminalErrorCode; message: string } {
  if (error instanceof TerminalFailure) return { code: error.code, message: error.message };
  if (error instanceof ZodError) return { code: "INVALID_MESSAGE", message: "Die Terminalnachricht ist ungültig." };
  return { code: "INTERNAL_ERROR", message: "Die Terminalanfrage konnte nicht verarbeitet werden." };
}

function httpIdentity(request: FastifyRequest, allowedUsers: readonly string[], developmentUser?: string) {
  try { return terminalIdentity(request, allowedUsers, developmentUser); }
  catch (error) {
    const failure = errorMessage(error);
    const status = failure.code === "UNAUTHORIZED" ? 401 : failure.code === "FORBIDDEN" ? 403 : 400;
    throw new AppError(status, failure.code, failure.message);
  }
}

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });

function sessionResponse(session: ReturnType<TerminalManager["listSessions"]>[number]) {
  return {
    id: session.id,
    runtimeId: session.runtimeId,
    kind: session.kind,
    mode: session.mode,
    projectId: session.projectId,
    cwd: session.cwd,
    pid: session.pid,
    cols: session.cols,
    rows: session.rows,
    status: session.status,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
    exitCode: session.exitCode,
    exitSignal: session.exitSignal,
    supervisor: session.supervisorName ? "tmux" as const : "direct" as const,
    managed: session.supervisorName?.startsWith("wrapt-") || session.supervisorName?.startsWith("workbench-") || false,
    connectedClients: session.connectedClients,
  };
}

export async function registerTerminalRoutes(app: FastifyInstance, options: {
  manager: TerminalManager;
  database?: TerminalDatabase;
  allowedUsers: readonly string[];
  developmentUser?: string;
  resolveProjectPath?: (projectId: string) => Promise<string>;
}) {
  app.get("/terminal/sessions", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers, options.developmentUser);
    return { sessions: options.manager.listSessions(userId).map(sessionResponse), updatedAt: new Date().toISOString() };
  });
  app.get("/terminal/workspace", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers, options.developmentUser);
    if (!options.database) throw new AppError(500, "INTERNAL_ERROR", "Die Terminal-Registry ist nicht verfügbar.");
    return options.database.getWorkspace(userId);
  });
  app.put("/terminal/workspace", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers, options.developmentUser);
    if (!options.database) throw new AppError(500, "INTERNAL_ERROR", "Die Terminal-Registry ist nicht verfügbar.");
    const parsed = saveTerminalWorkspaceRequestSchema.parse(request.body);
    const document = parsed.document.version === 1
      ? migrateTerminalWorkspaceV1(terminalWorkspaceSchema.parse(parsed.document))
      : terminalWorkspaceV2Schema.parse(parsed.document);
    return options.database.saveWorkspace(userId, document, parsed.expectedRevision);
  });
  // Serverseitige Workspace-Operationen: verlustfreie, transaktionale
  // Mutationen statt blindem Überschreiben des ganzen Dokuments.
  app.post("/terminal/workspace/ops", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers, options.developmentUser);
    if (!options.database) throw new AppError(500, "INTERNAL_ERROR", "Die Terminal-Registry ist nicht verfügbar.");
    const parsed = terminalWorkspaceOpsRequestSchema.parse(request.body);
    const current = options.database.getWorkspace(userId);
    if (current.revision !== parsed.expectedRevision) {
      throw new AppError(409, "TERMINAL_WORKSPACE_CONFLICT", "Das Terminal-Layout wurde auf einem anderen Gerät geändert.");
    }
    const service = new TerminalWorkspaceService();
    const updated = service.applyOperations(current.document, parsed.operations);
    return options.database.saveWorkspace(userId, updated, parsed.expectedRevision);
  });
  app.post("/terminal/sessions/:sessionId/restart", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers, options.developmentUser);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const session = options.manager.restartSession(userId, sessionId);
    return { session: options.manager.getSessionMetadata(userId, session.id) };
  });
  app.delete("/terminal/sessions/:sessionId", async (request, reply) => {
    const userId = httpIdentity(request, options.allowedUsers, options.developmentUser);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    options.manager.closeSession(userId, sessionId);
    return reply.status(204).send();
  });

  app.get("/terminal", { websocket: true }, (socket, request) => {
    let userId: string;
    try {
      if (!isSameOriginRequest(request)) throw new TerminalFailure("FORBIDDEN", "Terminal-WebSockets sind nur vom Workbench-Origin erlaubt.");
      userId = terminalIdentity(request, options.allowedUsers, options.developmentUser);
    }
    catch (error) {
      const failure = errorMessage(error);
      socket.send(JSON.stringify({ type: "terminal.error", ...failure } satisfies ServerTerminalMessage));
      socket.close(1008, failure.code);
      return;
    }
    const sendQueue = createWebSocketSendQueue<ServerTerminalMessage>({ socket, maxQueueBytes: 8 * 1024 * 1024 });
    const send = (message: ServerTerminalMessage) => { sendQueue.send(message); };
    const clientId = randomUUID();
    // Multiplexter Socket: Ein Browser-Tab hält einen WebSocket und mehrere
    // Runtime-Subscriptions. Jede Subscription besitzt ihren eigenen Detach.
    const subscriptions = new Map<string, () => void>();
    const detachSubscription = (runtimeId: string) => {
      const detach = subscriptions.get(runtimeId);
      if (detach) { detach(); subscriptions.delete(runtimeId); }
    };
    const sessionOf = (runtimeId: string) => options.manager.resolveRuntime(userId, runtimeId);
    socket.on("message", (raw: unknown) => {
      try {
        if (typeof raw !== "string" && !Buffer.isBuffer(raw)) throw new TerminalFailure("INVALID_MESSAGE", "Die Terminalnachricht ist ungültig.");
        const message = clientTerminalMessageSchema.parse(JSON.parse(raw.toString()));
        switch (message.type) {
          case "terminal.create": {
            const session = (async () => {
              const projectCwd = message.projectId && options.resolveProjectPath ? await options.resolveProjectPath(message.projectId) : undefined;
              return options.manager.createSession(userId, {
                ...(message.runtimeId ? { runtimeId: message.runtimeId } : {}),
                kind: message.kind,
                projectId: message.projectId ?? null,
                cols: message.cols,
                rows: message.rows,
                mode: message.mode,
                ...(message.accountId ? { accountId: message.accountId } : {}),
                clientId,
                ...(message.cwd !== undefined ? { cwd: message.cwd } : projectCwd !== undefined ? { cwd: projectCwd } : {}),
              });
            })();
            void session.then((created) => send({ type: "terminal.created", requestId: message.requestId, sessionId: created.id, runtimeId: created.runtimeId, kind: created.kind, projectId: created.projectId, status: created.status, cwd: created.cwd, pid: created.pid })).catch((error) => send({ type: "terminal.error", ...errorMessage(error) }));
            break;
          }
          case "terminal.attach": {
            const viewport = message.cols !== undefined && message.rows !== undefined ? { cols: message.cols, rows: message.rows } : undefined;
            const session = options.manager.resolveSession(userId, message.sessionId);
            const detach = options.manager.attachSession(userId, session.id, send, clientId, viewport);
            subscriptions.set(session.runtimeId, detach);
            break;
          }
          case "terminal.subscribe": {
            const session = sessionOf(message.runtimeId);
            detachSubscription(session.runtimeId);
            const viewport = message.cols !== undefined && message.rows !== undefined ? { cols: message.cols, rows: message.rows } : undefined;
            const detach = options.manager.attachSession(userId, session.id, send, clientId, viewport, message.state ?? null);
            subscriptions.set(session.runtimeId, detach);
            break;
          }
          case "terminal.unsubscribe": detachSubscription(message.runtimeId); break;
          case "terminal.sync": {
            const session = sessionOf(message.runtimeId);
            options.manager.syncSession(userId, session.id, clientId, message.state);
            break;
          }
          case "terminal.takeControl": {
            const session = sessionOf(message.runtimeId);
            options.manager.takeControl(userId, session.id, clientId, message.cols, message.rows);
            break;
          }
          case "terminal.input":
            options.manager.activateClient(userId, message.sessionId, clientId);
            options.manager.writeToSession(userId, message.sessionId, message.data);
            break;
          case "terminal.resize":
            // Ein ResizeObserver darf niemals allein den Primary-Status übernehmen.
            // Resize meldet nur den lokalen Wunsch-Viewport; die PTY übernimmt ihn
            // nur, wenn dieser Client bereits Primary ist. Der Primary wechselt
            // ausschließlich über echte Interaktion (Eingabe) oder beim Trennen.
            options.manager.resizeSession(userId, message.sessionId, message.cols, message.rows, clientId);
            break;
          case "terminal.clear": options.manager.clearSessionHistory(userId, message.sessionId); break;
          case "terminal.restart": options.manager.restartSession(userId, message.sessionId); break;
          case "terminal.close": {
            const session = options.manager.resolveSession(userId, message.sessionId);
            const runtimeId = session.runtimeId;
            options.manager.closeSession(userId, message.sessionId);
            detachSubscription(runtimeId);
            break;
          }
          case "terminal.ping": send({ type: "terminal.pong" }); break;
        }
      } catch (error) {
        // Auf dem multiplexten Socket trägt der Fehler die Runtime-ID des
        // auslösenden Clients, damit der Transport ihn der richtigen
        // Subscription zuordnen kann (z. B. SESSION_NOT_FOUND beim Subscribe).
        let runtimeId: string | undefined;
        try {
          const rawMessage = typeof raw === "string" ? JSON.parse(raw) : Buffer.isBuffer(raw) ? JSON.parse(raw.toString()) : null;
          if (rawMessage && typeof rawMessage === "object" && "runtimeId" in rawMessage && typeof (rawMessage as { runtimeId?: unknown }).runtimeId === "string") {
            runtimeId = (rawMessage as { runtimeId: string }).runtimeId;
          }
        } catch { /* Ohne Runtime-ID bleibt der Fehler socketweit. */ }
        send({ type: "terminal.error", ...(runtimeId ? { runtimeId } : {}), ...errorMessage(error) });
      }
    });
    socket.on("close", () => {
      for (const detach of subscriptions.values()) detach();
      subscriptions.clear();
      sendQueue.dispose();
      options.manager.detachClient(userId, clientId);
    });
    socket.on("error", () => {
      for (const detach of subscriptions.values()) detach();
      subscriptions.clear();
      sendQueue.dispose();
      options.manager.detachClient(userId, clientId);
    });
  });
}
