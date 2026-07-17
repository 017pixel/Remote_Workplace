import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { execa } from "execa";
import { localPortsResponseSchema, type LocalPort, type LocalPortsResponse } from "@workbench/contracts";

interface ListeningSocket {
  address: string;
  port: number;
  process: string | null;
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
    const process = /users:\(\("(?<name>[^"]+)/.exec(line)?.groups?.name ?? null;
    const current = sockets.get(endpoint.port);
    const candidate = { ...endpoint, process };
    if (!current || (current.address !== "127.0.0.1" && endpoint.address === "127.0.0.1")) {
      sockets.set(endpoint.port, candidate);
    }
  }
  return [...sockets.values()].sort((left, right) => left.port - right.port);
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

async function resolvePort(socket: ListeningSocket, timeoutMilliseconds: number): Promise<LocalPort> {
  const isHttp = await probe(socket.port, "http", timeoutMilliseconds);
  const isHttps = isHttp ? false : await probe(socket.port, "https", timeoutMilliseconds);
  const protocol = isHttp ? "http" as const : isHttps ? "https" as const : "unknown" as const;
  return {
    ...socket,
    protocol,
    localUrl: protocol === "unknown" ? null : `${protocol}://127.0.0.1:${socket.port}/`,
    proxyUrl: protocol === "http" ? `/editor/absproxy/${socket.port}/` : null,
  };
}

export function createLocalPortService(options: { cacheMilliseconds: number; probeTimeoutMilliseconds: number }) {
  let cached: LocalPortsResponse | null = null;
  let cachedAt = 0;
  let inFlight: Promise<LocalPortsResponse> | null = null;

  const scan = async (): Promise<LocalPortsResponse> => {
    const result = await execa("ss", ["-H", "-ltnp"], { reject: false, shell: false, timeout: 2_000 });
    const sockets = result.exitCode === 0 ? parseListeningSockets(result.stdout) : [];
    const ports = await Promise.all(sockets.map((socket) => resolvePort(socket, options.probeTimeoutMilliseconds)));
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
