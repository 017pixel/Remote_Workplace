import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { apiErrorSchema } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { PreviewSlotDatabase } from "./database.js";
import { PreviewDiagnosticsService } from "./diagnostics.js";
import type { PreviewDevServerManager } from "./DevServerManager.js";
import { PreviewSecrets } from "./keys.js";
import { PreviewRepairService } from "./repair.js";
import { registerPreviewRoutes } from "./routes.js";
import { PreviewSlotService } from "./slots.js";
import { PreviewStorageService } from "./storage.js";

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const user = "a@b.test";
const other = "c@d.test";
const sameOrigin = { host: "workbench.test", origin: "http://workbench.test", "x-forwarded-proto": "http" };

async function harness() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-preview-routes-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const database = new PreviewSlotDatabase(join(directory, "workbench.sqlite"));
  cleanup.push(() => database.close());
  const secrets = new PreviewSecrets(directory);
  const slots = new PreviewSlotService({
    database,
    slotPorts: [3901, 3902],
    publicPorts: [8451, 8452],
    hostname: "server.test.ts.net",
    flags: { storageSyncEnabled: true, slotResetEnabled: true },
  });
  const diagnostics = new PreviewDiagnosticsService({
    directory: join(directory, "preview-logs"),
    secrets,
    retentionDays: 7,
    maxEventBytes: 65_536,
    enabled: true,
  });
  cleanup.push(() => diagnostics.close());
  const storage = new PreviewStorageService({ database, secrets, mode: "opt-in", maxBytes: 262_144, maxKeys: 1_000 });
  const repair = new PreviewRepairService({ database, slots, scanCandidates: async () => [] });
  const devServers = {
    preference: () => ({ externalOpenMode: "window" as const, updatedAt: null }),
    savePreference: (_userId: string, externalOpenMode: "window" | "tab") => ({ externalOpenMode, updatedAt: new Date().toISOString() }),
    status: async (_userId: string, projectId: string) => ({ projectId, state: "stopped" as const, command: "npm run dev" as const, mainPort: null, pid: null, startedAt: null, updatedAt: new Date().toISOString(), exitCode: null, message: null }),
    profile: async (projectId: string) => ({
      projectId, source: "detected" as const, mainServiceId: "frontend",
      services: [{ id: "frontend", name: "Frontend", role: "frontend" as const, command: "npm run dev", workingDirectory: "/tmp/projekt", port: 1234, portMode: "argument" as const, source: "detected" as const, frameworkHints: ["Vite"] }],
      allowedPorts: [1234, 1223], warnings: [], detectedAt: new Date().toISOString(), setupCommand: null,
    }),
    logs: async (_userId: string, projectId: string) => ({ projectId, output: "", truncated: false, capturedAt: new Date().toISOString() }),
    start: async (_userId: string, projectId: string) => ({ projectId, state: "running" as const, command: "npm run dev" as const, mainPort: null, pid: 1, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), exitCode: null, message: null }),
    launch: async (_userId: string, projectId: string) => ({
      status: { projectId, state: "running" as const, command: "npm run dev", mainPort: 1234, pid: 1, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), exitCode: null, message: null },
      publication: { url: "https://server.test.ts.net:8451/", sessionId: "11111111-1111-4111-8111-111111111111" },
    }),
    stop: async (_userId: string, projectId: string) => ({ projectId, state: "stopped" as const, command: "npm run dev" as const, mainPort: null, pid: null, startedAt: null, updatedAt: new Date().toISOString(), exitCode: null, message: null }),
    restart: async (_userId: string, projectId: string) => ({ projectId, state: "running" as const, command: "npm run dev" as const, mainPort: null, pid: 1, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), exitCode: null, message: null }),
    saveMainPort: async (_userId: string, projectId: string, mainPort: number | null) => ({ projectId, state: "stopped" as const, command: "npm run dev" as const, mainPort, pid: null, startedAt: null, updatedAt: new Date().toISOString(), exitCode: null, message: null }),
  } as unknown as PreviewDevServerManager;
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(apiErrorSchema.parse({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: request.id,
          retryable: error.retryable,
        },
      }));
    }
    return reply.status(500).send({ error: { code: "INTERNAL", message: String(error) } });
  });
  await app.register(registerPreviewRoutes, {
    prefix: "/api/v1",
    slots,
    database,
    diagnostics,
    storage,
    repair,
    secrets,
    identity: { allowedUsers: [user, other] },
    scanCandidates: async () => [],
    diagnosticsEnabled: true,
    diagnosticMaxBatchBytes: 262_144,
    diagnosticRetentionDays: 7,
    devServers,
  });
  cleanup.push(() => app.close());
  return { app, database, secrets, slots, storage };
}

describe("Preview-API", () => {
  it("verlangt Identität, Allowlist und Same-Origin", async () => {
    const { app } = await harness();
    expect((await app.inject({ method: "GET", url: "/api/v1/previews/slots" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/previews/slots", headers: { "tailscale-user-login": "fremd@example.com" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/previews/slots", headers: { "tailscale-user-login": user } })).statusCode).toBe(200);

    // Mutationen ohne gültige Same-Origin-Anfrage werden abgelehnt.
    const crossOrigin = await app.inject({
      method: "PUT",
      url: "/api/v1/previews/device-preference",
      headers: { "tailscale-user-login": user, origin: "https://boese.example", host: "workbench.test" },
      payload: { deviceId: "iphone-15", orientation: "portrait" },
    });
    expect(crossOrigin.statusCode).toBe(403);
  });

  it("schützt und validiert die Dev-Server-Steuerung", async () => {
    const { app } = await harness();
    expect((await app.inject({ method: "GET", url: "/api/v1/previews/dev-servers/projekt" })).statusCode).toBe(401);

    const status = await app.inject({
      method: "GET",
      url: "/api/v1/previews/dev-servers/projekt",
      headers: { "tailscale-user-login": user },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ projectId: "projekt", command: "npm run dev", state: "stopped" });

    const profile = await app.inject({ method: "GET", url: "/api/v1/previews/dev-servers/projekt/profile", headers: { "tailscale-user-login": user } });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({ projectId: "projekt", mainServiceId: "frontend", services: [{ role: "frontend", port: 1234 }] });

    const crossOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/previews/dev-servers/projekt/start",
      headers: { "tailscale-user-login": user, origin: "https://boese.example", host: "workbench.test" },
    });
    expect(crossOrigin.statusCode).toBe(403);

    const launch = await app.inject({ method: "POST", url: "/api/v1/previews/dev-servers/projekt/launch", headers: { "tailscale-user-login": user, ...sameOrigin } });
    expect(launch.statusCode).toBe(200);
    expect(launch.json()).toMatchObject({ url: "https://server.test.ts.net:8451/", status: { state: "running", mainPort: 1234 } });

    const invalidProject = await app.inject({
      method: "POST",
      url: "/api/v1/previews/dev-servers/../start",
      headers: { "tailscale-user-login": user, ...sameOrigin },
    });
    expect(invalidProject.statusCode).not.toBe(200);

    const port = await app.inject({
      method: "PUT",
      url: "/api/v1/previews/dev-servers/projekt/main-port",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { mainPort: 5173 },
    });
    expect(port.statusCode).toBe(200);
    expect(port.json()).toMatchObject({ projectId: "projekt", mainPort: 5173 });
  });

  it("speichert Gerätepräferenzen benutzerbezogen", async () => {
    const { app } = await harness();
    await app.inject({
      method: "PUT",
      url: "/api/v1/previews/device-preference",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { deviceId: "ipad-air", orientation: "landscape" },
    });
    const own = await app.inject({ method: "GET", url: "/api/v1/previews/device-preference", headers: { "tailscale-user-login": user } });
    expect(own.json()).toMatchObject({ deviceId: "ipad-air", orientation: "landscape" });
    const foreign = await app.inject({ method: "GET", url: "/api/v1/previews/device-preference", headers: { "tailscale-user-login": other } });
    expect(foreign.json()).toMatchObject({ deviceId: "iphone-13" });
  });

  it("lässt fremde Sessions weder verlängern noch schließen", async () => {
    const { app } = await harness();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/previews/sessions",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { sessionKey: "a", projectId: null, primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    expect(created.statusCode).toBe(200);
    const sessionId = (created.json() as { id: string }).id;
    const foreign = await app.inject({
      method: "DELETE",
      url: `/api/v1/previews/sessions/${sessionId}`,
      headers: { "tailscale-user-login": other, ...sameOrigin },
    });
    expect(foreign.statusCode).toBe(404);
    const own = await app.inject({
      method: "DELETE",
      url: `/api/v1/previews/sessions/${sessionId}`,
      headers: { "tailscale-user-login": user, ...sameOrigin },
    });
    expect(own.statusCode).toBe(204);
  });

  it("zeigt fremde Slots nur aggregiert als belegt", async () => {
    const { app } = await harness();
    await app.inject({
      method: "POST",
      url: "/api/v1/previews/sessions",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { sessionKey: "a", projectId: null, primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: "11111111-1111-4111-8111-111111111111" },
    });
    const foreign = await app.inject({ method: "GET", url: "/api/v1/previews/slots", headers: { "tailscale-user-login": other } });
    const slot = (foreign.json() as { slots: Array<{ id: number; busy: boolean; storageProfileId: string | null; affinityStatus: string }> }).slots[0]!;
    expect(slot.busy).toBe(true);
    expect(slot.storageProfileId).toBeNull();
    expect(slot.affinityStatus).toBe("foreign");
  });

  it("verweigert Graphen, welche die Slot-Kapazität überschreiten", async () => {
    const { app } = await harness();
    const edges = [4000, 4001, 4002].map((port) => ({
      serviceId: `port:${port}`,
      projectId: "projekt",
      port,
      protocol: "http",
      role: "api",
      label: `Dienst ${port}`,
      probeStatus: "reachable",
      source: "detected",
      confirmedAt: new Date().toISOString(),
    }));
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/previews/service-graphs/projekt/5173",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { edges },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "PREVIEW_CAPACITY_EXCEEDED" } });
  });

  it("liefert Snapshots nur dem eigenen Benutzer", async () => {
    const { app } = await harness();
    const profile = "22222222-2222-4222-8222-222222222222";
    await app.inject({
      method: "PUT",
      url: `/api/v1/previews/storage/${profile}`,
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { enabled: true },
    });
    const state = await app.inject({ method: "GET", url: `/api/v1/previews/storage/${profile}`, headers: { "tailscale-user-login": other } });
    expect(state.json()).toMatchObject({ enabled: false, current: null });
  });

  it("schützt den Doctor-Zugriff über Loopback und Capability-Token", async () => {
    const { app, secrets } = await harness();
    const withoutToken = await app.inject({ method: "GET", url: "/api/v1/previews/doctor/logs" });
    expect(withoutToken.statusCode).toBe(403);
    const wrongToken = await app.inject({ method: "GET", url: "/api/v1/previews/doctor/logs", headers: { authorization: "Bearer falsch" } });
    expect(wrongToken.statusCode).toBe(403);
    const valid = await app.inject({
      method: "GET",
      url: "/api/v1/previews/doctor/logs?since=" + new Date(Date.now() - 3_600_000).toISOString(),
      headers: { authorization: `Bearer ${secrets.capabilityToken()}` },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toMatchObject({ retentionDays: 7 });
  });

  it("nimmt Diagnose-Batches an und meldet Drop-Zähler", async () => {
    const { app } = await harness();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/previews/sessions",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { sessionKey: "diagnostics", projectId: null, primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    const sessionId = (created.json() as { id: string }).id;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/previews/diagnostics/batches",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: {
        previewNodeId: "node-1",
        sessionId,
        droppedSinceLastBatch: 3,
        events: [{
          id: "33333333-3333-4333-8333-333333333333",
          at: new Date().toISOString(),
          source: "client",
          category: "console",
          severity: "error",
          message: "Fehler mit Authorization: Bearer geheim",
          metadata: { Cookie: "sid=1" },
        }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ dropped: 3 });
    const listed = await app.inject({ method: "GET", url: "/api/v1/previews/diagnostics?previewNodeId=node-1", headers: { "tailscale-user-login": user } });
    const events = (listed.json() as { events: Array<{ message: string; metadata: Record<string, unknown> }> }).events;
    expect(events).toHaveLength(1);
    expect(events[0]!.message).not.toContain("geheim");
    expect(events[0]!.metadata.Cookie).toBe("[redigiert]");
  });

  it("erlaubt Reset und Quarantäneaufhebung nur mit Bestätigung", async () => {
    const { app } = await harness();
    await app.inject({
      method: "POST",
      url: "/api/v1/previews/sessions",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: {
        sessionKey: "reset",
        projectId: "projekt",
        primaryPort: 5173,
        primaryProtocol: "http",
        isolate: true,
        storageProfileId: "11111111-1111-4111-8111-111111111111",
        requestedSlotId: 1,
      },
    });
    const unconfirmed = await app.inject({
      method: "POST",
      url: "/api/v1/previews/repair",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { action: "reset-slot-storage", slotId: 1, confirmed: false },
    });
    expect(unconfirmed.json()).toMatchObject({ status: "failed" });
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/v1/previews/repair",
      headers: { "tailscale-user-login": user, ...sameOrigin },
      payload: { action: "reset-slot-storage", slotId: 1, confirmed: true },
    });
    expect(confirmed.json()).toMatchObject({ status: "succeeded" });
  });
});
