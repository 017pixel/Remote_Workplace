import type { FastifyRequest } from "fastify";
import { AppError } from "../utils/errors.js";
import { isSameOriginRequest } from "./same-origin.js";

export interface WorkbenchIdentityOptions {
  allowedUsers: readonly string[];
  developmentUser?: string;
}

const protectedPrefixes = [
  "/api/",
  "/editor",
  "/t3",
  "/hermes",
  "/assets/",
  "/.well-known/t3/",
  "/api/auth/",
];

// Der Preview-Doctor authentifiziert sich selbst über Loopback-Verbindung und
// Capability-Token; eine Tailscale-Identität darf ihn nicht vorab blockieren.
// Dasselbe gilt für den Open-in-Editor-Kanal: Das T3-`code`-Shim spricht
// ausschließlich über Loopback und ein eigenes Capability-Token.
const unprotectedApiPrefixes = [
  "/api/v1/previews/doctor/",
  "/api/v1/editor/",
];

// T3 authenticates its root WebSocket with its own session cookie or ticket.
// Browser WebSocket upgrades do not reliably carry the Tailscale identity
// header, so the upstream T3 service must receive and validate this request.
const protectedExactPaths = new Set([
  "/",
  "/favicon.ico",
  "/apple-touch-icon.png",
]);

export function firstHeader(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
}

export function requestIdentity(request: FastifyRequest): string | undefined {
  const identity = firstHeader(request.headers["tailscale-user-login"])?.toLowerCase();
  return identity && identity.length > 0 ? identity : undefined;
}

export function resolveWorkbenchUser(
  request: FastifyRequest,
  options: WorkbenchIdentityOptions,
): string {
  const identity = requestIdentity(request) ?? options.developmentUser?.toLowerCase();
  if (!identity) {
    throw new AppError(
      401,
      "WORKBENCH_IDENTITY_REQUIRED",
      "Für diesen Bereich wird eine Tailscale-Identität benötigt.",
    );
  }
  if (options.allowedUsers.length > 0 && !options.allowedUsers.includes(identity)) {
    throw new AppError(
      403,
      "WORKBENCH_FORBIDDEN",
      "Dieser Benutzer darf die Workbench nicht verwenden.",
    );
  }
  return identity;
}

export function isProtectedWorkbenchRequest(request: FastifyRequest): boolean {
  const pathname = new URL(request.raw.url ?? request.url, "http://workbench.local").pathname;
  if (pathname === "/api/v1/health") return false;
  if (unprotectedApiPrefixes.some((prefix) => pathname.startsWith(prefix))) return false;
  return protectedExactPaths.has(pathname) ||
    protectedPrefixes.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

export function requireMutationOrigin(request: FastifyRequest): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;

  const origin = firstHeader(request.headers.origin);
  const fetchSite = firstHeader(request.headers["sec-fetch-site"]);
  // CLI- und systemd-Aufrufe senden weder Origin noch Fetch-Metadata. Ein
  // Browser sendet bei mutierenden Fetches mindestens einen dieser Header.
  if (!origin && !fetchSite) return;
  if (fetchSite === "same-origin" && isSameOriginRequest(request)) return;
  if (isSameOriginRequest(request)) return;

  throw new AppError(
    403,
    "WORKBENCH_CROSS_ORIGIN",
    "Diese Aktion ist nur aus der Workbench-Oberfläche erlaubt.",
  );
}
