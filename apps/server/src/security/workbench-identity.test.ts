import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { isProtectedWorkbenchRequest, resolveWorkbenchUser } from "./workbench-identity.js";

function request(url: string, headers: Record<string, string> = {}) {
  return { url, raw: { url }, headers } as unknown as FastifyRequest;
}

describe("Workbench-Identität", () => {
  it("schützt die Hermes-Verwaltung wie die übrigen privaten Bereiche", () => {
    expect(isProtectedWorkbenchRequest(request("/hermes/api/config"))).toBe(true);
    expect(() => resolveWorkbenchUser(request("/hermes/api/config"), { allowedUsers: ["user@example.com"] })).toThrowError(/Identität/);
    expect(() => resolveWorkbenchUser(request("/hermes/api/config"), { allowedUsers: ["user@example.com"] })).toThrowError(expect.objectContaining({ statusCode: 401 }));
  });

  it("lehnt nicht erlaubte Hermes-Identitäten ab", () => {
    expect(() => resolveWorkbenchUser(request("/hermes/api/config", { "tailscale-user-login": "other@example.com" }), { allowedUsers: ["user@example.com"] })).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("überlässt den T3-WebSocket der eigenen Authentifizierung", () => {
    expect(isProtectedWorkbenchRequest(request("/ws"))).toBe(false);
  });

  it("lässt den lokalen Preview-Doctor ohne Tailscale-Identität durch", () => {
    // Die Doctor-Routen schützen sich selbst über Loopback und Capability-Token.
    expect(isProtectedWorkbenchRequest(request("/api/v1/previews/doctor/status"))).toBe(false);
    expect(isProtectedWorkbenchRequest(request("/api/v1/previews/doctor/logs"))).toBe(false);
    expect(isProtectedWorkbenchRequest(request("/api/v1/previews/doctor/probe"))).toBe(false);
  });
});
