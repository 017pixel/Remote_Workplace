import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { settings } from "../config/settings.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const authenticatedHeaders = {
  "tailscale-user-login": settings.terminalAllowedUsers[0] ?? "test@wrapt.invalid",
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("Extension API", () => {
  it("liefert einen leeren, revisionierten Registry-Snapshot", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/extensions", headers: authenticatedHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ revision: 0, extensions: [] });
  });

  it("lehnt unbekannte Extensions mit 404 ab", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/extensions/workbench.fehlt", headers: authenticatedHeaders });
    expect(response.statusCode).toBe(404);
  });

  it("liefert den lokalen Catalog als Lese-API", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/extensions/catalog",
      headers: authenticatedHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ providerId: "wrapt-catalog", entries: [] });
  });

  it("validiert Mutations-Requests vor der Ausführung", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/extensions/workbench.test/operations",
      headers: authenticatedHeaders,
      payload: { operation: "enable", extensionId: "workbench.other", expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(400);
  });

  it("beantwortet Operationen auf unbekannte Extensions mit sauberem Fehler-Envelope", async () => {
    const app = await buildApp({ startBackgroundServices: false });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/extensions/workbench.fehlt/operations",
      headers: authenticatedHeaders,
      payload: { operation: "enable", extensionId: "workbench.fehlt", expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "not-found", retryable: false },
    });
  });
});
