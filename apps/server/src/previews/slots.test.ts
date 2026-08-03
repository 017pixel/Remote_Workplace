import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewSlotDatabase, PreviewSlotService, type PreviewFlags } from "./slots.js";

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const user = "test@example.com";

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

async function service(options: {
  slotPorts: number[];
  publicPorts?: number[];
  forbiddenTargetPorts?: number[];
  flags?: Partial<PreviewFlags>;
}) {
  const directory = await mkdtemp(join(tmpdir(), "workbench-preview-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "workbench.sqlite");
  const database = new PreviewSlotDatabase(path);
  cleanup.push(() => database.close());
  const instance = new PreviewSlotService({
    database,
    slotPorts: options.slotPorts,
    publicPorts: options.publicPorts ?? options.slotPorts.map((_, index) => 8451 + index),
    hostname: "server.test.ts.net",
    workbenchOrigins: ["https://server.test.ts.net:8443"],
    ...(options.forbiddenTargetPorts ? { forbiddenTargetPorts: options.forbiddenTargetPorts } : {}),
    ...(options.flags ? { flags: options.flags } : {}),
  });
  return { database, service: instance, path };
}

describe("Preview-Slots", () => {
  it("weist isolierte und geteilte Ziele persistent zu", async () => {
    const { service: slots } = await service({ slotPorts: [3901, 3902] });

    expect(slots.assign({ targetPort: 5173, isolate: true }).assignedSlotId).toBe(1);
    expect(slots.assign({ targetPort: 5173, isolate: false }).assignedSlotId).toBe(1);
    expect(slots.assign({ targetPort: 5173, isolate: true }).assignedSlotId).toBe(2);
    expect(slots.list().slots.map((slot) => slot.targetPort)).toEqual([5173, 5173]);
    slots.assign({ slotId: 1, targetPort: null, isolate: true });
    expect(slots.list().slots[0]?.targetPort).toBeNull();
  });

  it("schützt Infrastrukturports, belegte Slots und bedingte Freigaben", async () => {
    const { service: slots, path } = await service({ slotPorts: [3901, 3902], forbiddenTargetPorts: [3010, 3773] });

    expect(() => slots.assign({ targetPort: 3010, isolate: true })).toThrowError(/Infrastrukturports/);
    slots.assign({ slotId: 1, targetPort: 5173, isolate: true });
    expect(() => slots.assign({ slotId: 1, targetPort: 4173, isolate: true })).toThrowError(/inzwischen belegt/);
    expect(() => slots.assign({ slotId: 1, targetPort: null, expectedTargetPort: 4173, isolate: true })).toThrowError(/anderen Ziel/);
    expect(slots.list().slots[0]?.targetPort).toBe(5173);
    slots.assign({ slotId: 1, targetPort: null, expectedTargetPort: 5173, isolate: true });

    const inspection = new DatabaseSync(path);
    const versions = inspection.prepare("SELECT version FROM preview_schema_migrations ORDER BY version").all();
    expect(versions).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
    inspection.close();
  });

  it("veröffentlicht Routing-Revisionen atomar und erzwingt Ownership", async () => {
    const { service: slots } = await service({ slotPorts: [3901, 3902] });
    const before = slots.routingRevision();
    const session = slots.openSession(user, { sessionKey: "a", projectId: null, primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null });
    expect(slots.routingRevision()).toBeGreaterThan(before);
    expect(session.routingRevision).toBe(slots.routingRevision());
    expect(session.limitations).toContain("cookies-share-host");

    expect(() => slots.renewLease("fremd@example.com", session.id)).toThrowError(/gehört nicht zu deinem Benutzer/);
    expect(() => slots.closeSessionById("fremd@example.com", session.id)).toThrowError(/gehört nicht zu deinem Benutzer/);
    slots.closeSessionById(user, session.id);
    expect(slots.list().slots.every((slot) => slot.targetPort === null)).toBe(true);
  });

  it("gibt verwaiste Direktzuweisungen ohne Session wieder frei", async () => {
    const { service: slots } = await service({ slotPorts: [3901] });
    // Rest aus dem alten Zuweisungspfad: Zielport gesetzt, aber keine Session.
    slots.assign({ targetPort: 4444, isolate: true });
    const session = slots.openSession(user, { sessionKey: "a", projectId: null, primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: null });
    expect(session.bindings[0]!.slotId).toBe(1);
    expect(slots.list().slots[0]?.targetPort).toBe(5173);
  });

  it("liefert bei gleichem Idempotenzschlüssel denselben Stand", async () => {
    const { service: slots } = await service({ slotPorts: [3901, 3902] });
    const request = { sessionKey: "a", projectId: null, primaryPort: 5173, primaryProtocol: "http" as const, isolate: true, storageProfileId: null, idempotencyKey: "k1" };
    const first = slots.openSession(user, request);
    const revision = slots.routingRevision();
    const second = slots.openSession(user, request);
    expect(second.id).toBe(first.id);
    expect(slots.routingRevision()).toBe(revision);
    expect(() => slots.openSession(user, { ...request, primaryPort: 4173 }))
      .toThrowError(/Idempotenzschlüssel/);
  });

  it("teilt Slots nur bei identischem Binding-Fingerprint", async () => {
    const { service: slots } = await service({ slotPorts: [3901, 3902, 3903] });
    const shared = { projectId: null, primaryPort: 5173, primaryProtocol: "http" as const, isolate: false, storageProfileId: null };
    const first = slots.openSession(user, { ...shared, sessionKey: "a" });
    const second = slots.openSession(user, { ...shared, sessionKey: "b" });
    expect(second.bindings[0]!.slotId).toBe(first.bindings[0]!.slotId);

    const other = slots.openSession(user, { ...shared, sessionKey: "c", primaryPort: 4173 });
    expect(other.bindings[0]!.slotId).not.toBe(first.bindings[0]!.slotId);
  });

  it("hält eine fremde Storage-Affinität ohne verifizierten Reset zurück", async () => {
    const { service: slots, database } = await service({ slotPorts: [3901], flags: { slotResetEnabled: true } });
    const profileA = "11111111-1111-4111-8111-111111111111";
    const profileB = "22222222-2222-4222-8222-222222222222";
    const session = slots.openSession(user, { sessionKey: "a", projectId: "projekt", primaryPort: 5173, primaryProtocol: "http", isolate: true, storageProfileId: profileA });
    slots.closeSessionById(user, session.id);

    expect(() => slots.openSession(user, { sessionKey: "b", projectId: "projekt", primaryPort: 4173, primaryProtocol: "http", isolate: true, storageProfileId: profileB }))
      .toThrowError(/nicht genügend Preview-Slots/);

    const { nonce } = slots.reset.begin(1, database.affinity(1)!.generation, profileA);
    const failed = slots.reset.verify(1, { nonce, serviceWorkers: 1, cacheStorages: 0, localStorageKeys: 0, sessionStorageKeys: 0, indexedDatabases: 0, verifiable: true });
    expect(failed.affinity.state).toBe("quarantined");

    const second = slots.reset.begin(1, failed.affinity.generation, profileA);
    expect(second.affinity.state).toBe("resetting");
    const verified = slots.reset.verify(1, { nonce: second.nonce, serviceWorkers: 0, cacheStorages: 0, localStorageKeys: 0, sessionStorageKeys: 0, indexedDatabases: 0, verifiable: true });
    expect(verified.affinity.state).toBe("free");
    expect(verified.affinity.generation).toBe(failed.affinity.generation + 1);

    const reused = slots.openSession(user, { sessionKey: "b", projectId: "projekt", primaryPort: 4173, primaryProtocol: "http", isolate: true, storageProfileId: profileB });
    expect(reused.bindings[0]!.slotId).toBe(1);
  });

  it("meldet fehlende Kapazität, statt einen Graphen teilweise zu aktivieren", async () => {
    const { service: slots } = await service({ slotPorts: [3901, 3902] });
    const capacity = slots.capacity({
      projectId: "projekt",
      primaryPort: 5173,
      edges: [
        { serviceId: "port:4000", projectId: "projekt", port: 4000, protocol: "http", role: "api", label: "API", probeStatus: "reachable", source: "detected", confirmedAt: new Date().toISOString() },
        { serviceId: "port:4001", projectId: "projekt", port: 4001, protocol: "ws", role: "socket", label: "Socket", probeStatus: "reachable", source: "detected", confirmedAt: new Date().toISOString() },
      ],
    });
    expect(capacity.requiredSlots).toBe(3);
    expect(capacity.fits).toBe(false);
  });

  it("reserviert bestätigte Projekt-Dienste gemeinsam und injiziert die externe Bridge", async () => {
    const upstream = Fastify({ logger: false });
    upstream.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send("<!doctype html><html><head><title>App</title></head><body>ok</body></html>"));
    const upstreamPort = await freePort();
    const dependencyPort = await freePort();
    await upstream.listen({ host: "127.0.0.1", port: upstreamPort });
    cleanup.push(() => upstream.close());
    const backend = Fastify({ logger: false });
    backend.get("/api", async (_request, reply) => reply.header("access-control-allow-origin", `http://127.0.0.1:${upstreamPort}`).send({ ok: true }));
    backend.get("/redirect", async (_request, reply) => reply.redirect(`http://localhost:${dependencyPort}/api`));
    await backend.listen({ host: "127.0.0.1", port: dependencyPort });
    cleanup.push(() => backend.close());

    const proxyPorts = [await freePort(), await freePort()];
    const { service: slots } = await service({
      slotPorts: proxyPorts,
      publicPorts: [8451, 8452],
      flags: { gatewayV2Enabled: true, bridgeEnabled: true },
    });
    slots.saveDependencies("project", upstreamPort, [{ port: dependencyPort, label: "API", protocol: "auto", enabled: true }]);
    const session = slots.openSession(user, { sessionKey: "test", projectId: "project", primaryPort: upstreamPort, primaryProtocol: "http", isolate: true, storageProfileId: null });
    expect(session.bindings).toMatchObject([
      { role: "primary", targetPort: upstreamPort, slotId: 1 },
      { role: "dependency", targetPort: dependencyPort, slotId: 2, publicUrl: "https://server.test.ts.net:8452/" },
    ]);
    await slots.startListeners();
    cleanup.push(() => slots.stopListeners());

    const html = await fetch(`http://127.0.0.1:${proxyPorts[0]}/`).then((response) => response.text());
    expect(html).toContain("data-workbench-preview-bridge");
    expect(html).toContain("/__workbench/preview-bridge.v1.js");

    const script = await fetch(`http://127.0.0.1:${proxyPorts[0]}/__workbench/preview-bridge.v1.js`).then((response) => response.text());
    expect(script).toContain(`"${dependencyPort}":"https://server.test.ts.net:8452/"`);

    const apiResponse = await fetch(`http://127.0.0.1:${proxyPorts[1]}/api`, { headers: { origin: "https://server.test.ts.net:8451" } });
    expect(apiResponse.headers.get("access-control-allow-origin")).toBe("https://server.test.ts.net:8451");
    const redirect = await fetch(`http://127.0.0.1:${proxyPorts[1]}/redirect`, { redirect: "manual" });
    expect(redirect.headers.get("location")).toBe("https://server.test.ts.net:8452/api");
    slots.closeSession(user, "test");
    expect(slots.list().slots.map((slot) => slot.targetPort)).toEqual([null, null]);
  });

  it("leitet Root-HTTP und WebSocket-Upgrades mit Ziel-Host weiter und passt nur die Embedding-Regel an", async () => {
    const upstream = Fastify({ logger: false });
    await upstream.register(websocket);
    upstream.route({
      method: "GET",
      url: "/*",
      handler: async (request, reply) => {
        reply.header("content-security-policy", "default-src 'self'; frame-ancestors 'none'");
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

    const proxyPort = await freePort();
    const { service: slots } = await service({ slotPorts: [proxyPort], flags: { gatewayV2Enabled: true } });
    slots.assign({ targetPort: upstreamPort, isolate: true });
    await slots.startListeners();
    cleanup.push(() => slots.stopListeners());

    const response = await fetch(`http://127.0.0.1:${proxyPort}/assets/app.js?direct=1`);
    expect(await response.json()).toMatchObject({ host: `127.0.0.1:${upstreamPort}`, url: "/assets/app.js?direct=1" });
    expect(response.headers.get("x-frame-options")).toBeNull();
    // Der restliche CSP bleibt erhalten; nur frame-ancestors wird ergänzt.
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("content-security-policy")).toContain("https://server.test.ts.net:8443");

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

  it("ersetzt auch im Rollback-Gateway v1 XFO durch eine enge Embedding-Policy", async () => {
    const upstream = Fastify({ logger: false });
    upstream.get("/*", async (_request, reply) => {
      reply.header("content-security-policy", "frame-ancestors 'none'");
      reply.header("x-frame-options", "DENY");
      return { ok: true };
    });
    const upstreamPort = await freePort();
    await upstream.listen({ host: "127.0.0.1", port: upstreamPort });
    cleanup.push(() => upstream.close());

    const proxyPort = await freePort();
    const { service: slots } = await service({ slotPorts: [proxyPort], flags: { gatewayV2Enabled: false } });
    slots.assign({ targetPort: upstreamPort, isolate: true });
    await slots.startListeners();
    cleanup.push(() => slots.stopListeners());

    const response = await fetch(`http://127.0.0.1:${proxyPort}/`);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors https://server.test.ts.net:8443");
    expect(response.headers.get("x-frame-options")).toBeNull();
  });
});
