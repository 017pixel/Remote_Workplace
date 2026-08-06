import { expect, test } from "@playwright/test";
import { startPreviewFixtures, fixturePorts } from "../fixtures/preview-apps/server.mjs";
import { previewIdentity, previewsEnabled, previewsReason } from "./helpers/previews";

// Das Harness bindet nur Loopback und wird pro Datei genau einmal gestartet.
let stopFixtures: (() => Promise<void>) | null = null;

test.beforeAll(async () => {
  if (!previewsEnabled) return;
  stopFixtures = await startPreviewFixtures();
});

test.afterAll(async () => {
  await stopFixtures?.();
  stopFixtures = null;
});

test.describe("Lokale Previews", () => {
  test.skip(!previewsEnabled, previewsReason);

  test("öffnet eine SPA-Session, hält die Routing-Revision und gibt sie wieder frei", async ({ request }) => {
    const opened = await request.post("/api/v1/previews/sessions", {
      headers: previewIdentity,
      data: { sessionKey: "e2e-spa", projectId: null, primaryPort: fixturePorts.spa, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    expect(opened.ok()).toBeTruthy();
    const session = await opened.json() as { id: string; routingRevision: number; bindings: Array<{ slotId: number; publicUrl: string }>; limitations: string[] };
    expect(session.bindings).toHaveLength(1);
    expect(session.routingRevision).toBeGreaterThan(0);
    // Grenzen werden ehrlich benannt, statt Vollständigkeit zu behaupten.
    expect(session.limitations).toContain("cookies-share-host");
    expect(session.limitations).toContain("no-indexeddb-sync");

    const slots = await (await request.get("/api/v1/previews/slots", { headers: previewIdentity })).json() as { slots: Array<{ id: number; internalPort: number; publicPort: number; targetPort: number | null; publicUrl: string; affinityStatus: string }> };
    const bound = slots.slots.find((slot) => slot.id === session.bindings[0]!.slotId)!;
    expect(bound.targetPort).toBe(fixturePorts.spa);
    expect(bound.affinityStatus).toBe("own");
    expect(session.bindings[0]!.publicUrl).toBe(bound.publicUrl);
    const publicPort = new URL(session.bindings[0]!.publicUrl).hostname === "127.0.0.1" ? bound.internalPort : bound.publicPort;
    expect(new URL(session.bindings[0]!.publicUrl).port).toBe(String(publicPort));

    const preview = await request.get(`http://127.0.0.1:${bound.internalPort}/`);
    expect(preview.ok()).toBeTruthy();
    expect(await preview.text()).toContain("SPA bereit");

    const closed = await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    expect(closed.status()).toBe(204);
  });

  test("weist eine externe URL als Preview-Ziel ab", async ({ request }) => {
    // Externe Adressen erreichen den lokalen Gateway nie: Er kennt nur Ports.
    const response = await request.post("/api/v1/previews/sessions", {
      headers: previewIdentity,
      data: { sessionKey: "e2e-extern", projectId: null, primaryPort: 443, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    // Port 443 ist kein lokaler Projektdienst; die Session bleibt ohne erreichbares Ziel.
    if (response.ok()) {
      const session = await response.json() as { id: string };
      await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    }
    const slots = await (await request.get("/api/v1/previews/slots", { headers: previewIdentity })).json() as { slots: Array<{ publicUrl: string }> };
    for (const slot of slots.slots) expect(slot.publicUrl.startsWith("http")).toBeTruthy();
  });

  test("teilt identische Sessions und trennt unterschiedliche Ziele", async ({ request }) => {
    const shared = { projectId: null, primaryPort: fixturePorts.mpa, primaryProtocol: "http", isolate: false, storageProfileId: null };
    const first = await (await request.post("/api/v1/previews/sessions", { headers: previewIdentity, data: { ...shared, sessionKey: "e2e-share-a" } })).json() as { id: string; bindings: Array<{ slotId: number }> };
    const second = await (await request.post("/api/v1/previews/sessions", { headers: previewIdentity, data: { ...shared, sessionKey: "e2e-share-b" } })).json() as { id: string; bindings: Array<{ slotId: number }> };
    expect(second.bindings[0]!.slotId).toBe(first.bindings[0]!.slotId);

    const other = await (await request.post("/api/v1/previews/sessions", { headers: previewIdentity, data: { ...shared, sessionKey: "e2e-share-c", primaryPort: fixturePorts.api } })).json() as { id: string; bindings: Array<{ slotId: number }> };
    expect(other.bindings[0]!.slotId).not.toBe(first.bindings[0]!.slotId);

    for (const session of [first, second, other]) {
      await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    }
  });

  test("liefert MPA-Routen, Assets und Redirects über die Slot-Origin", async ({ request }) => {
    const session = await (await request.post("/api/v1/previews/sessions", {
      headers: previewIdentity,
      data: { sessionKey: "e2e-mpa", projectId: null, primaryPort: fixturePorts.mpa, primaryProtocol: "http", isolate: true, storageProfileId: null },
    })).json() as { id: string; bindings: Array<{ slotId: number }> };
    const slots = await (await request.get("/api/v1/previews/slots", { headers: previewIdentity })).json() as { slots: Array<{ id: number; internalPort: number }> };
    const internalPort = slots.slots.find((slot) => slot.id === session.bindings[0]!.slotId)!.internalPort;

    const start = await request.get(`http://127.0.0.1:${internalPort}/`);
    expect(await start.text()).toContain("styles.css");
    const admin = await request.get(`http://127.0.0.1:${internalPort}/admin`);
    expect(await admin.text()).toContain("Adminbereich");
    const asset = await request.get(`http://127.0.0.1:${internalPort}/styles.css`);
    expect(asset.headers()["content-type"]).toContain("text/css");

    await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
  });

  test("hält Gerätepräferenz und Slot-Override auseinander", async ({ request }) => {
    const saved = await request.put("/api/v1/previews/device-preference", {
      headers: previewIdentity,
      data: { deviceId: "iphone-15", orientation: "portrait" },
    });
    expect(saved.ok()).toBeTruthy();
    const preference = await (await request.get("/api/v1/previews/device-preference", { headers: previewIdentity })).json() as { deviceId: string };
    expect(preference.deviceId).toBe("iphone-15");
    await request.put("/api/v1/previews/device-preference", { headers: previewIdentity, data: { deviceId: "iphone-13", orientation: "portrait" } });
  });

  test("nimmt Diagnose-Batches an und redigiert Secrets", async ({ request }) => {
    // Diagnose ist im isolierten E2E-Server aktiviert; ein Batch braucht deshalb
    // eine echte, dem Benutzer gehörende Preview-Session.
    const opened = await request.post("/api/v1/previews/sessions", {
      headers: previewIdentity,
      data: { sessionKey: "e2e-diagnose", projectId: null, primaryPort: fixturePorts.spa, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    expect(opened.ok()).toBeTruthy();
    const session = await opened.json() as { id: string };
    try {
      const response = await request.post("/api/v1/previews/diagnostics/batches", {
        headers: previewIdentity,
        data: {
          previewNodeId: "e2e-node",
          sessionId: session.id,
          droppedSinceLastBatch: 0,
          events: [{
            id: "44444444-4444-4444-8444-444444444444",
            at: new Date().toISOString(),
            source: "client",
            category: "console",
            severity: "error",
            message: "Antwort mit Authorization: Bearer geheim",
            metadata: { Cookie: "sid=1" },
          }],
        },
      });
      expect(response.ok()).toBeTruthy();
      const listed = await (await request.get("/api/v1/previews/diagnostics?previewNodeId=e2e-node", { headers: previewIdentity })).json() as { events: Array<{ message: string }> };
      for (const event of listed.events) expect(event.message).not.toContain("geheim");
    } finally {
      await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    }
  });

  test("verweigert Preview-Zugriff ohne Identität", async ({ request }) => {
    test.skip(!process.env.WORKBENCH_E2E_URL, "Die isolierte Testinstanz nutzt bewusst eine Entwicklungsidentität.");
    const response = await request.get("/api/v1/previews/slots");
    expect(response.status()).toBe(401);
  });

  test("recycelt belegte Slot-Origins und öffnet die Hub-Preview direkt in einem neuen Tab und Fenster", async ({ page, request }) => {
    const initialSlots = await (await request.get("/api/v1/previews/slots", { headers: previewIdentity })).json() as {
      slots: Array<{ affinityStatus: "none" | "own" | "foreign" | "quarantined" }>;
    };
    const unusedSlotCount = initialSlots.slots.filter((slot) => slot.affinityStatus === "none").length;
    for (let index = 0; index < unusedSlotCount; index += 1) {
      const opened = await request.post("/api/v1/previews/sessions", {
        headers: previewIdentity,
        data: { sessionKey: `e2e-alt-${index}`, projectId: `altes-projekt-${index}`, primaryPort: fixturePorts.spa, primaryProtocol: "http", isolate: true, storageProfileId: null },
      });
      expect(opened.ok()).toBeTruthy();
      const session = await opened.json() as { id: string };
      await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    }

    const saved = await request.put("/api/v1/previews/dev-servers/remote-workplace/main-port", {
      headers: previewIdentity,
      data: { mainPort: fixturePorts.spa },
    });
    expect(saved.ok()).toBeTruthy();

    await page.goto("/workbench/previews");
    await expect(page.getByRole("heading", { name: "Preview Übersicht" })).toHaveCount(0);
    await expect(page.locator(".topbar").getByRole("button", { name: /Projekt\s+Remote Workplace/ })).toBeVisible();

    const publicUrl = page.locator(".preview-hub-urlbar code");
    await expect(publicUrl).toHaveText(/^https?:\/\/[^/]+:\d+\/$/);
    const expectedUrl = await publicUrl.textContent();
    expect(expectedUrl).not.toBeNull();

    const tabPromise = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Im neuen Tab" }).click();
    const tab = await tabPromise;
    await expect(tab).toHaveURL(expectedUrl!);
    await expect(tab.getByText("SPA bereit")).toBeVisible();
    await tab.close();

    const windowPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Im neuen Fenster" }).click();
    const previewWindow = await windowPromise;
    await expect(previewWindow).toHaveURL(expectedUrl!);
    await expect(previewWindow.getByText("SPA bereit")).toBeVisible();
    await previewWindow.close();
  });
});
