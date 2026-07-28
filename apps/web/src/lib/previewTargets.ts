export interface LocalPreviewTarget {
  kind: "local";
  port: number;
  path: string;
}

export interface ExternalPreviewTarget {
  kind: "external";
  url: string;
}

export type NormalizedPreviewTarget = LocalPreviewTarget | ExternalPreviewTarget;

function normalizedPath(path: string): string {
  const value = [...path.trim()].filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join("").replaceAll("\\", "/");
  return `/${value.replace(/^\/+/, "")}`;
}

function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(hostname.toLowerCase());
}

export function normalizePreviewTarget(value: string): NormalizedPreviewTarget | null {
  const input = value.trim();
  if (!input) return null;
  if (/^\d{1,5}(?:\/.*)?$/.test(input)) {
    const [portText, ...pathParts] = input.split("/");
    const port = Number(portText);
    if (port < 1 || port > 65_535) return null;
    return { kind: "local", port, path: normalizedPath(pathParts.length ? `/${pathParts.join("/")}` : "/") };
  }
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(candidate);
    if (isLoopbackHostname(url.hostname) && url.port) {
      return { kind: "local", port: Number(url.port), path: `${url.pathname}${url.search}${url.hash}` };
    }
    if (isLoopbackHostname(url.hostname)) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { kind: "external", url: url.toString() };
  } catch {
    return null;
  }
}

// Kurzform der Quelle für die Anzeige im Geräterahmen.
export function previewTargetOrigin(target: NormalizedPreviewTarget | null): string | null {
  if (!target) return null;
  if (target.kind === "local") return `localhost:${target.port}`;
  try {
    return new URL(target.url).host;
  } catch {
    return null;
  }
}

export function previewSlotUrl(publicUrl: string, path: string): string {
  const base = new URL(publicUrl);
  const resolved = new URL(normalizedPath(path), base);
  if (resolved.origin !== base.origin) throw new Error("Der Preview-Pfad darf den Slot-Origin nicht verlassen.");
  return resolved.toString();
}
