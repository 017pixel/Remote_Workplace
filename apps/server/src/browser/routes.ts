import type { FastifyInstance, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import WebSocket from "ws";
import { BrowserFailure } from "./Manager.js";
import type { BrowserManager } from "./Manager.js";
import { clientBrowserMessageSchema, type BrowserErrorCode, type ServerBrowserMessage } from "./protocol.js";

function browserIdentity(request: FastifyRequest, allowedUsers: readonly string[]): string {
  const rawIdentity = request.headers["tailscale-user-login"];
  const identity = (Array.isArray(rawIdentity) ? rawIdentity[0] : rawIdentity)?.trim().toLowerCase();
  if (!identity) throw new Error("UNAUTHORIZED");
  if (!allowedUsers.includes(identity)) throw new Error("FORBIDDEN");
  return identity;
}

function errorMessage(error: unknown): { code: BrowserErrorCode; message: string } {
  if (error instanceof BrowserFailure) return { code: error.code, message: error.message };
  if (error instanceof ZodError) return { code: "INVALID_MESSAGE", message: "Die Browsernachricht ist ungültig." };
  if (error instanceof Error && error.message === "UNAUTHORIZED") return { code: "UNAUTHORIZED", message: "Für den Browserzugriff ist eine Tailscale-Anmeldung erforderlich." };
  if (error instanceof Error && error.message === "FORBIDDEN") return { code: "FORBIDDEN", message: "Dieser Benutzer darf keinen Browser öffnen." };
  return { code: "INTERNAL_ERROR", message: "Die Browseranfrage konnte nicht verarbeitet werden." };
}

export async function registerBrowserRoutes(app: FastifyInstance, options: { manager: BrowserManager; allowedUsers: readonly string[] }) {
  app.get("/browser", { websocket: true }, (socket, request) => {
    let userId: string;
    try { userId = browserIdentity(request, options.allowedUsers); } catch (error) {
      const failure = errorMessage(error);
      socket.send(JSON.stringify({ type: "browser.error", ...failure } satisfies ServerBrowserMessage));
      socket.close(1008, failure.code);
      return;
    }
    const send = (message: ServerBrowserMessage) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(message));
    };
    let detach: (() => void) | undefined;
    socket.on("message", (raw: unknown) => {
      void (async () => {
        try {
          if (typeof raw !== "string" && !Buffer.isBuffer(raw)) throw new Error("INVALID_MESSAGE");
          const message = clientBrowserMessageSchema.parse(JSON.parse(raw.toString()));
          switch (message.type) {
            case "browser.create": {
              detach?.();
              const attached = await options.manager.createOrAttach(userId, message.instanceId, message.width, message.height, send, message.requestId);
              detach = attached.detach;
              break;
            }
            case "browser.attach": {
              detach?.();
              detach = options.manager.attach(userId, message.sessionId, message.width, message.height, send).detach;
              break;
            }
            case "browser.close": await options.manager.closeSession(userId, message.sessionId); detach?.(); detach = undefined; break;
            case "browser.ping": send({ type: "browser.pong" }); break;
            default: await options.manager.command(userId, message); break;
          }
        } catch (error) {
          send({ type: "browser.error", ...errorMessage(error) });
        }
      })();
    });
    socket.on("close", () => detach?.());
    socket.on("error", () => detach?.());
  });

  app.get<{ Params: { sessionId: string } }>("/browser/devtools/:sessionId", { websocket: true }, (socket, request) => {
    let endpoint: ReturnType<BrowserManager["openDevtoolsSocket"]>;
    try {
      const userId = browserIdentity(request, options.allowedUsers);
      endpoint = options.manager.openDevtoolsSocket(userId, request.params.sessionId);
    } catch (error) {
      const failure = errorMessage(error);
      socket.close(1008, failure.code);
      return;
    }

    const upstream = new WebSocket(endpoint.browserUrl);
    const pending: Array<Record<string, unknown>> = [];
    let cdpSessionId = "";
    socket.on("message", (raw: unknown) => {
      try {
        const command = JSON.parse((typeof raw === "string" || Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)).toString()) as Record<string, unknown>;
        if (cdpSessionId && upstream.readyState === 1) upstream.send(JSON.stringify({ ...command, sessionId: cdpSessionId }));
        else pending.push(command);
      } catch {
        socket.close(1003, "Ungültige DevTools-Nachricht");
      }
    });
    upstream.once("open", () => {
      upstream.send(JSON.stringify({ id: -1, method: "Target.attachToTarget", params: { targetId: endpoint.targetId, flatten: true } }));
    });
    upstream.on("message", (raw) => {
      let message: Record<string, unknown>;
      try { message = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return; }
      if (message.id === -1) {
        const result = message.result as { sessionId?: unknown } | undefined;
        cdpSessionId = typeof result?.sessionId === "string" ? result.sessionId : "";
        if (!cdpSessionId) { socket.close(1011, "DevTools-Ziel konnte nicht verbunden werden"); return; }
        for (const command of pending.splice(0)) upstream.send(JSON.stringify({ ...command, sessionId: cdpSessionId }));
        return;
      }
      if (message.sessionId !== cdpSessionId || socket.readyState !== 1) return;
      const frontendMessage = { ...message };
      delete frontendMessage.sessionId;
      socket.send(JSON.stringify(frontendMessage));
    });
    upstream.on("close", () => {
      if (socket.readyState === 1) socket.close(1000, "DevTools-Verbindung geschlossen");
    });
    upstream.on("error", () => {
      if (socket.readyState === 1) socket.close(1011, "DevTools-Verbindung fehlgeschlagen");
    });
    socket.on("close", () => upstream.close());
    socket.on("error", () => upstream.close());
  });
}
