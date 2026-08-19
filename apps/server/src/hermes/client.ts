import { hermesErrorCodeSchema, type HermesErrorCode } from "@wrapt/contracts";
import { settings } from "../config/settings.js";
import { redactSensitive } from "./redaction.js";
import { HermesSessionToken, hermesAuthority } from "./token.js";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export class HermesClientError extends Error {
  constructor(
    readonly code: HermesErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly retryable = code === "DASHBOARD_UNREACHABLE" || code === "INTERNAL_ERROR",
  ) {
    super(message);
    this.name = "HermesClientError";
  }
}

function mapError(status: number | null, fallback: string): HermesErrorCode {
  if (status === 401 || status === 403) return "DASHBOARD_UNREACHABLE";
  if (status === 404) return "SESSION_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status !== null && status >= 500) return "DASHBOARD_UNREACHABLE";
  return hermesErrorCodeSchema.safeParse(fallback).success ? fallback as HermesErrorCode : "INTERNAL_ERROR";
}

async function readResponseBody(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new HermesClientError("INTERNAL_ERROR", "Die Hermes-Antwort ist zu groß.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new HermesClientError("INTERNAL_ERROR", "Die Hermes-Antwort ist zu groß.");
  return Buffer.from(buffer).toString("utf8");
}

export class HermesDashboardClient {
  readonly token = new HermesSessionToken();

  private async requestJson(path: string, init: RequestInit = {}, retry = true): Promise<unknown> {
    if (!path.startsWith("/api/") && path !== "/") throw new HermesClientError("INTERNAL_ERROR", "Ungültiger Hermes-Pfad.");
    const upstream = `http://${hermesAuthority()}${path}`;
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Host", hermesAuthority());
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    const needsToken = path.startsWith("/api/") && ![
      "/api/status", "/api/config/defaults", "/api/config/schema", "/api/model/info",
      "/api/dashboard/themes", "/api/dashboard/plugins", "/api/dashboard/plugins/rescan",
    ].includes(path.split("?", 1)[0] ?? path);
    if (needsToken) headers.set("X-Hermes-Session-Token", await this.token.get());

    let response: Response;
    try {
      response = await fetch(upstream, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(settings.hermes.requestTimeoutSeconds * 1_000),
      });
    } catch {
      throw new HermesClientError("DASHBOARD_UNREACHABLE", "Das Hermes-Dashboard ist nicht erreichbar.");
    }
    if (response.status === 401 && retry) {
      this.token.invalidate();
      return this.requestJson(path, init, false);
    }
    const body = await readResponseBody(response);
    if (!response.ok) {
      let detail = "Das Hermes-Dashboard konnte die Anfrage nicht verarbeiten.";
      try {
        const parsed = JSON.parse(body) as { detail?: unknown; error?: { message?: unknown } };
        const candidate = parsed.detail ?? parsed.error?.message;
        if (typeof candidate === "string" && candidate.length > 0) detail = candidate.slice(0, 500);
      } catch { /* Upstream-Fehler bleibt bewusst generisch. */ }
      throw new HermesClientError(mapError(response.status, detail), detail, response.status, response.status >= 500);
    }
    if (!body.trim()) return null;
    try {
      return redactSensitive(JSON.parse(body));
    } catch {
      throw new HermesClientError("INTERNAL_ERROR", "Das Hermes-Dashboard hat ungültige Daten geliefert.", response.status);
    }
  }

  get(path: string): Promise<unknown> { return this.requestJson(path); }

  post(path: string, body?: unknown): Promise<unknown> {
    return this.requestJson(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(redactSensitive(body)) }) });
  }

  put(path: string, body?: unknown): Promise<unknown> {
    return this.requestJson(path, { method: "PUT", ...(body === undefined ? {} : { body: JSON.stringify(redactSensitive(body)) }) });
  }

  delete(path: string): Promise<unknown> { return this.requestJson(path, { method: "DELETE" }); }
}
