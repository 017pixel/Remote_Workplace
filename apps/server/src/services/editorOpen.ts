import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";
import { editorOpenEventSchema, editorOpenRequestSchema } from "@wrapt/contracts";
import { isSameOriginRequest } from "../security/same-origin.js";

/**
 * „Open in Editor" aus T3 Code: T3 sucht auf dem Server ein `code`-Binary im
 * PATH (Command O, Diff-Panel). Das Shim-Skript `code` meldet den angefragten
 * Pfad per HTTP an die Workbench. Diese leitet ihn per WebSocket an die
 * Browser-Sitzungen weiter, die den code-server mit dem Zielordner öffnen.
 *
 * Der Weg ist bewusst schmal: Loopback plus Capability-Token, kein Browser-
 * Zustand auf dem Server. Der Endpunkt setzt nie Dateisystemoperationen um —
 * er reicht nur einen Pfad durch.
 */

const editorTokenFile = "editor-open-capability";
const maxClients = 64;
const connected = new Set<WebSocket>();

function isLoopback(request: FastifyRequest): boolean {
  const address = request.ip;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export class EditorOpenSecrets {
  private readonly dataDirectory: string;
  private cached: string | null = null;

  constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  /**
   * Capability-Token für das lokale `code`-Shim. Die Kodierung entspricht
   * exakt dem Dateiinhalt, damit das Shim die Datei unverändert als
   * Bearer-Token senden kann.
   */
  token(): string {
    if (this.cached) return this.cached;
    const path = join(this.dataDirectory, editorTokenFile);
    mkdirSync(this.dataDirectory, { recursive: true, mode: 0o700 });
    const readExisting = () => {
      const material = Buffer.from(readFileSync(path, "utf8").trim(), "base64");
      if (material.byteLength !== 32) {
        throw new Error(`Die Editor-Capability-Datei ist beschädigt.`);
      }
      chmodSync(path, 0o600);
      return material.toString("base64");
    };
    let material: string;
    try {
      material = readExisting();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const generated = randomBytes(32).toString("base64");
      try {
        writeFileSync(path, `${generated}\n`, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
          flush: true,
        });
        material = generated;
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
        material = readExisting();
      }
    }
    this.cached = material;
    return material;
  }

  matchesToken(candidate: string): boolean {
    const expected = Buffer.from(this.token());
    const given = Buffer.from(candidate);
    return expected.byteLength === given.byteLength && timingSafeEqual(expected, given);
  }
}

/**
 * Normalisiert einen Zielpfad: Auf eine Datei wird deren Ordner verstanden
 * (der code-server öffnet Ordner, keine Dateien). Relative Pfade werden vom
 * Shim nicht gesendet und hier abgelehnt.
 */
export function normalizeEditorTarget(path: string): string {
  if (!path.startsWith("/")) return path;
  const normalized = normalize(path);
  if (normalized === "/" || normalized.endsWith(`${sep}.`)) return normalized;
  try {
    // Existiert der Pfad als Datei, öffnet der code-server den übergeordneten
    // Ordner. Nicht existierende Pfade bleiben unverändert.
    if (statSync(normalized).isFile()) return dirname(normalized);
  } catch { /* Pfad existiert nicht — unverändert lassen. */ }
  return normalized;
}

export async function registerEditorOpenRoutes(app: FastifyInstance, options: {
  secrets: EditorOpenSecrets;
}) {
  const secrets = options.secrets;
  // Token beim Start anlegen, damit das Shim sofort arbeiten kann.
  secrets.token();

  app.post("/editor/open", async (request, reply) => {
    if (!isLoopback(request)) {
      return reply.status(403).send({ error: { code: "EDITOR_OPEN_FORBIDDEN", message: "Nur Loopback-Aufrufe sind erlaubt.", details: null, requestId: request.id, retryable: false } });
    }
    const authorization = request.headers.authorization;
    const token = typeof authorization === "string" ? authorization.replace(/^Bearer\s+/i, "") : "";
    if (!token || !secrets.matchesToken(token)) {
      return reply.status(401).send({ error: { code: "EDITOR_OPEN_UNAUTHORIZED", message: "Fehlendes oder ungültiges Capability-Token.", details: null, requestId: request.id, retryable: false } });
    }
    const parsed = editorOpenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: "EDITOR_OPEN_INVALID", message: "Der Pfad muss absolut sein.", details: null, requestId: request.id, retryable: false } });
    }
    const path = normalizeEditorTarget(parsed.data.path);
    const event = editorOpenEventSchema.parse({ type: "editor.open", path });
    const payload = JSON.stringify(event);
    for (const socket of connected) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
    return reply.status(202).send({ accepted: true });
  });

  app.get("/editor/ws", { websocket: true }, (socket, request) => {
    if (!isSameOriginRequest(request)) {
      socket.close(1008, "FORBIDDEN");
      return;
    }
    if (connected.size >= maxClients) {
      socket.close(1013, "TOO_MANY_CLIENTS");
      return;
    }
    connected.add(socket);
    socket.on("close", () => connected.delete(socket));
    socket.on("error", () => connected.delete(socket));
    socket.send(JSON.stringify({ type: "editor.ready" }));
  });
}
