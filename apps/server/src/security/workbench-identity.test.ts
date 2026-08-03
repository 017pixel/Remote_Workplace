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
});
