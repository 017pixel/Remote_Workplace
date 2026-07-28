import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewSlotDatabase, PreviewSlotService } from "./slots.js";

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Kein Testport verfügbar."));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

describe("Preview-Slots", () => {
  it("weist isolierte und geteilte Ziele persistent zu", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-preview-slots-"));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const database = new PreviewSlotDatabase(join(directory, "workbench.sqlite"));
    cleanup.push(() => database.close());
    const service = new PreviewSlotService({ database, slotPorts: [3901, 3902], publicPorts: [8451, 8452], hostname: "server.test.ts.net" });

    expect(service.assign({ targetPort: 5173, isolate: true }).assignedSlotId).toBe(1);
    expect(service.assign({ targetPort: 5173, isolate: false }).assignedSlotId).toBe(1);
    expect(service.assign({ targetPort: 5173, isolate: true }).assignedSlotId).toBe(2);
    expect(service.list().slots.map((slot) => slot.targetPort)).toEqual([5173, 5173]);
    service.assign({ slotId: 1, targetPort: null, isolate: true });
    expect(service.list().slots[0]?.targetPort).toBeNull();
  });

  it("schützt Infrastrukturports, belegte Slots und bedingte Freigaben", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-preview-guards-"));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, "workbench.sqlite");
    const database = new PreviewSlotDatabase(path);
    cleanup.push(() => database.close());
    const service = new PreviewSlotService({
      database,
      slotPorts: [3901, 3902],
      publicPorts: [8451, 8452],
      hostname: "server.test.ts.net",
      forbiddenTargetPorts: [3010, 3773],
    });

    expect(() => service.assign({ targetPort: 3010, isolate: true })).toThrowError(/Infrastrukturports/);
    service.assign({ slotId: 1, targetPort: 5173, isolate: true });
    expect(() => service.assign({ slotId: 1, targetPort: 4173, isolate: true })).toThrowError(/inzwischen belegt/);
    expect(() => service.assign({ slotId: 1, targetPort: null, expectedTargetPort: 4173, isolate: true })).toThrowError(/anderen Ziel/);
    expect(service.list().slots[0]?.targetPort).toBe(5173);
    service.assign({ slotId: 1, targetPort: null, expectedTargetPort: 5173, isolate: true });

    const inspection = new DatabaseSync(path);
    expect(inspection.prepare("SELECT version FROM preview_schema_migrations").get()).toMatchObject({ version: 1 });
    inspection.close();
  });

  it("reserviert bestätigte Projekt-Dienste gemeinsam und injiziert die HTTPS-Bridge", async () => {
    const upstream = Fastify({ logger: false });
    upstream.get("/", async (_request, reply) => reply.type("text/html").send("<!doctype html><html><head><title>App</title></head><body>ok</body></html>"));
    const upstreamPort = await freePort();
    const dependencyPort = await freePort();
    await upstream.listen({ host: "127.0.0.1", port: upstreamPort });
    cleanup.push(() => upstream.close());
    const backend = Fastify({ logger: false });
    backend.get("/api", async (_request, reply) => reply.header("access-control-allow-origin", `http://127.0.0.1:${upstreamPort}`).send({ ok: true }));
    backend.get("/redirect", async (_request, reply) => reply.redirect(`http://localhost:${dependencyPort}/api`));
    await backend.listen({ host: "127.0.0.1", port: dependencyPort });
    cleanup.push(() => backend.close());
    const directory = await mkdtemp(join(tmpdir(), "workbench-preview-session-"));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const database = new PreviewSlotDatabase(join(directory, "workbench.sqlite"));
    cleanup.push(() => database.close());
    const proxyPorts = [await freePort(), await freePort()];
    const service = new PreviewSlotService({ database, slotPorts: proxyPorts, publicPorts: [8451, 8452], hostname: "server.test.ts.net" });
    service.saveDependencies("project", upstreamPort, [{ port: dependencyPort, label: "API", protocol: "auto", enabled: true }]);
    const session = service.openSession({ sessionKey: "test", projectId: "project", primaryPort: upstreamPort, primaryProtocol: "http", isolate: true });
    expect(session.bindings).toMatchObject([
      { role: "primary", targetPort: upstreamPort, slotId: 1 },
      { role: "dependency", targetPort: dependencyPort, slotId: 2, publicUrl: "https://server.test.ts.net:8452/" },
    ]);
    await service.startListeners();
    cleanup.push(() => service.stopListeners());
    const html = await fetch(`http://127.0.0.1:${proxyPorts[0]}/`).then((response) => response.text());
    expect(html).toContain("data-workbench-preview-bridge");
    expect(html).toContain(`"${dependencyPort}":"https://server.test.ts.net:8452/"`);
    const apiResponse = await fetch(`http://127.0.0.1:${proxyPorts[1]}/api`, { headers: { origin: "https://server.test.ts.net:8451" } });
    expect(apiResponse.headers.get("access-control-allow-origin")).toBe("https://server.test.ts.net:8451");
    const redirect = await fetch(`http://127.0.0.1:${proxyPorts[1]}/redirect`, { redirect: "manual" });
    expect(redirect.headers.get("location")).toBe("https://server.test.ts.net:8452/api");
    service.closeSession("test");
    expect(service.list().slots.map((slot) => slot.targetPort)).toEqual([null, null]);
  });

  it("leitet Root-HTTP und WebSocket-Upgrades mit Ziel-Host weiter", async () => {
    const upstream = Fastify({ logger: false });
    await upstream.register(websocket);
    upstream.route({
      method: "GET",
      url: "/*",
      handler: async (request, reply) => {
        reply.header("content-security-policy", "frame-ancestors 'none'");
        reply.header("x-frame-options", "DENY");
        return { host: request.headers.host, url: request.url };
      },
      wsHandler: (socket, request) => {
        socket.send(JSON.stringify({ host: request.headers.host, url: request.url }));
        socket.on("message", (message) => socket.send(message));
      },
    });
    const upstreamPort = await freePort();
    await upstream.listen({ host: "127.0.0.1", port: upstreamPort });
    cleanup.push(() => upstream.close());

    const directory = await mkdtemp(join(tmpdir(), "workbench-preview-proxy-"));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const database = new PreviewSlotDatabase(join(directory, "workbench.sqlite"));
    cleanup.push(() => database.close());
    const proxyPort = await freePort();
    const service = new PreviewSlotService({ database, slotPorts: [proxyPort], publicPorts: [8451], hostname: "server.test.ts.net" });
    service.assign({ targetPort: upstreamPort, isolate: true });
    await service.startListeners();
    cleanup.push(() => service.stopListeners());

    const response = await fetch(`http://127.0.0.1:${proxyPort}/assets/app.js?direct=1`);
    expect(await response.json()).toMatchObject({ host: `127.0.0.1:${upstreamPort}`, url: "/assets/app.js?direct=1" });
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-frame-options")).toBeNull();

    const socket = new WebSocket(`ws://127.0.0.1:${proxyPort}/hmr?token=test`);
    const messages: string[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.on("message", (message) => {
        messages.push(message.toString());
        if (messages.length === 1) socket.send("hmr-ok");
        else resolve();
      });
      socket.on("error", reject);
    });
    socket.close();
    expect(JSON.parse(messages[0]!) as object).toMatchObject({ host: `127.0.0.1:${upstreamPort}`, url: "/hmr?token=test" });
    expect(messages[1]).toBe("hmr-ok");
  });
});
