import type { FastifyInstance, FastifyRequest } from "fastify";
import { ZodError, z } from "zod";
import { saveTerminalWorkspaceRequestSchema, terminalWorkspaceSchema } from "@workbench/contracts";
import { AppError } from "../utils/errors.js";
import { TerminalFailure } from "./Manager.js";
import type { TerminalManager } from "./Manager.js";
import type { TerminalDatabase } from "./database.js";
import { clientTerminalMessageSchema, type ServerTerminalMessage, type TerminalErrorCode } from "./protocol.js";
import { isSameOriginRequest } from "../security/same-origin.js";

function terminalIdentity(request: FastifyRequest, allowedUsers: readonly string[]): string {
  const rawIdentity = request.headers["tailscale-user-login"];
  const identity = (Array.isArray(rawIdentity) ? rawIdentity[0] : rawIdentity)?.trim().toLowerCase();
  if (!identity) throw new TerminalFailure("UNAUTHORIZED", "Für den Terminalzugriff ist eine Tailscale-Anmeldung erforderlich.");
  if (!allowedUsers.includes(identity)) throw new TerminalFailure("FORBIDDEN", "Dieser Benutzer darf kein Terminal öffnen.");
  return identity;
}

function errorMessage(error: unknown): { code: TerminalErrorCode; message: string } {
  if (error instanceof TerminalFailure) return { code: error.code, message: error.message };
  if (error instanceof ZodError) return { code: "INVALID_MESSAGE", message: "Die Terminalnachricht ist ungültig." };
  return { code: "INTERNAL_ERROR", message: "Die Terminalanfrage konnte nicht verarbeitet werden." };
}

function httpIdentity(request: FastifyRequest, allowedUsers: readonly string[]) {
  try { return terminalIdentity(request, allowedUsers); }
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
    managed: session.supervisorName?.startsWith("workbench-") ?? false,
    connectedClients: session.connectedClients,
  };
}

export async function registerTerminalRoutes(app: FastifyInstance, options: {
  manager: TerminalManager;
  database?: TerminalDatabase;
  allowedUsers: readonly string[];
  resolveProjectPath?: (projectId: string) => Promise<string>;
}) {
  app.get("/terminal/sessions", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers);
    return { sessions: options.manager.listSessions(userId).map(sessionResponse), updatedAt: new Date().toISOString() };
  });
  app.get("/terminal/workspace", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers);
    if (!options.database) throw new AppError(500, "INTERNAL_ERROR", "Die Terminal-Registry ist nicht verfügbar.");
    return options.database.getWorkspace(userId);
  });
  app.put("/terminal/workspace", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers);
    if (!options.database) throw new AppError(500, "INTERNAL_ERROR", "Die Terminal-Registry ist nicht verfügbar.");
    const parsed = saveTerminalWorkspaceRequestSchema.parse(request.body);
    return options.database.saveWorkspace(userId, terminalWorkspaceSchema.parse(parsed.document), parsed.expectedRevision);
  });
  app.post("/terminal/sessions/:sessionId/restart", async (request) => {
    const userId = httpIdentity(request, options.allowedUsers);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const session = options.manager.restartSession(userId, sessionId);
    return { session: options.manager.getSessionMetadata(userId, session.id) };
  });
  app.delete("/terminal/sessions/:sessionId", async (request, reply) => {
    const userId = httpIdentity(request, options.allowedUsers);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    options.manager.closeSession(userId, sessionId);
    return reply.status(204).send();
  });

  app.get("/terminal", { websocket: true }, (socket, request) => {
    let userId: string;
    try {
      if (!isSameOriginRequest(request)) throw new TerminalFailure("FORBIDDEN", "Terminal-WebSockets sind nur vom Workbench-Origin erlaubt.");
      userId = terminalIdentity(request, options.allowedUsers);
    }
    catch (error) {
      const failure = errorMessage(error);
      socket.send(JSON.stringify({ type: "terminal.error", ...failure } satisfies ServerTerminalMessage));
      socket.close(1008, failure.code);
      return;
    }
    const send = (message: ServerTerminalMessage) => { if (socket.readyState === 1) socket.send(JSON.stringify(message)); };
    let detach: (() => void) | undefined;
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
                ...(projectCwd !== undefined ? { cwd: projectCwd } : message.cwd === undefined ? {} : { cwd: message.cwd }),
              });
            })();
            void session.then((created) => send({ type: "terminal.created", requestId: message.requestId, sessionId: created.id, runtimeId: created.runtimeId, kind: created.kind, projectId: created.projectId, status: created.status, cwd: created.cwd, pid: created.pid })).catch((error) => send({ type: "terminal.error", ...errorMessage(error) }));
            break;
          }
          case "terminal.attach": detach?.(); detach = options.manager.attachSession(userId, message.sessionId, send); break;
          case "terminal.input": options.manager.writeToSession(userId, message.sessionId, message.data); break;
          case "terminal.resize": options.manager.resizeSession(userId, message.sessionId, message.cols, message.rows); break;
          case "terminal.clear": options.manager.clearSessionHistory(userId, message.sessionId); break;
          case "terminal.restart": options.manager.restartSession(userId, message.sessionId); break;
          case "terminal.close": options.manager.closeSession(userId, message.sessionId); detach?.(); detach = undefined; break;
          case "terminal.ping": send({ type: "terminal.pong" }); break;
        }
      } catch (error) { send({ type: "terminal.error", ...errorMessage(error) }); }
    });
    socket.on("close", () => { detach?.(); });
    socket.on("error", () => { detach?.(); });
  });
}
