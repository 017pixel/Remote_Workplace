import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { settings } from "./config/settings.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("Workbench API", () => {
  it("returns a typed health response", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    // Gegen die konfigurierte Version prüfen statt gegen eine feste Zahl — sonst
    // bricht der Test bei jedem Versionssprung, ohne dass etwas kaputt ist.
    expect(response.json()).toMatchObject({ status: "ok", version: settings.appVersion });
    // Die Neustart-Marker müssen mitkommen: ohne sie erkennt das UI kein Fertigsein.
    const health = response.json() as { bootId: string; webBuildId: number | null };
    expect(health.bootId).toMatch(/^[0-9a-f-]{36}$/);
    expect(health.webBuildId === null || Number.isInteger(health.webBuildId)).toBe(true);
  });

  it("liefert die zentral konfigurierten Preview-Slots", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/previews/slots" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      assignedSlotId: null,
      slots: expect.arrayContaining([
        expect.objectContaining({ id: 1, internalPort: settings.previewSlotPorts[0], publicPort: settings.previewPublicPorts[0] }),
      ]),
    });
  });

  it("liefert einen Neustart-Status, auch wenn noch nie neu gestartet wurde", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/system/restart/status" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { phase: string; bootId: string };
    expect(["idle", "running", "succeeded", "failed"]).toContain(body.phase);
    expect(body.bootId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("nimmt den Health-Endpunkt vom Ratenlimit aus", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    // Deutlich mehr Anfragen als das konfigurierte Limit. Zählte `/health` mit,
    // käme ab der 181. ein 429 — im E2E-Lauf ist genau das passiert, und mit ihm
    // fielen Ansichten aus, deren Daten hinter derselben Sperre lagen.
    const responses = await Promise.all(
      Array.from({ length: settings.apiRateLimitMax + 20 }, () =>
        app.inject({ method: "GET", url: "/api/v1/health" }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).not.toContain(429);
  });

  it("returns a validated Orbit document envelope", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/orbit" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      revision: expect.any(Number),
      initialized: expect.any(Boolean),
      document: { version: 6, boards: expect.any(Array) },
    });
  });

  it("lists Orbit assets and rejects malformed archive cursors", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const list = await app.inject({ method: "GET", url: "/api/v1/orbit/assets?limit=2" });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ assets: unknown[]; nextCursor: string | null }>().assets).toEqual(expect.any(Array));
    expect(list.json<{ assets: unknown[]; nextCursor: string | null }>().nextCursor === null || typeof list.json<{ assets: unknown[]; nextCursor: string | null }>().nextCursor === "string").toBe(true);
    const invalid = await app.inject({ method: "GET", url: "/api/v1/orbit/assets?cursor=not-a-cursor" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: { code: "ORBIT_ASSET_CURSOR_INVALID", message: "Der Archivcursor ist ungültig." } });
  });

  it("lists gallery files and rejects malformed file cursors", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const list = await app.inject({ method: "GET", url: "/api/v1/files?limit=2" });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ files: unknown[]; nextCursor: string | null }>().files).toEqual(expect.any(Array));
    const invalid = await app.inject({ method: "GET", url: "/api/v1/files?cursor=not-a-cursor" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: { code: "FILE_GALLERY_CURSOR_INVALID", message: "Der Cursor ist ungültig." } });
  });

  it("returns 404 for an unknown gallery file id", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/files/00000000-0000-4000-8000-000000000000" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: "FILE_GALLERY_NOT_FOUND", message: "Diese Datei wurde nicht gefunden." } });
  });

  it("only resolves discovered or explicitly configured project IDs", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/not-configured" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "PROJECT_NOT_FOUND", message: "Das lokale Projekt wurde nicht gefunden." },
    });
  });

  it("rejects traversal-shaped project identifiers", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/%2e%2e%2fetc" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Die Anfrage oder Konfiguration ist ungültig." },
    });
  });

  it("returns configured projects with server-derived availability", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/projects" });
    expect(response.statusCode).toBe(200);
    const payload = response.json<{ projects: Array<{ id: string; availability: string }> }>();
    expect(
      payload.projects.some(
        (project: { id: string; availability: string }) =>
          project.id === "chappie" && project.availability === "available",
      ),
    ).toBe(true);
    expect(payload.projects.some((project) => project.id === "remote-workplace")).toBe(true);
  });

  it("returns the typed Tech TLDRs feed and collection endpoints", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const feed = await app.inject({ method: "GET", url: "/api/v1/news?limit=2" });
    expect(feed.statusCode).toBe(200);
    expect(feed.json()).toMatchObject({ items: expect.any(Array), total: expect.any(Number), sync: { running: expect.any(Boolean), aiEnabled: expect.any(Boolean) } });
    const collection = await app.inject({ method: "POST", url: "/api/v1/news/collections", payload: { name: `Test ${Date.now()}` } });
    expect(collection.statusCode).toBe(201);
    const created = collection.json<{collection:{id:string;name:string;itemCount:number}}>();
    expect(created).toMatchObject({ collection: { name: expect.stringMatching(/^Test /), itemCount: 0 } });
    expect((await app.inject({method:"DELETE",url:`/api/v1/news/collections/${created.collection.id}`})).statusCode).toBe(204);
  });
});
