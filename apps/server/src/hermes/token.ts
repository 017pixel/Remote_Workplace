import { settings } from "../config/settings.js";

export class HermesTokenError extends Error {
  constructor(message = "Das Hermes-Dashboard-Token konnte nicht gelesen werden.") {
    super(message);
    this.name = "HermesTokenError";
  }
}

function authority(host: string, port: number): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]:${port}` : `${host}:${port}`;
}

export class HermesSessionToken {
  private token: string | null = null;
  private loading: Promise<string> | null = null;

  async get(force = false): Promise<string> {
    if (!force && this.token) return this.token;
    if (this.loading) return this.loading;
    this.loading = this.load().finally(() => { this.loading = null; });
    return this.loading;
  }

  invalidate() {
    this.token = null;
  }

  private async load(): Promise<string> {
    const host = authority(settings.hermes.host, settings.hermes.port);
    const response = await fetch(`http://${host}/`, {
      headers: { Accept: "text/html", Host: host },
      signal: AbortSignal.timeout(settings.hermes.requestTimeoutSeconds * 1_000),
    }).catch(() => null);
    if (!response || !response.ok) throw new HermesTokenError();
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 4 * 1024 * 1024) throw new HermesTokenError();
    const html = await response.text();
    const match = /__HERMES_SESSION_TOKEN__\s*=\s*["']([A-Za-z0-9_-]{16,})["']/.exec(html);
    if (!match?.[1]) throw new HermesTokenError();
    this.token = match[1];
    return match[1];
  }
}

export function hermesAuthority(): string {
  return authority(settings.hermes.host, settings.hermes.port);
}
