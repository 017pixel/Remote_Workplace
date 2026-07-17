import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("Workbench API", () => {
  it("returns a typed health response", async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({ status: "ok", version: "0.20.0" });
  });

  it("returns a validated Orbit document envelope", async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/orbit" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      revision: expect.any(Number),
      initialized: expect.any(Boolean),
      document: { version: 4, boards: expect.any(Array) },
    });
  });

  it("only resolves discovered or explicitly configured project IDs", async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/not-configured" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "PROJECT_NOT_FOUND", message: "Das lokale Projekt wurde nicht gefunden." },
    });
  });

  it("rejects traversal-shaped project identifiers", async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/projects/%2e%2e%2fetc" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Die Anfrage oder Konfiguration ist ungültig." },
    });
  });

  it("returns configured projects with server-derived availability", async () => {
    const app = await buildApp();
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
    const app = await buildApp();
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
