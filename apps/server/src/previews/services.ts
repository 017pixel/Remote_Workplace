import { readFile, readlink } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { request as httpRequest } from "node:http";
import {
  previewServiceCandidateSchema,
  type PreviewServiceCandidate,
  type PreviewServiceRole,
} from "@workbench/contracts";
import type { LocalPort } from "@workbench/contracts";

/**
 * Bekannte Framework-Hinweise. Sie stammen ausschließlich aus statisch gelesenen
 * `package.json`-Feldern; fremde Vite-, Next- oder Svelte-Konfiguration wird
 * niemals importiert oder ausgeführt.
 */
const frameworkMarkers: Array<{ dependency: string; hint: string; role: PreviewServiceRole }> = [
  { dependency: "vite", hint: "Vite", role: "primary" },
  { dependency: "next", hint: "Next.js", role: "primary" },
  { dependency: "@sveltejs/kit", hint: "SvelteKit", role: "primary" },
  { dependency: "nuxt", hint: "Nuxt", role: "primary" },
  { dependency: "astro", hint: "Astro", role: "primary" },
  { dependency: "@angular/cli", hint: "Angular", role: "primary" },
  { dependency: "fastify", hint: "Fastify", role: "api" },
  { dependency: "express", hint: "Express", role: "api" },
  { dependency: "hono", hint: "Hono", role: "api" },
  { dependency: "nest", hint: "NestJS", role: "api" },
  { dependency: "ws", hint: "WebSocket", role: "socket" },
  { dependency: "socket.io", hint: "Socket.IO", role: "socket" },
];

function contained(root: string, target: string): boolean {
  const path = relative(resolve(root), resolve(target));
  return path === "" || (!path.startsWith("..") && !path.includes("/../"));
}

async function readPackageJson(directory: string): Promise<{ scripts: string[]; dependencies: string[] } | null> {
  try {
    const raw = await readFile(join(directory, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return {
      scripts: Object.keys(parsed.scripts ?? {}).slice(0, 24),
      dependencies: [...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})],
    };
  } catch {
    return null;
  }
}

/** Prüft, ob ein Port ein WebSocket-Upgrade beantwortet. */
export function probeWebSocket(port: number, timeoutMilliseconds: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const probe = httpRequest({
      hostname: "127.0.0.1",
      port,
      path: "/",
      method: "GET",
      timeout: timeoutMilliseconds,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      },
    });
    probe.once("upgrade", () => { probe.destroy(); resolveProbe(true); });
    probe.once("response", (response) => { response.resume(); resolveProbe(response.statusCode === 101); });
    probe.once("timeout", () => { probe.destroy(); resolveProbe(false); });
    probe.once("error", () => resolveProbe(false));
    probe.end();
  });
}

export interface CandidateScanOptions {
  ports: readonly LocalPort[];
  projects: ReadonlyArray<{ id: string; name: string; path: string }>;
  probeTimeoutMilliseconds: number;
}

/**
 * Erzeugt reine Vorschläge. Verbunden wird erst nach ausdrücklicher Bestätigung
 * durch den Benutzer — gleiche Prozessbezeichnung genügt ausdrücklich nicht.
 */
export async function scanServiceCandidates(options: CandidateScanOptions): Promise<PreviewServiceCandidate[]> {
  const detectedAt = new Date().toISOString();
  const candidates = await Promise.all(options.ports.map(async (port): Promise<PreviewServiceCandidate> => {
    let cwd: string | null = null;
    if (port.pid !== null) {
      try {
        cwd = await readlink(`/proc/${port.pid}/cwd`);
      } catch {
        // Prozesse anderer Benutzer bleiben ohne Arbeitsverzeichnis sichtbar.
      }
    }
    const project = cwd === null
      ? options.projects.find((candidate) => candidate.id === port.projectId)
      : [...options.projects].filter((candidate) => contained(candidate.path, cwd!)).sort((left, right) => right.path.length - left.path.length)[0];
    // Nur registrierte Projektpfade werden gelesen — nie beliebige Verzeichnisse.
    const manifest = project ? await readPackageJson(project.path) : null;
    const hints = frameworkMarkers.filter((marker) => manifest?.dependencies.includes(marker.dependency));
    const supportsWebSocket = await probeWebSocket(port.port, options.probeTimeoutMilliseconds);
    const role: PreviewServiceRole = supportsWebSocket && hints.some((hint) => hint.role === "socket")
      ? "socket"
      : hints[0]?.role ?? "other";
    return previewServiceCandidateSchema.parse({
      serviceId: `port:${port.port}`,
      projectId: project?.id ?? port.projectId,
      port: port.port,
      process: port.process,
      pid: port.pid,
      cwd,
      protocol: port.protocol === "https" ? "https" : "http",
      probeStatus: port.protocol === "unknown" ? "unknown" : "reachable",
      scripts: manifest?.scripts ?? [],
      frameworkHints: hints.map((hint) => hint.hint),
      supportsWebSocket,
      suggestedRole: role,
      detectedAt,
    });
  }));
  return candidates.sort((left, right) => left.port - right.port);
}
