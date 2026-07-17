import type { FastifyInstance, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { TerminalFailure } from "./Manager.js";
import type { TerminalManager } from "./Manager.js";
import { clientTerminalMessageSchema, type ServerTerminalMessage, type TerminalErrorCode } from "./protocol.js";

function terminalIdentity(request: FastifyRequest, allowedUsers: readonly string[]): string {
  // Tailscale Serve injects this header after authenticating the tailnet user.
  // The backend binds to localhost, so a remote client cannot forge it directly.
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

export async function registerTerminalRoutes(app: FastifyInstance, options: {
  manager: TerminalManager;
  allowedUsers: readonly string[];
  resolveProjectPath?: (projectId: string) => Promise<string>;
}) {
  app.get("/terminal", { websocket: true }, (socket, request) => {
    let userId: string;
    try { userId = terminalIdentity(request, options.allowedUsers); } catch (error) {
      const failure = errorMessage(error);
      socket.send(JSON.stringify({ type: "terminal.error", ...failure } satisfies ServerTerminalMessage));
      socket.close(1008, failure.code);
      return;
    }
    const send = (message: ServerTerminalMessage) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(message));
    };
    let detach: (() => void) | undefined;
    socket.on("message", (raw: unknown) => {
      try {
        if (typeof raw !== "string" && !Buffer.isBuffer(raw)) throw new TerminalFailure("INVALID_MESSAGE", "Die Terminalnachricht ist ungültig.");
        const message = clientTerminalMessageSchema.parse(JSON.parse(raw.toString()));
        switch (message.type) {
          case "terminal.create": {
            const session = awaitable((async () => {
              const projectCwd = message.projectId && options.resolveProjectPath
                ? await options.resolveProjectPath(message.projectId)
                : undefined;
              return options.manager.createSession(userId, {
                kind: message.kind,
                cols: message.cols,
                rows: message.rows,
                mode: message.mode,
                ...(message.accountId ? { accountId: message.accountId } : {}),
                ...(projectCwd !== undefined
                  ? { cwd: projectCwd }
                  : message.cwd === undefined ? {} : { cwd: message.cwd }),
              });
            })());
            void session.then((created) => send({ type: "terminal.created", requestId: message.requestId, sessionId: created.id, kind: created.kind, cwd: created.cwd, pid: created.pid })).catch((error) => send({ type: "terminal.error", ...errorMessage(error) }));
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

function awaitable<T>(promise: Promise<T>): Promise<T> { return promise; }
