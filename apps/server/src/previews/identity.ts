import type { FastifyRequest } from "fastify";
import { isSameOriginRequest } from "../security/same-origin.js";
import {
  firstHeader,
  resolveWorkbenchUser,
  type WorkbenchIdentityOptions,
} from "../security/workbench-identity.js";
import { AppError } from "../utils/errors.js";

export type PreviewIdentityOptions = WorkbenchIdentityOptions;

/**
 * Löst die Benutzeridentität ausschließlich aus dem vertrauenswürdigen
 * Proxy-Header auf. Request-Body und Query werden nie als Identitätsquelle
 * akzeptiert.
 */
export function resolvePreviewUser(request: FastifyRequest, options: PreviewIdentityOptions): string {
  return resolveWorkbenchUser(request, options);
}

/**
 * Mutierende Browser-Endpunkte verlangen eine gültige Same-Origin-Anfrage. Der
 * lokale Doctor benutzt stattdessen das Capability-Token über Loopback.
 */
export function requireSameOrigin(request: FastifyRequest): void {
  if (!isSameOriginRequest(request)) {
    throw new AppError(403, "PREVIEW_CROSS_ORIGIN", "Diese Aktion ist nur aus der Workbench-Oberfläche erlaubt.");
  }
}

/** Prüft Origin und Identität beim WebSocket-Upgrade. */
export function isAllowedWebSocketOrigin(request: FastifyRequest, allowedOrigins: readonly string[]): boolean {
  const origin = firstHeader(request.headers.origin);
  if (!origin) return false;
  try {
    return allowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}
