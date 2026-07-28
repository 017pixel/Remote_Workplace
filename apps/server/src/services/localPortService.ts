import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readlink } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { execa } from "execa";
import { localPortsResponseSchema, type LocalPort, type LocalPortsResponse } from "@workbench/contracts";

interface ListeningSocket {
  address: string;
  port: number;
  process: string | null;
  pid: number | null;
}

function parseEndpoint(value: string): { address: string; port: number } | null {
  const bracketed = /^\[(?<address>.*)]:(?<port>\d+)$/.exec(value);
  const plain = /^(?<address>.*):(?<port>\d+)$/.exec(value);
  const match = bracketed ?? plain;
  const port = Number(match?.groups?.port);
  if (!match?.groups?.address || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return { address: match.groups.address, port };
}

export function parseListeningSockets(output: string): ListeningSocket[] {
  const sockets = new Map<number, ListeningSocket>();
  for (const line of output.split("\n")) {
    const columns = line.trim().split(/\s+/);
    const endpoint = parseEndpoint(columns[3] ?? "");
    if (!endpoint) continue;
    const processMatch = /users:\(\("(?<name>[^"]+)",pid=(?<pid>\d+)/.exec(line);
    const process = processMatch?.groups?.name ?? null;
    const pid = processMatch?.groups?.pid ? Number(processMatch.groups.pid) : null;
    const current = sockets.get(endpoint.port);
    const candidate = { ...endpoint, process, pid };
    if (!current || (current.address !== "127.0.0.1" && endpoint.address === "127.0.0.1")) {
      sockets.set(endpoint.port, candidate);
    }
  }
  return [...sockets.values()].sort((left, right) => left.port - right.port);
}

// Hintergrunddienste des Betriebssystems und der Workbench selbst. Sie sind nie
// ein Preview-Ziel und würden die Auswahl nur zumüllen.
const systemProcessNames = new Set([
  "avahi-daemon", "chrome", "chromium", "chromium-browse", "chronyd", "codexbar", "colord", "containerd",
  "cups-browsed", "cupsd", "dnsmasq", "dockerd", "exim4", "fwupd", "gdm3", "master", "memcached",
  "ModemManager", "mongod", "mysqld", "NetworkManager", "nmbd", "ntpd", "packagekitd", "postgres",
  "redis-server", "rpcbind", "smbd", "snapd", "sshd", "systemd-resolve", "systemd-resolved",
  "tailscaled", "udisksd",
]);

// Privilegierte Ports gehören auf einem Entwicklungsrechner dem System
// (SSH, DNS, Drucker, Mail). Projekt-Devserver binden oberhalb von 1024.
const lowestProjectPort = 1_024;

export function isProjectSocket(socket: ListeningSocket, excludedProcessNames: ReadonlySet<string> = systemProcessNames): boolean {
  if (socket.port < lowestProjectPort) return false;
  return !socket.process || !excludedProcessNames.has(socket.process);
}

function probe(port: number, protocol: "http" | "https", timeoutMilliseconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    const request = (protocol === "https" ? httpsRequest : httpRequest)({
      hostname: "127.0.0.1",
      port,
      method: "HEAD",
      path: "/",
      timeout: timeoutMilliseconds,
      rejectUnauthorized: false,
      headers: { Connection: "close", "User-Agent": "Dev-Workbench-Port-Scanner" },
    }, (response) => {
      response.resume();
      resolve(true);
    });
    request.once("timeout", () => { request.destroy(); resolve(false); });
    request.once("error", () => resolve(false));
    request.end();
  });
}

function contained(root: string, target: string): boolean {
  const path = relative(resolve(root), resolve(target));
  return path === "" || (!path.startsWith("..") && !path.includes("/../"));
}

async function resolvePort(
  socket: ListeningSocket,
  timeoutMilliseconds: number,
  projects: ReadonlyArray<{ id: string; name: string; path: string }>,
): Promise<LocalPort> {
  const isHttp = await probe(socket.port, "http", timeoutMilliseconds);
  const isHttps = isHttp ? false : await probe(socket.port, "https", timeoutMilliseconds);
  const protocol = isHttp ? "http" as const : isHttps ? "https" as const : "unknown" as const;
  let project: { id: string; name: string; path: string } | undefined;
  if (socket.pid !== null) {
    try {
      const cwd = await readlink(`/proc/${socket.pid}/cwd`);
      project = [...projects]
        .filter((candidate) => contained(candidate.path, cwd))
        .sort((left, right) => right.path.length - left.path.length)[0];
    } catch {
      // Prozesse anderer Benutzer oder bereits beendete Prozesse bleiben ohne Projektzuordnung sichtbar.
    }
  }
  return {
    ...socket,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    protocol,
    localUrl: protocol === "unknown" ? null : `${protocol}://127.0.0.1:${socket.port}/`,
    proxyUrl: null,
  };
}

export function createLocalPortService(options: { cacheMilliseconds: number; probeTimeoutMilliseconds: number; excludedPorts?: readonly number[]; excludedProcessNames?: readonly string[]; projects?: () => Promise<ReadonlyArray<{ id: string; name: string; path: string }>> }) {
  let cached: LocalPortsResponse | null = null;
  let cachedAt = 0;
  let inFlight: Promise<LocalPortsResponse> | null = null;

  const excluded = new Set(options.excludedPorts ?? []);
  const excludedProcessNames = options.excludedProcessNames ? new Set(options.excludedProcessNames) : systemProcessNames;

  const scan = async (): Promise<LocalPortsResponse> => {
    const result = await execa("ss", ["-H", "-ltnp"], { reject: false, shell: false, timeout: 2_000 });
    const sockets = result.exitCode === 0
      ? parseListeningSockets(result.stdout).filter((socket) => !excluded.has(socket.port) && isProjectSocket(socket, excludedProcessNames))
      : [];
    const projects = await options.projects?.().catch(() => []) ?? [];
    const resolved = await Promise.all(sockets.map((socket) => resolvePort(socket, options.probeTimeoutMilliseconds, projects)));
    // Ohne HTTP-Antwort lässt sich nichts als Preview öffnen – solche Ports
    // gehören zu Hilfsdiensten und bleiben ausgeblendet.
    const ports = resolved.filter((port) => port.protocol !== "unknown");
    return localPortsResponseSchema.parse({ ports, scannedAt: new Date().toISOString() });
  };

  return {
    async list(): Promise<LocalPortsResponse> {
      if (cached && Date.now() - cachedAt < options.cacheMilliseconds) return cached;
      if (!inFlight) {
        inFlight = scan().then((response) => {
          cached = response;
          cachedAt = Date.now();
          return response;
        }).finally(() => { inFlight = null; });
      }
      return inFlight;
    },
  };
}
